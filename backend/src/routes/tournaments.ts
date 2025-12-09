import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { tournamentService } from '../services/tournamentService'
import { presenceService } from '../services/presence'
import { notificationService } from '../services/notification'

const STATUS_VALUES = ['DRAFT', 'READY', 'RUNNING', 'COMPLETED'] as const
const BRACKET_VALUES = ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION'] as const

const createTournamentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3)
    .max(80),
  createdById: z.coerce.number().int().positive(),
  bracketType: z.enum(BRACKET_VALUES).default('SINGLE_ELIMINATION'),
  startsAt: z.string().datetime().optional(),
  participants: z
    .array(
      z.object({
        alias: z.string().trim().min(1).max(50),
        userId: z.coerce.number().int().positive().optional(),
        inviteState: z.string().trim().min(1).max(32).optional(),
        seed: z.coerce.number().int().min(1).max(256).optional()
      })
    )
    .max(64)
    .optional()
})

const listQuerySchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  ownerId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).default(20)
})

const detailParamSchema = z.object({
  id: z.coerce.number().int().positive()
})

const matchResultSchema = z.object({
  winnerId: z.coerce.number().int().positive(),
  scoreA: z.coerce.number().int().min(0).optional(),
  scoreB: z.coerce.number().int().min(0).optional()
})

const matchParamSchema = z.object({
  matchId: z.coerce.number().int().positive()
})

