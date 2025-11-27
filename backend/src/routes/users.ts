import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'

const STATUS_VALUES = ['OFFLINE', 'ONLINE', 'IN_MATCH', 'AWAY', 'DO_NOT_DISTURB'] as const

const searchQuerySchema = z.object({
  q: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(64))
    .optional(),
  status: z.enum(STATUS_VALUES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).default(20),
  excludeFriendIds: z.string().optional()
})

type SearchQuery = z.infer<typeof searchQuerySchema>

const parseExcludeIds = (excludeFriendIds?: string) => {
  if (!excludeFriendIds) return [] as number[]

  return excludeFriendIds
    .split(',')
    .map((chunk) => Number(chunk.trim()))
    .filter((id) => Number.isInteger(id) && id > 0)
}

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const paramsSchema = z.object({
    id: z.coerce.number().int().positive()
  })

  fastify.get('/api/users/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params)
    if (!parsed.success) {
      reply.code(400)
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid user ID' } }
    }

    const { id: targetId } = parsed.data
    const viewerId = request.user.userId

    const user = await fastify.prisma.user.findUnique({
      where: { id: targetId, deletedAt: null },
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
        },
        ladderProfile: {
          select: {
            tier: true,
            division: true,
            mmr: true
          }
        }
      }
    })

    if (!user) {
      reply.code(404)
      return { error: { code: 'USER_NOT_FOUND', message: 'User not found' } }
    }

    // Friendship Status
    let friendshipStatus: 'NONE' | 'FRIEND' | 'PENDING_SENT' | 'PENDING_RECEIVED' = 'NONE'
    if (viewerId !== targetId) {
      const friendship = await fastify.prisma.friendship.findFirst({
        where: {
          OR: [
            { requesterId: viewerId, addresseeId: targetId },
            { requesterId: targetId, addresseeId: viewerId }
          ]
        }
      })

      if (friendship) {
        if (friendship.status === 'ACCEPTED') {
          friendshipStatus = 'FRIEND'
        } else if (friendship.status === 'PENDING') {
          friendshipStatus = friendship.requesterId === viewerId ? 'PENDING_SENT' : 'PENDING_RECEIVED'
        }
      }
    }

    // Mutual Friends
    let mutualFriends = 0
    if (viewerId !== targetId) {
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
      ladder: user.ladderProfile,
      ladderProfile: undefined,
      friendshipStatus,
      mutualFriends
    }
  })

  fastify.get('/api/users/:id/matches', { preHandler: fastify.authenticate }, async (request, reply) => {
    const paramsParsed = paramsSchema.safeParse(request.params)
    if (!paramsParsed.success) {
      reply.code(400)
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid user ID' } }
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

    const { id: userId } = paramsParsed.data
    const { page, limit } = queryParsed.data
    const skip = (page - 1) * limit

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
          results: true
        },
        orderBy: { endedAt: 'desc' },
        skip,
        take: limit
      })
    ])

    const data = matches.map((match) => {
      const isPlayerA = match.playerAId === userId
      const opponent = isPlayerA ? match.playerB : match.playerA
      const userResult = match.results.find((r) => r.userId === userId)
      const opponentResult = match.results.find((r) => r.userId === opponent.id)

      return {
        id: match.id,
        opponent,
        result: userResult?.outcome || 'UNKNOWN',
        score: `${userResult?.score ?? 0} - ${opponentResult?.score ?? 0}`,
        date: match.endedAt,
        mode: match.mode
      }
    })

    return {
      data,
      meta: { page, limit, total }
    }
  })

  fastify.get('/api/users/:id/friends', { preHandler: fastify.authenticate }, async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params)
    if (!parsed.success) {
      reply.code(400)
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid user ID' } }
    }

    const { id: userId } = parsed.data

    const friendships = await fastify.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { addresseeId: userId }]
      },
      include: {
        requester: { select: { id: true, displayName: true, status: true, avatarUrl: true } },
        addressee: { select: { id: true, displayName: true, status: true, avatarUrl: true } }
      }
    })

    const friends = friendships.map((f) => {
      return f.requesterId === userId ? f.addressee : f.requester
    })

    return { data: friends }
  })

  fastify.get('/api/users', { preHandler: fastify.authenticate }, async (request, reply) => {
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

    const { q, status, page, limit: rawLimit, excludeFriendIds } = parsed.data
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

    if (status) {
      where.status = status
    }

    if (excludeIds.length > 0) {
      where.id = { notIn: excludeIds }
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
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
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

export default fp(usersRoutes)

/*
解説:
1) Fastify の `authenticate` をプリハンドラーに差し込み、JWT の `userId` を viewer ID として安全に取得できるようにした。
2) viewer フレンド集合を一度だけ取得し、検索結果ユーザーに紐づく `Friendship` をまとめて読み込むことで N+1 クエリを避けた。
3) reduce で候補ごとの友人数をマップ化し、レスポンスでは既存フィールドに `mutualFriends` を安全に付与している。
*/
