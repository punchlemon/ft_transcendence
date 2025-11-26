import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'
import { FastifyPluginAsync } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const prisma = new PrismaClient()
  await prisma.$connect()

  fastify.decorate('prisma', prisma)

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
}

export default fp(dbPlugin)
