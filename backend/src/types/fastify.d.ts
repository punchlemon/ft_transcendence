import 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    isBlocked(userA: number, userB: number): Promise<boolean>
  }
}
