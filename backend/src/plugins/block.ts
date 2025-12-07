import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

export default fp(async (fastify: FastifyInstance) => {
  fastify.decorate('isBlocked', async (userA: number, userB: number) => {
    const rec = await fastify.prisma.blocklist.findFirst({
      where: {
        OR: [
          { blockerId: userA, blockedId: userB },
          { blockerId: userB, blockedId: userA }
        ]
      }
    })
    return !!rec
  })
})
