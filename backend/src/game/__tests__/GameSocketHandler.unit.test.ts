import { describe, it, expect, vi } from 'vitest'
import GameSocketHandler from '../GameSocketHandler'

class FakeSocket {
  handlers: Record<string, Function> = {}
  sent: string[] = []
  closed = false
  __userId?: number
  __sessionId?: number

  on(event: string, cb: Function) {
    this.handlers[event] = cb
  }
  addEventListener(event: string, cb: Function) { this.on(event, cb) }
  send(data: string) { this.sent.push(data) }
  close() { this.closed = true }

  triggerMessage(obj: any) {
    const cb = this.handlers['message']
    if (cb) cb({ data: JSON.stringify(obj) })
  }
  triggerClose() {
    const cb = this.handlers['close']
    if (cb) cb()
  }
}

const makeFastifyMock = (opts: any = {}) => {
  return {
    jwt: { verify: (t: any) => t as any },
    prisma: opts.prisma,
    log: { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }
  } as any
}

describe('GameSocketHandler (unit)', () => {
  it('rejects connection for non-participant of local-match', async () => {
    const fakeSocket = new FakeSocket()
    const match = {
      id: 123,
      playerA: { userId: 10 },
      playerB: { userId: 11 }
    }
    const prisma = { tournamentMatch: { findUnique: vi.fn().mockResolvedValue(match) } }
    const fastify = makeFastifyMock({ prisma })

    // stub GameManager to avoid real game creation side-effects
    const manager = {
      isExpired: vi.fn().mockReturnValue(false),
      getGame: vi.fn().mockReturnValue(undefined),
      createGame: vi.fn().mockReturnValue({ addPlayer: vi.fn() })
    }
    const GM = await import('../GameManager')
    vi.spyOn(GM.GameManager, 'getInstance').mockReturnValue(manager as any)

    const handler = new GameSocketHandler(fastify)

    handler.handle(fakeSocket as any, { query: { sessionId: 'local-match-123' } } as any)

    // simulate ready with token for userId 999 (not a participant)
    fakeSocket.triggerMessage({ event: 'ready', payload: { token: { userId: 999 } } })
    // wait for async handlers
    await new Promise((r) => setTimeout(r, 20))

    // Expect UNAVAILABLE message sent and socket closed
    expect(fakeSocket.sent.length).toBeGreaterThan(0)
    const parsed = JSON.parse(fakeSocket.sent[0])
    expect(parsed).toMatchObject({ event: 'match:event' })
    expect(parsed.payload.type).toBe('UNAVAILABLE')
    expect(fakeSocket.closed).toBe(true)
  })

  it('allows connection for scheduled participant', async () => {
    const fakeSocket = new FakeSocket()
    const match = {
      id: 124,
      playerA: { userId: 20 },
      playerB: { userId: 21 }
    }
    const prisma = { tournamentMatch: { findUnique: vi.fn().mockResolvedValue(match) } }

    // Minimal GameManager stub that GameSocketHandler will use.
    const game = {
      addPlayer: vi.fn().mockReturnValue('p1'),
      removePlayer: vi.fn()
    }
    const manager = {
      isExpired: vi.fn().mockReturnValue(false),
      getGame: vi.fn().mockReturnValue(undefined),
      createGame: vi.fn().mockReturnValue(game),
      createLocalGame: vi.fn().mockReturnValue({ game, sessionId: 'local' })
    }

    // Monkey-patch GameManager.getInstance to return our stub
    const GM = await import('../GameManager')
    vi.spyOn(GM.GameManager, 'getInstance').mockReturnValue(manager as any)

    const fastify = makeFastifyMock({ prisma })
    const handler = new GameSocketHandler(fastify)

    handler.handle(fakeSocket as any, { query: { sessionId: 'local-match-124' } } as any)

    // simulate ready with token for userId 20 (playerA)
    fakeSocket.triggerMessage({ event: 'ready', payload: { token: { userId: 20, sessionId: 0 } } })
    // wait for async handlers
    await new Promise((r) => setTimeout(r, 20))

    expect(fakeSocket.sent.length).toBeGreaterThan(0)
    const parsed = JSON.parse(fakeSocket.sent[0])
    expect(parsed).toMatchObject({ event: 'match:event' })
    expect(['CONNECTED', 'MATCH_FOUND']).toContain(parsed.payload.type)
  })
})
