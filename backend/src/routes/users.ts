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
  fastify.get('/api/users', async (request, reply) => {
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

    return {
      data: users.map((user) => ({
        ...user,
        mutualFriends: 0
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
