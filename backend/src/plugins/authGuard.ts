import { FastifyPluginAsync } from 'fastify'

const authGuard: FastifyPluginAsync = async (fastify) => {
  // Provide a reusable decorator to block a single route explicitly
  fastify.decorate('rejectIfInGame', async (req: any, reply: any) => {
    try {
      const user = req.user
      if (!user || !user.userId) return
      const u = await fastify.prisma.user.findUnique({ where: { id: user.userId }, select: { status: true } })
      if (u && u.status === 'IN_GAME') {
        return reply.code(409).send({ error: 'User currently in a game (IN_GAME)' })
      }
    } catch (e) {
      fastify.log.warn({ err: e }, 'rejectIfInGame error')
    }
  })

  // Global preValidation hook to block non-GET REST operations for users in game.
  // preValidation runs before route handlers and before preHandler stage, ensuring
  // authenticated preValidation (e.g. fastify.authenticate) has already run.
  fastify.addHook('preValidation', async (req: any, reply) => {
    try {
      if (req.method === 'GET') return
      const user = req.user
      if (!user || !user.userId) return
      const u = await fastify.prisma.user.findUnique({ where: { id: user.userId }, select: { status: true } })
      if (u && u.status === 'IN_GAME') {
        return reply.code(409).send({ error: 'User currently in a game (IN_GAME)' })
      }
    } catch (e) {
      fastify.log.warn({ err: e }, 'authGuard preValidation error')
    }
  })
}

export default authGuard
