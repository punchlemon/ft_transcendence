import WebSocket from 'ws'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { buildServer } from '../../app'
import type { FastifyInstance } from 'fastify'

describe('GameSocketHandler integration', () => {
  let server: FastifyInstance
  let port: number

  beforeAll(async () => {
    server = await buildServer()
    await server.listen({ port: 0 })
    const addr = server.server.address()
    if (typeof addr === 'object' && addr) port = addr.port
  })

  afterAll(async () => {
    await server.close()
  })

  it('allows scheduled participants to connect to local-match and rejects others', async () => {
    // Create users and tournament/match
    const unique = Math.random().toString(36).slice(2, 8)
    const owner = await server.prisma.user.create({ data: { login: `owner-${unique}`, email: `owner-${unique}@example.com`, displayName: `Owner-${unique}`, passwordHash: 'h' } })
    const other = await server.prisma.user.create({ data: { login: `other-${unique}`, email: `other-${unique}@example.com`, displayName: `Other-${unique}`, passwordHash: 'h' } })
    const tournament = await server.prisma.tournament.create({ data: { name: 'IntTest Cup', createdById: owner.id } })

    const p1 = await server.prisma.tournamentParticipant.create({ data: { tournamentId: tournament.id, alias: 'P1', userId: owner.id, inviteState: 'ACCEPTED', seed: 1 } })
    const p2 = await server.prisma.tournamentParticipant.create({ data: { tournamentId: tournament.id, alias: 'P2', userId: other.id, inviteState: 'ACCEPTED', seed: 2 } })

    const match = await server.prisma.tournamentMatch.create({ data: { tournamentId: tournament.id, round: 1, playerAId: p1.id, playerBId: p2.id, status: 'PENDING' } })

    const matchSession = `local-match-${match.id}`

    // Unauthorized user (not participant) attempt
    const stranger = await server.prisma.user.create({ data: { login: `stranger-${unique}`, email: `stranger-${unique}@example.com`, displayName: `Stranger-${unique}`, passwordHash: 'h' } })

    const strangerToken = server.jwt.sign({ userId: stranger.id, sessionId: 0 })
    const wsStranger = new WebSocket(`ws://localhost:${port}/api/ws/game?sessionId=${matchSession}`)
    await new Promise<void>((resolve, reject) => {
      wsStranger.once('open', () => resolve())
      wsStranger.once('error', (err) => reject(err))
    })

    const strangerMsg = new Promise<any>((resolve) => {
      const onMessage = (data: WebSocket.Data) => {
        cleanup()
        resolve(JSON.parse(data.toString()))
      }
      const onClose = () => {
        cleanup()
        resolve({ closed: true })
      }
      const onError = (err: any) => {
        cleanup()
        resolve({ error: err })
      }
      const cleanup = () => {
        wsStranger.removeListener('message', onMessage as any)
        wsStranger.removeListener('close', onClose as any)
        wsStranger.removeListener('error', onError as any)
      }
      wsStranger.on('message', onMessage as any)
      wsStranger.on('close', onClose as any)
      wsStranger.on('error', onError as any)
    })

    wsStranger.send(JSON.stringify({ event: 'ready', payload: { token: strangerToken } }))

    const sresp = await strangerMsg
    expect(sresp).toMatchObject({ event: 'match:event' })
    // Expect UNAVAILABLE due to not participant
    expect(sresp.payload?.type).toBe('UNAVAILABLE')

    await new Promise<void>((resolve) => {
      wsStranger.once('close', () => resolve())
      // ensure socket is closed
      try { wsStranger.close() } catch (e) { resolve() }
    })

    // Now connect with scheduled participants
    const ownerToken = server.jwt.sign({ userId: owner.id, sessionId: 0 })
    const otherToken = server.jwt.sign({ userId: other.id, sessionId: 0 })

    const wsOwner = new WebSocket(`ws://localhost:${port}/api/ws/game?sessionId=${matchSession}`)
    await new Promise<void>((resolve, reject) => {
      wsOwner.once('open', () => resolve())
      wsOwner.once('error', (err) => reject(err))
    })

    const ownerMsg = new Promise<any>((resolve) => {
      const onMessage = (data: WebSocket.Data) => { cleanup(); resolve(JSON.parse(data.toString())) }
      const onError = (err: any) => { cleanup(); resolve({ error: err }) }
      const cleanup = () => { wsOwner.removeListener('message', onMessage as any); wsOwner.removeListener('error', onError as any) }
      wsOwner.on('message', onMessage as any)
      wsOwner.on('error', onError as any)
    })

    wsOwner.send(JSON.stringify({ event: 'ready', payload: { token: ownerToken } }))
    const oresp = await ownerMsg
    expect(oresp).toMatchObject({ event: 'match:event' })
    // owner should be allowed and receive CONNECTED or MATCH_FOUND
    expect(['CONNECTED','MATCH_FOUND']).toContain(oresp.payload?.type)

    // Second participant connects
    const wsOther = new WebSocket(`ws://localhost:${port}/api/ws/game?sessionId=${matchSession}`)
    await new Promise<void>((resolve, reject) => {
      wsOther.once('open', () => resolve())
      wsOther.once('error', (err) => reject(err))
    })

    const otherMsg = new Promise<any>((resolve) => {
      const onMessage = (data: WebSocket.Data) => { cleanup(); resolve(JSON.parse(data.toString())) }
      const onError = (err: any) => { cleanup(); resolve({ error: err }) }
      const cleanup = () => { wsOther.removeListener('message', onMessage as any); wsOther.removeListener('error', onError as any) }
      wsOther.on('message', onMessage as any)
      wsOther.on('error', onError as any)
    })
    wsOther.send(JSON.stringify({ event: 'ready', payload: { token: otherToken } }))
    const r2 = await otherMsg
    expect(r2).toMatchObject({ event: 'match:event' })
    // allow COUNTDOWN as timing may start the match immediately
    expect(['CONNECTED','MATCH_FOUND','COUNTDOWN']).toContain(r2.payload?.type)

    // close sockets and wait for close events
    await Promise.all([
      new Promise<void>((resolve) => { wsOwner.once('close', () => resolve()); try { wsOwner.close() } catch { resolve() } }),
      new Promise<void>((resolve) => { wsOther.once('close', () => resolve()); try { wsOther.close() } catch { resolve() } })
    ])
  })
})
