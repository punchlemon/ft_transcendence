import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import { buildServer } from '../app'

describe('Game WebSocket', () => {
  let server: FastifyInstance
  let port: number

  beforeAll(async () => {
    server = await buildServer()
    await server.listen({ port: 0 }) // Random port
    const address = server.server.address()
    if (typeof address === 'object' && address) {
      port = address.port
    }
  })

  afterAll(async () => {
    await server.close()
  })

  it('should connect and respond to ready event', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/api/ws/game`)

    const waitForOpen = new Promise<void>((resolve) => {
      ws.on('open', () => resolve())
    })

    await waitForOpen

    const waitForMessage = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()))
      })
    })

    ws.send(JSON.stringify({ event: 'ready', payload: { token: 'test-token' } }))

    const response = await waitForMessage
    expect(response).toMatchObject({
      event: 'match:event',
      payload: { 
        type: 'CONNECTED', 
        message: 'Waiting for opponent',
        slot: 'p1',
        waiting: true
      }
    })
    // Session ID is not returned for waiting players to prevent direct access
    // expect(response.payload.sessionId).toBeDefined()

    ws.close()
  })
})