const tournamentsRoutes: FastifyPluginAsync = async (fastify) => {
  // In-memory timers for INVITED participants (participantId -> Timeout)
  const inviteTimers = new Map<number, NodeJS.Timeout>()

  const generateBracket = async (tournamentId: number) => {
    const participants = await fastify.prisma.tournamentParticipant.findMany({
      where: { tournamentId },
      orderBy: { id: 'asc' }
    })

    if (participants.length < 2) return

    const seededParticipants = tournamentService.padWithBye([...participants])

    let placeholderId: number | null = null
    if (seededParticipants.length > 2) {
      const placeholder = await fastify.prisma.tournamentParticipant.create({
        data: {
          tournamentId,
          alias: 'TBD',
          inviteState: 'PLACEHOLDER',
          userId: null
        }
      })
      placeholderId = placeholder.id
    }

    const matchesToCreate: Array<any> = []
    let currentRoundMatchesCount = 0

    // Round 1
    for (let i = 0; i < seededParticipants.length; i += 2) {
      const playerA = seededParticipants[i]
      const playerB = seededParticipants[i + 1]

      if (playerA && playerB) {
        matchesToCreate.push({
          tournamentId,
          round: 1,
          playerAId: playerA.id,
          playerBId: playerB.id,
          status: 'PENDING'
        })
        currentRoundMatchesCount++
      } else if (playerA && !playerB) {
        const aiParticipant = await fastify.prisma.tournamentParticipant.create({
          data: {
            tournamentId,
            alias: 'AI',
            inviteState: 'AI',
            userId: null
          }
        })

        matchesToCreate.push({
          tournamentId,
          round: 1,
          playerAId: playerA.id,
          playerBId: aiParticipant.id,
          status: 'PENDING'
        })
        currentRoundMatchesCount++
      }
    }

    let round = 2
    let matchesInRound = seededParticipants.length / 2

    while (matchesInRound > 1) {
      if (!placeholderId) {
        const placeholder = await fastify.prisma.tournamentParticipant.create({
          data: {
            tournamentId,
            alias: 'TBD',
            inviteState: 'PLACEHOLDER',
            userId: null
          }
        })
        placeholderId = placeholder.id
      }

      matchesInRound /= 2
      for (let i = 0; i < matchesInRound; i++) {
        matchesToCreate.push({
          tournamentId,
          round,
          playerAId: placeholderId,
          playerBId: placeholderId,
          status: 'PENDING'
        })
      }
      round++
    }

    if (matchesToCreate.length > 0) {
      await fastify.prisma.tournamentMatch.createMany({ data: matchesToCreate })
    }
  }

  const scheduleInviteExpiry = (participantId: number) => {
    // clear existing
    if (inviteTimers.has(participantId)) {
      clearTimeout(inviteTimers.get(participantId)!)
    }
    const ttl = Number(process.env.TOURNAMENT_INVITE_TTL_SEC || 20)
    const t = setTimeout(async () => {
      try {
        const p = await fastify.prisma.tournamentParticipant.findUnique({ where: { id: participantId } })
        if (!p) return
        if (p.inviteState === 'INVITED') {
          await fastify.prisma.tournamentParticipant.update({ where: { id: participantId }, data: { inviteState: 'DECLINED' } })
          // notify owner
          const tournament = await fastify.prisma.tournament.findUnique({ where: { id: p.tournamentId }, select: { createdById: true, name: true } })
          if (tournament) {
            await notificationService.createNotification(
              tournament.createdById,
              'TOURNAMENT_INVITE',
              'Invite expired',
              `Invite for ${p.alias} expired for tournament ${tournament.name}`,
              { tournamentId: p.tournamentId, participantId }
            )
            fastify.log.info({ participantId }, 'Invite expired and marked DECLINED')
          }
        }
      } catch (e) {
        fastify.log.error(e)
      } finally {
        inviteTimers.delete(participantId)
      }
    }, ttl * 1000)

    inviteTimers.set(participantId, t)
  }

  fastify.post('/', async (request, reply) => {
    const parsed = createTournamentSchema.safeParse(request.body)

    if (!parsed.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_BODY',
          message: 'Invalid tournament payload',
          details: parsed.error.flatten().fieldErrors
        }
      }
    }

    const data = parsed.data
    const creator = await fastify.prisma.user.findUnique({
      where: { id: data.createdById },
      select: { id: true }
    })

    if (!creator) {
      reply.code(404)
      return {
        error: {
          code: 'CREATOR_NOT_FOUND',
          message: 'Creator user does not exist'
        }
      }
    }

    const participantsPayload = data.participants?.map((participant) => ({
      alias: participant.alias,
      userId: participant.userId,
      inviteState:
        participant.inviteState ??
        (participant.userId
          ? participant.userId === data.createdById
            ? 'ACCEPTED'
            : 'INVITED'
          : 'LOCAL'),
      seed: participant.seed,
      joinedAt: participant.userId === data.createdById ? new Date() : undefined
    }))

    const tournament = await fastify.prisma.tournament.create({
      data: {
        name: data.name,
        createdById: data.createdById,
        bracketType: data.bracketType,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        participants: participantsPayload && participantsPayload.length > 0 ? { create: participantsPayload } : undefined
      },
      include: {
        _count: { select: { participants: true } },
        createdBy: { select: { id: true, displayName: true } },
        participants: true
      }
    })

    // Auto-send invites for participants provided at creation time (skip owner)
    const initialInvites = tournament.participants.filter(
      (p) => p.userId && p.inviteState === 'INVITED' && p.userId !== data.createdById
    )

    for (const participant of initialInvites) {
      scheduleInviteExpiry(participant.id)

      await notificationService.createNotification(
        participant.userId!,
        'TOURNAMENT_INVITE',
        'Tournament Invite',
        `${tournament.createdBy.displayName} invited you to ${tournament.name}`,
        { tournamentId: tournament.id, participantId: participant.id, inviterId: tournament.createdBy.id }
      )
    }

    reply.code(201)
    return {
      data: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        bracketType: tournament.bracketType,
        startsAt: tournament.startsAt ? tournament.startsAt.toISOString() : null,
        owner: {
          id: tournament.createdBy.id,
          displayName: tournament.createdBy.displayName
        },
        participantCount: tournament._count.participants
      }
    }
  })

  // Invite endpoints: POST /tournaments/:id/invite and PATCH participant action
  const inviteBodySchema = z.object({ userId: z.coerce.number().int().positive() })

  fastify.post('/:id/invite', { preHandler: [
    fastify.authenticate,
    // wrapper to call rejectIfInGame decorator if present
    async (req, reply) => { const fn = (fastify as any).rejectIfInGame; if (typeof fn === 'function') return await fn(req, reply) }
  ] }, async (request, reply) => {
    const params = detailParamSchema.safeParse(request.params)
    const body = inviteBodySchema.safeParse(request.body)

    if (!params.success || !body.success) {
      reply.code(400)
      return { error: { code: 'INVALID_REQUEST', message: 'Invalid params or body' } }
    }

    const tournamentId = params.data.id
    const targetUserId = body.data.userId
    const inviterId = request.user?.userId
    if (!inviterId) {
      reply.code(401)
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    const tournament = await fastify.prisma.tournament.findUnique({ where: { id: tournamentId } })
    if (!tournament) {
      reply.code(404)
      return { error: { code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found' } }
    }

    if (tournament.createdById !== inviterId) {
      reply.code(403)
      return { error: { code: 'FORBIDDEN', message: 'Only tournament owner can invite' } }
    }

    // verify target exists
    const targetUser = await fastify.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, displayName: true } })
    if (!targetUser) {
      reply.code(404)
      return { error: { code: 'USER_NOT_FOUND', message: 'Target user not found' } }
    }

    // verify friendship
    const friendship = await fastify.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: inviterId, addresseeId: targetUserId, status: 'ACCEPTED' },
          { requesterId: targetUserId, addresseeId: inviterId, status: 'ACCEPTED' }
        ]
      }
    })

    if (!friendship) {
      reply.code(403)
      return { error: { code: 'NOT_FRIEND', message: 'Can only invite friends' } }
    }

    // only online friends can be invited
    const online = await presenceService.isOnline(targetUserId)
    if (!online) {
      reply.code(400)
      return { error: { code: 'USER_OFFLINE', message: 'Target user is offline' } }
    }

    // ensure not already participating
    const existing = await fastify.prisma.tournamentParticipant.findFirst({ where: { tournamentId, userId: targetUserId } })
    if (existing) {
      reply.code(409)
      return { error: { code: 'ALREADY_PARTICIPANT', message: 'User already participant' } }
    }

    // create participant with INVITED state
    const participant = await fastify.prisma.tournamentParticipant.create({
      data: {
        tournamentId,
        userId: targetUserId,
        alias: targetUser.displayName,
        inviteState: 'INVITED'
      }
    })

    // schedule TTL expiry
    scheduleInviteExpiry(participant.id)

    // create notification which will be emitted over WS by notificationService -> chatWs
    await notificationService.createNotification(
      targetUserId,
      'TOURNAMENT_INVITE',
      'Tournament Invite',
      `${(request.user as any).displayName || 'Someone'} invited you to a tournament`,
      { tournamentId, participantId: participant.id, inviterId }
    )

    reply.code(201)
    return { data: { id: participant.id, tournamentId, userId: targetUserId, alias: participant.alias, inviteState: participant.inviteState } }
  })

  const participantActionSchema = z.object({ action: z.enum(['ACCEPT', 'DECLINE']) })

  fastify.patch('/:id/participants/:participantId', { preHandler: [
    fastify.authenticate,
    async (req, reply) => { const fn = (fastify as any).rejectIfInGame; if (typeof fn === 'function') return await fn(req, reply) }
  ] }, async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive(), participantId: z.coerce.number().int().positive() }).safeParse(request.params)
    const body = participantActionSchema.safeParse(request.body)

    if (!params.success || !body.success) {
      reply.code(400)
      return { error: { code: 'INVALID_REQUEST', message: 'Invalid params or body' } }
    }

    const participant = await fastify.prisma.tournamentParticipant.findUnique({ where: { id: params.data.participantId } })
    if (!participant) {
      reply.code(404)
      return { error: { code: 'PARTICIPANT_NOT_FOUND', message: 'Participant not found' } }
    }

    const callerId = request.user?.userId
    if (!callerId) {
      reply.code(401)
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    if (participant.userId !== callerId) {
      reply.code(403)
      return { error: { code: 'FORBIDDEN', message: 'Only invited user can accept/decline' } }
    }

    if (body.data.action === 'ACCEPT') {
      // cancel TTL timer if any
      if (inviteTimers.has(participant.id)) {
        clearTimeout(inviteTimers.get(participant.id)!)
        inviteTimers.delete(participant.id)
      }
      const updated = await fastify.prisma.tournamentParticipant.update({ where: { id: participant.id }, data: { inviteState: 'ACCEPTED', joinedAt: new Date() } })
      return { data: updated }
    } else {
      // DECLINE: mark declined and notify owner; allow owner to re-invite
      if (inviteTimers.has(participant.id)) {
        clearTimeout(inviteTimers.get(participant.id)!)
        inviteTimers.delete(participant.id)
      }
      const updated = await fastify.prisma.tournamentParticipant.update({ where: { id: participant.id }, data: { inviteState: 'DECLINED' } })
      const tournament = await fastify.prisma.tournament.findUnique({ where: { id: participant.tournamentId }, select: { createdById: true, name: true } })
      if (tournament) {
        await notificationService.createNotification(
          tournament.createdById,
          'TOURNAMENT_INVITE',
          'Invite declined',
          `${(request.user as any).displayName || 'A user'} declined invite for ${tournament.name}`,
          { tournamentId: participant.tournamentId, participantId: updated.id }
        )
      }
      return { data: updated }
    }
  })

  fastify.post('/:id/start', { preHandler: [
    fastify.authenticate,
    async (req, reply) => { const fn = (fastify as any).rejectIfInGame; if (typeof fn === 'function') return await fn(req, reply) }
  ] }, async (request, reply) => {
    const params = detailParamSchema.safeParse(request.params)
    if (!params.success) {
      reply.code(400)
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid tournament id' } }
    }

    const callerId = request.user?.userId
    if (!callerId) {
      reply.code(401)
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    const tournament = await fastify.prisma.tournament.findUnique({
      where: { id: params.data.id },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        participants: true,
        matches: true
      }
    })

    if (!tournament) {
      reply.code(404)
      return { error: { code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found' } }
    }

    if (tournament.createdById !== callerId) {
      reply.code(403)
      return { error: { code: 'FORBIDDEN', message: 'Only tournament owner can start' } }
    }

    if (tournament.status !== 'DRAFT') {
      reply.code(409)
      return { error: { code: 'ALREADY_STARTED', message: 'Tournament already started' } }
    }

    const pending = tournament.participants.filter((p) => p.userId && p.inviteState !== 'ACCEPTED')
    if (pending.length > 0) {
      reply.code(409)
      return {
        error: {
          code: 'INVITES_PENDING',
          message: 'All invited friends must accept before starting'
        }
      }
    }

    if (tournament.participants.length < 2) {
      reply.code(400)
      return { error: { code: 'NOT_ENOUGH_PARTICIPANTS', message: 'At least 2 participants required' } }
    }

    if (tournament.matches.length === 0) {
      await generateBracket(tournament.id)
    }

    const updated = await fastify.prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: 'RUNNING', startsAt: tournament.startsAt ?? new Date() },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        participants: {
          orderBy: [{ seed: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            alias: true,
            userId: true,
            inviteState: true,
            seed: true,
            joinedAt: true
          }
        },
        matches: {
          orderBy: [{ round: 'asc' }, { id: 'asc' }],
          include: {
            playerA: { select: { id: true, alias: true, inviteState: true } },
            playerB: { select: { id: true, alias: true, inviteState: true } }
          }
        }
      }
    })

    // Notify participants about their round 1 matches so they can join
    const participantLookup = new Map(updated.participants.map((p) => [p.id, p]))
    const roundOneMatches = updated.matches.filter((match) => match.round === 1)
    const notifyPromises: Promise<any>[] = []

    for (const match of roundOneMatches) {
      const sessionId = `local-match-${match.id}`
      const playerA = match.playerA ? participantLookup.get(match.playerA.participantId) : null
      const playerB = match.playerB ? participantLookup.get(match.playerB.participantId) : null

      const payload = {
        tournamentId: updated.id,
        matchId: match.id,
        sessionId,
        p1Id: playerA?.id ?? null,
        p2Id: playerB?.id ?? null,
        p1Name: match.playerA?.alias ?? 'Player 1',
        p2Name: match.playerB?.alias ?? 'Player 2',
        mode: 'remote'
      }

      const title = 'Tournament match ready'
      const body = `${payload.p1Name} vs ${payload.p2Name}`

      if (playerA?.userId) {
        notifyPromises.push(
          notificationService.createNotification(playerA.userId, 'TOURNAMENT_MATCH_READY', title, body, payload)
        )
      }
      if (playerB?.userId) {
        notifyPromises.push(
          notificationService.createNotification(playerB.userId, 'TOURNAMENT_MATCH_READY', title, body, payload)
        )
      }
    }

    if (notifyPromises.length > 0) {
      // Fire and wait to ensure WS emission before responding
      await Promise.allSettled(notifyPromises)
    }

    return {
      data: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
        bracketType: updated.bracketType,
        startsAt: updated.startsAt ? updated.startsAt.toISOString() : null,
        owner: {
          id: updated.createdBy.id,
          displayName: updated.createdBy.displayName
        },
        participants: updated.participants.map((participant) => ({
          id: participant.id,
          alias: participant.alias,
          userId: participant.userId,
          inviteState: participant.inviteState,
          seed: participant.seed,
          joinedAt: participant.joinedAt.toISOString()
        })),
        matches: updated.matches.map((match) => ({
          id: match.id,
          round: match.round,
          status: match.status,
          scheduledAt: match.scheduledAt ? match.scheduledAt.toISOString() : null,
          playerA: match.playerA
            ? {
                participantId: match.playerA.id,
                alias: match.playerA.alias,
                inviteState: match.playerA.inviteState
              }
            : null,
          playerB: match.playerB
            ? {
                participantId: match.playerB.id,
                alias: match.playerB.alias,
                inviteState: match.playerB.inviteState
              }
            : null,
          winnerId: match.winnerId,
          scoreA: match.scoreA,
          scoreB: match.scoreB
        }))
      }
    }
  })

  fastify.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query)

    if (!parsed.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_QUERY',
          message: 'Invalid query parameters',
          details: parsed.error.flatten().fieldErrors
        }
      }
    }

    const { status, ownerId, page, limit: rawLimit } = parsed.data
    const limit = Math.min(rawLimit, 50)
    const skip = (page - 1) * limit

    const where: { status?: string; createdById?: number } = {}
    if (status) {
      where.status = status
    }
    if (ownerId) {
      where.createdById = ownerId
    }

    const [total, tournaments] = await fastify.prisma.$transaction([
      fastify.prisma.tournament.count({ where }),
      fastify.prisma.tournament.findMany({
        where,
        include: {
          _count: { select: { participants: true } },
          createdBy: { select: { id: true, displayName: true } }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit
      })
    ])

    return {
      data: tournaments.map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        bracketType: tournament.bracketType,
        startsAt: tournament.startsAt ? tournament.startsAt.toISOString() : null,
        owner: {
          id: tournament.createdBy.id,
          displayName: tournament.createdBy.displayName
        },
        participantCount: tournament._count.participants
      })),
      meta: {
        page,
        limit,
        total
      }
    }
  })

  fastify.get('/:id', async (request, reply) => {
    const parsed = detailParamSchema.safeParse(request.params)

    if (!parsed.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_PARAMS',
          message: 'Invalid tournament id',
          details: parsed.error.flatten().fieldErrors
        }
      }

    }

    const tournament = await fastify.prisma.tournament.findUnique({
      where: { id: parsed.data.id },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        participants: {
          orderBy: [{ seed: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            alias: true,
            userId: true,
            inviteState: true,
            seed: true,
            joinedAt: true
          }
        },
        matches: {
          orderBy: [{ round: 'asc' }, { id: 'asc' }],
          include: {
            playerA: { select: { id: true, alias: true, inviteState: true } },
            playerB: { select: { id: true, alias: true, inviteState: true } }
          }
        }
      }
    })

    if (!tournament) {
      reply.code(404)
      return {
        error: {
          code: 'TOURNAMENT_NOT_FOUND',
          message: 'Tournament not found'
        }
      }
    }

    return {
      data: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        bracketType: tournament.bracketType,
        startsAt: tournament.startsAt ? tournament.startsAt.toISOString() : null,
        owner: {
          id: tournament.createdBy.id,
          displayName: tournament.createdBy.displayName
        },
        participants: tournament.participants.map((participant) => ({
          id: participant.id,
          alias: participant.alias,
          userId: participant.userId,
          inviteState: participant.inviteState,
          seed: participant.seed,
          joinedAt: participant.joinedAt.toISOString()
        })),
        matches: tournament.matches.map((match) => ({
          id: match.id,
          round: match.round,
          status: match.status,
          scheduledAt: match.scheduledAt ? match.scheduledAt.toISOString() : null,
          playerA: match.playerA ? {
            participantId: match.playerA.id,
            alias: match.playerA.alias,
            inviteState: match.playerA.inviteState
          } : null,
          playerB: match.playerB ? {
            participantId: match.playerB.id,
            alias: match.playerB.alias,
            inviteState: match.playerB.inviteState
          } : null,
          winnerId: match.winnerId,
          scoreA: match.scoreA,
          scoreB: match.scoreB
        }))
      }
    }
  })

  fastify.post('/matches/:matchId/result', async (request, reply) => {
    const params = matchParamSchema.safeParse(request.params)
    const body = matchResultSchema.safeParse(request.body)

    if (!params.success || !body.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid parameters or body',
          details: {
             params: params.success ? null : params.error.flatten().fieldErrors,
             body: body.success ? null : body.error.flatten().fieldErrors
          }
        }
      }
    }

    try {
      await tournamentService.handleMatchResult(
        params.data.matchId,
        body.data.winnerId,
        body.data.scoreA,
        body.data.scoreB
      )
      reply.code(200).send({ success: true })
    } catch (error: any) {
      if (error.message === 'Match not found') {
        reply.code(404).send({ error: { code: 'MATCH_NOT_FOUND', message: error.message } })
      } else if (error.message === 'Winner is not a participant of this match') {
        reply.code(400).send({ error: { code: 'INVALID_WINNER', message: error.message } })
      } else if (error.message === 'SCORES_REQUIRED') {
        reply.code(400).send({ error: { code: 'SCORES_REQUIRED', message: 'Both scoreA and scoreB must be provided' } })
      } else {
        request.log.error(error)
        reply.code(500).send({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } })
      }
    }
  })
}

export default tournamentsRoutes

/*
解説:

1) createTournamentSchema / listQuerySchema / detailParamSchema
  - POST・GET一覧・GET詳細の各入力を Zod で定義し、Fastify に渡る前に数値/文字列の妥当性を検証する。

2) /api/tournaments (POST/GET)
  - 作成エンドポイントでは作成者存在チェックと参加者のネスト作成を行い、一覧エンドポイントではページングとフィルタを Prisma トランザクションで実現する。

3) /api/tournaments/:id
  - 参加者・試合を所定の順序で取得し、API ドキュメント準拠の JSON へ変換する。存在しない ID は 404, フォーマット不正は 400 を返し、クライアントに一貫したエラーコードを提供する。
*/
