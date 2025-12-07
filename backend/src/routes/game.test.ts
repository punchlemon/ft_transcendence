import Fastify from 'fastify'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

// Mock GameManager and notificationService
vi.mock('../game/GameManager', () => ({
  GameManager: {
    getInstance: () => ({
      createPrivateGame: () => ({ sessionId: 'test-session-123' })
    })
  }
}))

vi.mock('../services/notification', () => {
  return {
    notificationService: {
      createNotification: vi.fn()
    }
  }
})

import { notificationService } from '../services/notification'

import blockPlugin from '../plugins/block'
import gameRoutes from './game'

describe('gameRoutes POST /api/game/invite', () => {
  let fastify: ReturnType<typeof Fastify>

  beforeEach(() => {
    fastify = Fastify()
    // minimal authenticate stub
    fastify.decorate('authenticate', async (req: any, reply: any) => {
      req.user = { userId: 1, displayName: 'Tester' }
    })
  })

  afterEach(async () => {
    await fastify.close()
    vi.clearAllMocks()
  })

  it('creates session and sends notification when not blocked', async () => {
    // prisma mock: no block
    fastify.decorate('prisma', {
      blocklist: { findFirst: async () => null },
      user: { findUnique: async () => ({ displayName: 'Tester' }) }
    } as any)

    await fastify.register(blockPlugin)
    await fastify.register(gameRoutes, { prefix: '/api' })

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/game/invite',
      payload: { targetUserId: 2 }
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.type).toBe('match')
    expect(body.sessionId).toBe('test-session-123')
    expect((notificationService.createNotification as any)).toHaveBeenCalledTimes(1)
    expect((notificationService.createNotification as any)).toHaveBeenCalledWith(
      2,
      'MATCH_INVITE',
      'Game Invitation',
      expect.any(String),
      { sessionId: 'test-session-123', inviterId: 1 }
    )
  })

  it('creates session but does not notify when blocked', async () => {
    // prisma mock: blocked
    fastify.decorate('prisma', {
      blocklist: { findFirst: async () => ({ id: 5 }) },
      user: { findUnique: async () => ({ displayName: 'Tester' }) }
    } as any)

    await fastify.register(blockPlugin)
    await fastify.register(gameRoutes, { prefix: '/api' })

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/game/invite',
      payload: { targetUserId: 2 }
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.type).toBe('match')
    expect(body.sessionId).toBe('test-session-123')
    expect((notificationService.createNotification as any)).not.toHaveBeenCalled()
  })
})

