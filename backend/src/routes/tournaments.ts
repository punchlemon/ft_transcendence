import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

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

const tournamentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/tournaments', async (request, reply) => {
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
        createdBy: { select: { id: true, displayName: true } }
      }
    })

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

  fastify.get('/api/tournaments', async (request, reply) => {
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
}

export default fp(tournamentsRoutes)
