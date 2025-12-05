import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { pipeline } from 'stream/promises'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { userService } from '../services/user'

const STATUS_VALUES = ['OFFLINE', 'ONLINE', 'IN_MATCH', 'AWAY', 'DO_NOT_DISTURB'] as const

const searchQuerySchema = z.object({
  q: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(64))
    .optional(),
  statuses: z.string().optional(), // Comma separated values
  relationships: z.string().optional(), // Comma separated values: friends,blocked,none
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).default(20),
  excludeFriendIds: z.string().optional(),
  sortBy: z.enum(['displayName', 'createdAt']).default('displayName'),
  order: z.enum(['asc', 'desc']).default('asc')
})

type SearchQuery = z.infer<typeof searchQuerySchema>

const parseExcludeIds = (excludeFriendIds?: string) => {
  if (!excludeFriendIds) return [] as number[]

  return excludeFriendIds
    .split(',')
    .map((chunk) => Number(chunk.trim()))
    .filter((id) => Number.isInteger(id) && id > 0)
}

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(32).optional(),
  bio: z.string().trim().max(255).optional(),
  avatarUrl: z.union([z.string().trim(), z.literal('')]).optional()
})

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const paramsSchema = z.object({
    id: z.union([
      z.coerce.number().int().positive(),
      z.string().trim().min(3)
    ])
  })

  fastify.patch('/users/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const paramsParsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params)
    if (!paramsParsed.success) {
      reply.code(400)
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid user ID' } }
    }

    const { id: targetId } = paramsParsed.data
    const viewerId = request.user.userId

    if (targetId !== viewerId) {
      reply.code(403)
      return { error: { code: 'FORBIDDEN', message: 'You can only edit your own profile' } }
    }

    const bodyParsed = updateProfileSchema.safeParse(request.body)
    if (!bodyParsed.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_BODY',
          message: 'Invalid request body',
          details: bodyParsed.error.flatten().fieldErrors
        }
      }
    }

    const { displayName, bio, avatarUrl: rawAvatarUrl } = bodyParsed.data
    const avatarUrl = rawAvatarUrl === '' ? null : rawAvatarUrl

    // Check if displayName is taken (if changed)
    if (displayName) {
      const existing = await fastify.prisma.user.findFirst({
        where: {
          displayName,
          id: { not: viewerId }
        }
      })
      if (existing) {
        reply.code(409)
        return { error: { code: 'DISPLAY_NAME_TAKEN', message: 'Display name is already taken' } }
      }
    }

    const updatedUser = await fastify.prisma.user.update({
      where: { id: viewerId },
      data: {
        displayName,
        bio,
        avatarUrl
      },
      select: {
        id: true,
        displayName: true,
        login: true,
        status: true,
        avatarUrl: true,
        bio: true,
        country: true
      }
    })

    userService.emitUserUpdated(updatedUser)

    return updatedUser
  })

  fastify.post('/users/:id/avatar', { preHandler: fastify.authenticate }, async (request, reply) => {
    const paramsParsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params)
    if (!paramsParsed.success) {
      reply.code(400)
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid user ID' } }
    }

    const { id: targetId } = paramsParsed.data
    const viewerId = request.user.userId

    if (targetId !== viewerId) {
      reply.code(403)
      return { error: { code: 'FORBIDDEN', message: 'You can only edit your own profile' } }
    }

    const data = await request.file()
    if (!data) {
      reply.code(400)
      return { error: { code: 'NO_FILE', message: 'No file uploaded' } }
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedMimeTypes.includes(data.mimetype)) {
      reply.code(400)
      return { error: { code: 'INVALID_FILE_TYPE', message: 'Only images are allowed' } }
    }

    const uploadsDir = path.join(process.cwd(), 'uploads')
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
    }

    const filename = `${randomUUID()}.png`
    const filepath = path.join(uploadsDir, filename)

    try {
      const transform = sharp().resize(256, 256, { fit: 'cover' }).png()
      await pipeline(data.file, transform, fs.createWriteStream(filepath))

      const avatarUrl = `/uploads/${filename}`

      const user = await fastify.prisma.user.findUnique({ where: { id: viewerId }, select: { avatarUrl: true } })
      if (user?.avatarUrl) {
        const oldFilename = user.avatarUrl.split('/').pop()
        if (oldFilename) {
          const oldPath = path.join(uploadsDir, oldFilename)
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath)
          }
        }
      }

      const updatedUser = await fastify.prisma.user.update({
        where: { id: viewerId },
        data: { avatarUrl },
        select: {
          id: true,
          displayName: true,
          login: true,
          status: true,
          avatarUrl: true,
          country: true,
          bio: true
        }
      })

      userService.emitUserUpdated(updatedUser)

      return updatedUser
    } catch (err) {
      request.log.error(err)
      reply.code(500)
      return { error: { code: 'UPLOAD_FAILED', message: 'Failed to process upload' } }
    }
  })

  fastify.delete('/users/:id/avatar', { preHandler: fastify.authenticate }, async (request, reply) => {
    const paramsParsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params)
    if (!paramsParsed.success) {
      reply.code(400)
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid user ID' } }
    }

    const { id: targetId } = paramsParsed.data
    const viewerId = request.user.userId

    if (targetId !== viewerId) {
      reply.code(403)
      return { error: { code: 'FORBIDDEN', message: 'You can only edit your own profile' } }
    }

    const user = await fastify.prisma.user.findUnique({ where: { id: viewerId }, select: { avatarUrl: true } })
    if (user?.avatarUrl) {
      const uploadsDir = path.join(process.cwd(), 'uploads')
      const oldFilename = user.avatarUrl.split('/').pop()
      if (oldFilename) {
        const oldPath = path.join(uploadsDir, oldFilename)
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath)
        }
      }
    }

    const updatedUser = await fastify.prisma.user.update({
      where: { id: viewerId },
      data: { avatarUrl: null },
      select: {
        id: true,
        displayName: true,
        login: true,
        status: true,
        avatarUrl: true,
        country: true,
        bio: true
      }
    })

    userService.emitUserUpdated(updatedUser)

    return updatedUser
  })

  fastify.get('/users/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params)
    if (!parsed.success) {
      reply.code(400)
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid user ID or username' } }
    }

    const { id: paramId } = parsed.data
    const viewerId = request.user.userId

    let whereInput: Prisma.UserWhereUniqueInput
    if (typeof paramId === 'number') {
      whereInput = { id: paramId, deletedAt: null }
    } else if (/^\d+$/.test(paramId)) {
      whereInput = { id: Number(paramId), deletedAt: null }
    } else {
      whereInput = { login: paramId, deletedAt: null }
    }

    const user = await fastify.prisma.user.findUnique({
      where: whereInput,
      select: {
        id: true,
        displayName: true,
        login: true,
        status: true,
        avatarUrl: true,
        country: true,
        bio: true,
        createdAt: true,
        stats: {
          select: {
            wins: true,
            losses: true,
            matchesPlayed: true,
            pointsScored: true,
            pointsAgainst: true
          }
        }
      }
    })

    if (!user) {
      reply.code(404)
      return { error: { code: 'USER_NOT_FOUND', message: 'User not found' } }
    }

    const targetId = user.id

    // Friendship Status
    let friendshipStatus: 'NONE' | 'FRIEND' | 'PENDING_SENT' | 'PENDING_RECEIVED' = 'NONE'
    let isBlockedByViewer = false
    let isBlockingViewer = false
    let friendRequestId: number | undefined

    if (viewerId !== targetId) {
      const [friendship, block, friendRequest] = await Promise.all([
        fastify.prisma.friendship.findFirst({
          where: {
            OR: [
              { requesterId: viewerId, addresseeId: targetId },
              { requesterId: targetId, addresseeId: viewerId }
            ]
          }
        }),
        fastify.prisma.blocklist.findFirst({
          where: {
            OR: [
              { blockerId: viewerId, blockedId: targetId },
              { blockerId: targetId, blockedId: viewerId }
            ]
          }
        }),
        fastify.prisma.friendRequest.findFirst({
          where: {
            OR: [
              { senderId: viewerId, receiverId: targetId, status: 'PENDING' },
              { senderId: targetId, receiverId: viewerId, status: 'PENDING' }
            ]
          }
        })
      ])

      if (friendship && friendship.status === 'ACCEPTED') {
        friendshipStatus = 'FRIEND'
      } else if (friendRequest) {
        friendshipStatus = friendRequest.senderId === viewerId ? 'PENDING_SENT' : 'PENDING_RECEIVED'
        if (friendshipStatus === 'PENDING_RECEIVED') {
          friendRequestId = friendRequest.id
        }
      }

      if (block) {
        if (block.blockerId === viewerId) isBlockedByViewer = true
        if (block.blockerId === targetId) isBlockingViewer = true
      }
    }

    // Mutual Friends
    let mutualFriends = 0
    if (viewerId !== targetId && !isBlockedByViewer && !isBlockingViewer) {
      // Get viewer's friends
      const viewerFriendships = await fastify.prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ requesterId: viewerId }, { addresseeId: viewerId }]
        },
        select: { requesterId: true, addresseeId: true }
      })
      const viewerFriendIds = viewerFriendships.map(f => f.requesterId === viewerId ? f.addresseeId : f.requesterId)

      if (viewerFriendIds.length > 0) {
        // Count how many of viewer's friends are also friends with target
        const mutuals = await fastify.prisma.friendship.count({
          where: {
            status: 'ACCEPTED',
            OR: [
              { requesterId: targetId, addresseeId: { in: viewerFriendIds } },
              { addresseeId: targetId, requesterId: { in: viewerFriendIds } }
            ]
          }
        })
        mutualFriends = mutuals
      }
    }

    return {
      ...user,
      friendshipStatus,
      friendRequestId,
      isBlockedByViewer,
      isBlockingViewer,
      mutualFriends
    }
  })

  fastify.get('/users/:id/matches', { preHandler: fastify.authenticate }, async (request, reply) => {
    const paramsParsed = z.object({
      id: z.union([
        z.coerce.number().int().positive(),
        z.string().trim().min(3)
      ])
    }).safeParse(request.params)

    if (!paramsParsed.success) {
      reply.code(400)
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid user ID or username' } }
    }

    const querySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).default(20)
    })

    const queryParsed = querySchema.safeParse(request.query)
    if (!queryParsed.success) {
      reply.code(400)
      return { error: { code: 'INVALID_QUERY', message: 'Invalid query parameters' } }
    }

    const { id: paramId } = paramsParsed.data
    const { page, limit } = queryParsed.data
    const skip = (page - 1) * limit

    let userId: number
    if (typeof paramId === 'number') {
      userId = paramId
    } else if (/^\d+$/.test(paramId)) {
      userId = Number(paramId)
    } else {
      const user = await fastify.prisma.user.findUnique({
        where: { login: paramId },
        select: { id: true }
      })
      if (!user) {
        reply.code(404)
        return { error: { code: 'USER_NOT_FOUND', message: 'User not found' } }
      }
      userId = user.id
    }

    const [total, matches] = await fastify.prisma.$transaction([
      fastify.prisma.match.count({
        where: {
          OR: [{ playerAId: userId }, { playerBId: userId }],
          status: 'FINISHED'
        }
      }),
      fastify.prisma.match.findMany({
        where: {
          OR: [{ playerAId: userId }, { playerBId: userId }],
          status: 'FINISHED'
        },
        include: {
          playerA: { select: { id: true, displayName: true, avatarUrl: true } },
          playerB: { select: { id: true, displayName: true, avatarUrl: true } },
          results: true,
          rounds: {
            select: {
              scoreA: true,
              scoreB: true
            }
          }
        },
        orderBy: { endedAt: 'desc' },
        skip,
        take: limit
      })
    ])

    const data = matches.map((match) => {
      const isPlayerA = match.playerAId === userId
      const opponentUser = isPlayerA ? match.playerB : match.playerA
      const opponentUserId = isPlayerA ? match.playerBId : match.playerAId

      // Determine opponent display info: prefer real user, otherwise use alias
      const pAAlias = (match as any).playerAAlias
      const pBAlias = (match as any).playerBAlias

      const opponent = {
        id: opponentUser ? opponentUser.id : (opponentUserId ?? null),
        displayName: opponentUser ? opponentUser.displayName : (isPlayerA ? pBAlias : pAAlias) ?? 'Guest',
        avatarUrl: opponentUser ? opponentUser.avatarUrl : null
      }

      // Derive final scores from aggregated rounds to avoid mismatches
      // that can happen when MatchResult entries are missing or out-of-order.
      const totalA = match.rounds?.reduce((acc, r) => acc + (r.scoreA ?? 0), 0) ?? 0
      const totalB = match.rounds?.reduce((acc, r) => acc + (r.scoreB ?? 0), 0) ?? 0

      let userScore = isPlayerA ? totalA : totalB
      let opponentScore = isPlayerA ? totalB : totalA

      // If rounds are not present (totals are zero), fall back to MatchResult entries
      // which are created when a match is saved by GameManager.
      if ((totalA + totalB) === 0) {
        const userResultEntry = match.results.find((r) => r.userId === userId)
        // Try to find opponent by userId if present, otherwise pick the other result entry
        let opponentResultEntry = typeof opponentUserId === 'number' ? match.results.find((r) => r.userId === opponentUserId) : undefined
        if (!opponentResultEntry && match.results.length > 0) {
          // If userResultEntry exists, pick the other entry as opponent; otherwise pick the first non-user entry
          opponentResultEntry = match.results.find((r) => r !== userResultEntry) ?? match.results[0]
        }

        if (userResultEntry && typeof userResultEntry.score === 'number') {
          userScore = userResultEntry.score
        }
        if (opponentResultEntry && typeof opponentResultEntry.score === 'number') {
          opponentScore = opponentResultEntry.score
        }
      }

      const userResult = match.results.find((r) => r.userId === userId)

      return {
        id: match.id,
        opponent,
        result: userResult?.outcome || 'UNKNOWN',
        score: `${userScore} - ${opponentScore}`,
        date: match.endedAt,
        mode: match.mode
      }
    })

    return {
      data,
      meta: { page, limit, total }
    }
  })

  fastify.get('/users/:id/friends', { preHandler: fastify.authenticate }, async (request, reply) => {
    const paramsParsed = z.object({
      id: z.union([
        z.coerce.number().int().positive(),
        z.string().trim().min(3)
      ])
    }).safeParse(request.params)

    if (!paramsParsed.success) {
      reply.code(400)
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid user ID or username' } }
    }

    const { id: paramId } = paramsParsed.data
    
    let userId: number
    if (typeof paramId === 'number') {
      userId = paramId
    } else if (/^\d+$/.test(paramId)) {
      userId = Number(paramId)
    } else {
      const user = await fastify.prisma.user.findUnique({
        where: { login: paramId },
        select: { id: true }
      })
      if (!user) {
        reply.code(404)
        return { error: { code: 'USER_NOT_FOUND', message: 'User not found' } }
      }
      userId = user.id
    }

    const friendships = await fastify.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { addresseeId: userId }]
      },
      include: {
        requester: { select: { id: true, displayName: true, login: true, status: true, avatarUrl: true } },
        addressee: { select: { id: true, displayName: true, login: true, status: true, avatarUrl: true } }
      }
    })

    const friends = friendships.map((f) => {
      return f.requesterId === userId ? f.addressee : f.requester
    })

    return { data: friends }
  })

  fastify.get('/users', { preHandler: fastify.authenticate }, async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query)

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

    const { q, statuses, relationships, page, limit: rawLimit, excludeFriendIds, sortBy, order } = parsed.data
    const limit = Math.min(rawLimit, 50)
    const excludeIds = parseExcludeIds(excludeFriendIds)
    const skip = (page - 1) * limit
    const viewerId = request.user?.userId

    const where: Prisma.UserWhereInput = {
      deletedAt: null
    }

    if (q) {
      where.OR = [
        { login: { contains: q } },
        { displayName: { contains: q } },
        { email: { contains: q } }
      ]
    }

    if (statuses) {
      const statusList = statuses.split(',').filter((s) => STATUS_VALUES.includes(s as any))
      if (statusList.length > 0) {
        where.status = { in: statusList as any[] }
      }
    }

    if (excludeIds.length > 0) {
      where.id = { notIn: excludeIds }
    }

    if (relationships && viewerId) {
      const relList = relationships.split(',')
      const includeFriends = relList.includes('friends')
      const includeBlocked = relList.includes('blocked')
      const includeSent = relList.includes('pending_sent')
      const includeReceived = relList.includes('pending_received')
      const includeNone = relList.includes('none')

      // If all are included (or none specified), no filter needed.
      // If some are missing, we need to filter.
      if (!includeFriends || !includeBlocked || !includeSent || !includeReceived || !includeNone) {
        const [friendships, blocks, sentReqs, receivedReqs] = await Promise.all([
          fastify.prisma.friendship.findMany({
            where: {
              status: 'ACCEPTED',
              OR: [{ requesterId: viewerId }, { addresseeId: viewerId }]
            },
            select: { requesterId: true, addresseeId: true }
          }),
          fastify.prisma.blocklist.findMany({
            where: { blockerId: viewerId },
            select: { blockedId: true }
          }),
          fastify.prisma.friendRequest.findMany({
            where: { senderId: viewerId, status: 'PENDING' },
            select: { receiverId: true }
          }),
          fastify.prisma.friendRequest.findMany({
            where: { receiverId: viewerId, status: 'PENDING' },
            select: { senderId: true }
          })
        ])

        const friendIds = friendships.map((f) => (f.requesterId === viewerId ? f.addresseeId : f.requesterId))
        const blockedIds = blocks.map((b) => b.blockedId)
        const sentIds = sentReqs.map(r => r.receiverId)
        const receivedIds = receivedReqs.map(r => r.senderId)
        
        // Logic:
        // We want to INCLUDE users who match the selected relationships.
        // - If 'friends' is selected -> include friendIds
        // - If 'blocked' is selected -> include blockedIds
        // - If 'pending_sent' is selected -> include sentIds
        // - If 'pending_received' is selected -> include receivedIds
        // - If 'none' is selected -> include IDs that are NOT in (friendIds + blockedIds + sentIds + receivedIds)
        
        if (includeNone) {
          const excludeFromView: number[] = []
          if (!includeFriends) excludeFromView.push(...friendIds)
          if (!includeBlocked) excludeFromView.push(...blockedIds)
          if (!includeSent) excludeFromView.push(...sentIds)
          if (!includeReceived) excludeFromView.push(...receivedIds)
          
          if (excludeFromView.length > 0) {
            if (where.id && typeof where.id === 'object' && 'notIn' in where.id) {
              where.id = { notIn: [...(where.id as any).notIn, ...excludeFromView] }
            } else {
              where.id = { notIn: excludeFromView }
            }
          }
        } else {
          const includeIds: number[] = []
          if (includeFriends) includeIds.push(...friendIds)
          if (includeBlocked) includeIds.push(...blockedIds)
          if (includeSent) includeIds.push(...sentIds)
          if (includeReceived) includeIds.push(...receivedIds)
          
          if (where.id && typeof where.id === 'object' && 'notIn' in where.id) {
             where.id = { in: includeIds, notIn: (where.id as any).notIn }
          } else {
             where.id = { in: includeIds }
          }
        }
      }
    }

    let orderBy: Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[] = []

    orderBy = { [sortBy]: order }

    // Secondary sort to ensure stable pagination
    if (Array.isArray(orderBy)) {
      orderBy.push({ id: 'asc' })
    } else {
      orderBy = [orderBy, { id: 'asc' }]
    }

    const [total, users] = await fastify.prisma.$transaction([
      fastify.prisma.user.count({ where }),
      fastify.prisma.user.findMany({
        where,
        select: {
          id: true,
          displayName: true,
          login: true,
          status: true,
          avatarUrl: true,
          country: true
        },
        orderBy,
        skip,
        take: limit
      })
    ])

    let mutualFriendsMap: Record<number, number> = {}

    if (viewerId && users.length > 0) {
      const viewerFriendships = await fastify.prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ requesterId: viewerId }, { addresseeId: viewerId }]
        },
        select: {
          requesterId: true,
          addresseeId: true
        }
      })

      if (viewerFriendships.length > 0) {
        const viewerFriendIds = new Set<number>()
        for (const edge of viewerFriendships) {
          const friendId = edge.requesterId === viewerId ? edge.addresseeId : edge.requesterId
          viewerFriendIds.add(friendId)
        }

        if (viewerFriendIds.size > 0) {
          const candidateIds = users.map((user) => user.id)
          const viewerFriendIdsArray = Array.from(viewerFriendIds)
          const candidateFriendships = await fastify.prisma.friendship.findMany({
            where: {
              status: 'ACCEPTED',
              OR: [
                {
                  requesterId: { in: candidateIds },
                  addresseeId: { in: viewerFriendIdsArray }
                },
                {
                  addresseeId: { in: candidateIds },
                  requesterId: { in: viewerFriendIdsArray }
                }
              ]
            },
            select: {
              requesterId: true,
              addresseeId: true
            }
          })

          if (candidateFriendships.length > 0) {
            const candidateSet = new Set(candidateIds)
            mutualFriendsMap = candidateFriendships.reduce<Record<number, number>>((acc, edge) => {
              const { requesterId, addresseeId } = edge

              if (candidateSet.has(requesterId) && viewerFriendIds.has(addresseeId)) {
                acc[requesterId] = (acc[requesterId] ?? 0) + 1
              }

              if (candidateSet.has(addresseeId) && viewerFriendIds.has(requesterId)) {
                acc[addresseeId] = (acc[addresseeId] ?? 0) + 1
              }

              return acc
            }, {})
          }
        }
      }
    }

    return {
      data: users.map((user) => ({
        ...user,
        mutualFriends: mutualFriendsMap[user.id] ?? 0
      })),
      meta: {
        page,
        limit,
        total
      }
    }
  })
}

export default usersRoutes

/*
解説:
1) Fastify の `authenticate` をプリハンドラーに差し込み、JWT の `userId` を viewer ID として安全に取得できるようにした。
2) viewer フレンド集合を一度だけ取得し、検索結果ユーザーに紐づく `Friendship` をまとめて読み込むことで N+1 クエリを避けた。
3) reduce で候補ごとの友人数をマップ化し、レスポンスでは既存フィールドに `mutualFriends` を安全に付与している。
*/
