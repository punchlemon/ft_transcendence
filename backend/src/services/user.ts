import type { FastifyInstance } from 'fastify'

export async function getDisplayName(fastify: FastifyInstance, userId: number): Promise<string | null> {
  const u = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } })
  return u?.displayName ?? null
}

export async function getDisplayNameOrFallback(fastify: FastifyInstance, userId: number, fallback = 'Someone'): Promise<string> {
  const name = await getDisplayName(fastify, userId)
  return name ?? fallback
}
import { EventEmitter } from 'events';

class UserService extends EventEmitter {
  emitStatusChange(userId: number, status: string) {
    this.emit('status_change', { userId, status });
  }

  emitUserCreated(user: any) {
    this.emit('user_created', user);
  }

  emitUserUpdated(user: any) {
    this.emit('user_updated', user);
  }
}

export const userService = new UserService();
