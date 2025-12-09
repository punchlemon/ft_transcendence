import { describe, it, expect, vi, beforeEach } from 'vitest'
import ChatSocketHandler from '../ChatSocketHandler'
import { presenceService } from '../../services/presence'

// Minimal mock WebSocket
class MockSocket {
  readyState: number = 1 // OPEN
  private handlers: Record<string, Function[]> = {}
  public sent: any[] = []
  closeCalls: Array<{ code?: number; reason?: string }> = []

  on(event: string, cb: Function) {
    (this.handlers[event] ||= []).push(cb)
  }

  send(payload: any) {
    this.sent.push(payload)
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push({ code, reason })
    this.readyState = 3 // CLOSED
    const cbs = this.handlers['close'] || []
    for (const cb of cbs) cb()
  }
}

describe('ChatSocketHandler (unit)', () => {
  let fastifyMock: any
  beforeEach(() => {
    // reset presence impls to avoid cross-test leakage
    presenceService.setCloseSocketsBySession(async () => 0)
    presenceService.setGetConnectionCount(async () => 0)

    fastifyMock = {
      jwt: {
        verify: (token: string) => {
          if (token === 'ok') return { userId: 42, sessionId: 100 }
          throw new Error('invalid')
        }
      },
      prisma: {
        user: {
          update: async () => ({})
        },
        channelMember: {
          findMany: async () => []
        }
      },
      addHook: (_: string, __: Function) => {}
    }
  })

  it('registers connection and updates presence/getConnectionCount', async () => {
    const handler = new ChatSocketHandler(fastifyMock)

    // create mock connection object similar to fastify-websocket
    const socket = new MockSocket()
    const connection = { socket }
    const req: any = { query: { token: 'ok' }, log: { warn: () => {} } }

    await handler.handle(connection, req)

    // connection should be registered
    const conns = (handler as any).connections.get(42)
    expect(conns).toBeDefined()
    expect(conns.size).toBe(1)

    // presenceService should report connection count via the installed impl
    const cnt = await presenceService.getConnectionCount(42)
    expect(cnt).toBe(1)

    // now close sockets by session via presenceService
    const closed = await presenceService.closeSocketsBySession(100)
    // closeSocketsBySession returns number closed
    expect(closed).toBe(1)

    // the socket should have been closed
    expect(socket.closeCalls.length).toBe(1)

    // connections map should be updated (user offline)
    const after = (handler as any).connections.get(42)
    expect(after === undefined || after.size === 0).toBe(true)

    // presence count now reports 0
    const cnt2 = await presenceService.getConnectionCount(42)
    expect(cnt2).toBe(0)
  })
})

it('broadcasts messages to members including multiple sockets per user', async () => {
  // reuse fastifyMock from the describe scope by creating a fresh handler
  const handler = new ChatSocketHandler((global as any).fastifyMock || {
    jwt: { verify: (t: string) => ({ userId: 1, sessionId: 1 }) },
    prisma: { user: { update: async () => ({}) }, channelMember: { findMany: async () => [] } },
    addHook: (_: string, __: Function) => {}
  })

  const s1a = new MockSocket()
  const s1b = new MockSocket()
  const s2 = new MockSocket()

  // register sockets for users 1 and 2 by simulating proper jwt.verify tokens
  // we call handler.handle directly with tokens satisfied by a small wrapper
  await handler.handle({ socket: s1a }, { query: { token: 'u1' }, log: { warn: () => {} }, jwt: { verify: (t: string) => ({ userId: 1, sessionId: 101 }) } });
  await handler.handle({ socket: s1b }, { query: { token: 'u1' }, log: { warn: () => {} }, jwt: { verify: (t: string) => ({ userId: 1, sessionId: 101 }) } });
  await handler.handle({ socket: s2 }, { query: { token: 'u2' }, log: { warn: () => {} }, jwt: { verify: (t: string) => ({ userId: 2, sessionId: 102 }) } });

  // make channelMember.findMany return the two users as members
  ;(handler as any).fastify.prisma.channelMember.findMany = async () => [{ userId: 1 }, { userId: 2 }]

  const message = { channelId: 10, id: 'm_b', content: 'broadcast' }
  await (handler as any).handleChatMessage(message)

  expect(s1a.sent.length).toBeGreaterThan(0)
  expect(s1b.sent.length).toBeGreaterThan(0)
  expect(s2.sent.length).toBeGreaterThan(0)

  const payload = JSON.parse(s2.sent[0])
  expect(payload.type).toBe('message')
  expect(payload.data.id).toBe('m_b')
})

