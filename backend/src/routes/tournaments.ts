import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { tournamentService } from '../services/tournamentService'

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
  fastify.post('/tournaments', async (request, reply) => {
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
      inviteState: participant.inviteState ?? (participant.userId ? 'INVITED' : 'LOCAL'),
      seed: participant.seed
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

    // Create a Placeholder Participant for empty slots
    const placeholder = await fastify.prisma.tournamentParticipant.create({
      data: {
        tournamentId: tournament.id,
        alias: 'TBD',
        inviteState: 'PLACEHOLDER',
        userId: null
      }
    })

    // Generate Full Bracket
    if (tournament.participants.length >= 2) {
      // Sort participants by ID to ensure they are in the order of creation (which matches input order)
      // This is our "Seed Order" (Seed 1, Seed 2, ...)
      const sortedParticipants = [...tournament.participants].sort((a, b) => a.id - b.id)
      
      // Reorder participants based on seeding logic, padding with Byes (nulls)
      const seededParticipants = tournamentService.padWithBye(sortedParticipants)
      
      const matchesToCreate = []
      let currentRoundMatchesCount = 0

      // Round 1
      for (let i = 0; i < seededParticipants.length; i += 2) {
        const playerA = seededParticipants[i];
        const playerB = seededParticipants[i+1]; // Can be null (Bye)

        if (playerA && playerB) {
          matchesToCreate.push({
            tournamentId: tournament.id,
            round: 1,
            playerAId: playerA.id,
            playerBId: playerB.id,
            status: 'PENDING'
          })
          currentRoundMatchesCount++
        } else if (playerA && !playerB) {
          // Player A gets a Bye -> Replace with AI
          const aiParticipant = await fastify.prisma.tournamentParticipant.create({
            data: {
              tournamentId: tournament.id,
              alias: 'AI',
              inviteState: 'AI',
              userId: null
            }
          })

          matchesToCreate.push({
            tournamentId: tournament.id,
            round: 1,
            playerAId: playerA.id,
            playerBId: aiParticipant.id,
            status: 'PENDING'
          })
          currentRoundMatchesCount++
        }
      }

      // Generate subsequent rounds (empty placeholders)
      let round = 2
      let matchesInRound = currentRoundMatchesCount
      
      // If we have N matches in Round 1, we need N/2 matches in Round 2, etc.
      // Wait, if we have Byes, the number of matches in Round 1 might be less than Size/2?
      // No, padWithBye ensures size is power of 2.
      // So seededParticipants.length is power of 2 (e.g. 4, 8, 16).
      // Matches in Round 1 = Size / 2.
      
      matchesInRound = seededParticipants.length / 2
      
      while (matchesInRound > 1) {
        matchesInRound /= 2
        for (let i = 0; i < matchesInRound; i++) {
            matchesToCreate.push({
                tournamentId: tournament.id,
                round: round,
                playerAId: placeholder.id,
                playerBId: placeholder.id,
                status: 'PENDING'
            })
        }
        round++
      }
      // Add Final Match (if not added by loop, e.g. if matchesInRound became 1)
      // The loop condition `matchesInRound > 1` stops when matchesInRound becomes 1.
      // But we need to create that 1 match.
      // Example: 4 players. Round 1 has 2 matches.
      // Loop: matchesInRound = 2.
      // matchesInRound /= 2 => 1.
      // Loop runs once. Creates 1 match for Round 2.
      // Loop condition `1 > 1` is false. Stops.
      // Correct.

      if (matchesToCreate.length > 0) {
        await fastify.prisma.tournamentMatch.createMany({
          data: matchesToCreate
        })
      }
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

  fastify.get('/tournaments', async (request, reply) => {
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

  fastify.get('/tournaments/:id', async (request, reply) => {
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

  fastify.post('/tournaments/matches/:matchId/result', async (request, reply) => {
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
