import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../app'

const createUser = async (
  server: FastifyInstance,
  data: Partial<{ login: string; email: string; displayName: string }>
) => {
  const unique = Math.random().toString(36).slice(2, 8)
  return server.prisma.user.create({
    data: {
      login: data.login ?? `user-${unique}`,
      email: data.email ?? `user-${unique}@example.com`,
      displayName: data.displayName ?? `User ${unique}`,
      passwordHash: 'hashed'
    }
  })
}

describe('Tournaments API', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await buildServer()
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(async () => {
    await server.prisma.tournamentMatch.deleteMany()
    await server.prisma.tournamentParticipant.deleteMany()
    await server.prisma.tournament.deleteMany()
    await server.prisma.user.deleteMany()
  })

  it('creates a tournament with optional participants', async () => {
    const owner = await createUser(server, { displayName: 'Owner' })

    const response = await server.inject({
      method: 'POST',
      url: '/api/tournaments',
      payload: {
        name: 'Sunday Cup',
        createdById: owner.id,
        bracketType: 'DOUBLE_ELIMINATION',
        startsAt: '2025-12-01T10:00:00.000Z',
        participants: [
          { alias: 'Alice' },
          { alias: 'Bob', userId: owner.id }
        ]
      }
    })

    expect(response.statusCode).toBe(201)
    const body = response.json<{
      data: {
        id: number
        name: string
        owner: { id: number }
        participantCount: number
        startsAt: string | null
      }
    }>()

    expect(body.data.name).toBe('Sunday Cup')
    expect(body.data.owner.id).toBe(owner.id)
    expect(body.data.participantCount).toBe(2)
    expect(body.data.startsAt).toBe('2025-12-01T10:00:00.000Z')

    const tournamentInDb = await server.prisma.tournament.findUnique({
      where: { id: body.data.id },
      include: { participants: true }
    })
    expect(tournamentInDb?.participants).toHaveLength(2)
  })

  it('lists tournaments with filters and pagination', async () => {
    const ownerA = await createUser(server, { displayName: 'Owner A' })
    const ownerB = await createUser(server, { displayName: 'Owner B' })

    await server.prisma.tournament.create({
      data: { name: 'Draft Cup', createdById: ownerA.id, status: 'DRAFT', bracketType: 'SINGLE_ELIMINATION' }
    })
    await server.prisma.tournament.create({
      data: { name: 'Running Cup', createdById: ownerB.id, status: 'RUNNING', bracketType: 'SINGLE_ELIMINATION' }
    })
    await server.prisma.tournament.create({
      data: { name: 'Ready Cup', createdById: ownerA.id, status: 'READY', bracketType: 'DOUBLE_ELIMINATION' }
    })

    const response = await server.inject({
      method: 'GET',
      url: '/api/tournaments',
      query: { status: 'RUNNING', ownerId: ownerB.id.toString(), limit: '5' }
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ data: Array<{ name: string; status: string }>; meta: { total: number } }>()

    expect(body.meta.total).toBe(1)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('Running Cup')
  })

  it('returns tournament detail with participants and matches ordered properly', async () => {
    const owner = await createUser(server, { displayName: 'Owner' })
    const guest = await createUser(server, { displayName: 'Guest' })

    const tournament = await server.prisma.tournament.create({
      data: {
        name: 'Detail Cup',
        status: 'RUNNING',
        bracketType: 'DOUBLE_ELIMINATION',
        createdById: owner.id,
        startsAt: new Date('2025-12-01T09:00:00.000Z')
      }
    })

    const alice = await server.prisma.tournamentParticipant.create({
      data: {
        tournamentId: tournament.id,
        alias: 'Alice',
        userId: owner.id,
        inviteState: 'INVITED',
        seed: 1
      }
    })
    const bob = await server.prisma.tournamentParticipant.create({
      data: {
        tournamentId: tournament.id,
        alias: 'Bob',
        userId: guest.id,
        inviteState: 'ACCEPTED',
        seed: 2
      }
    })

    await server.prisma.tournamentMatch.create({
      data: {
        tournamentId: tournament.id,
        round: 1,
        playerAId: alice.id,
        playerBId: bob.id,
        status: 'IN_PROGRESS',
        scheduledAt: new Date('2025-12-01T10:00:00.000Z')
      }
    })

    const response = await server.inject({ method: 'GET', url: `/api/tournaments/${tournament.id}` })

    expect(response.statusCode).toBe(200)
    const body = response.json<{
      data: {
        name: string
        participants: Array<{ alias: string; seed: number | null }>
        matches: Array<{ round: number; playerA: { alias: string }; playerB: { alias: string } }>
      }
    }>()

    expect(body.data.name).toBe('Detail Cup')
    expect(body.data.participants.map((participant) => participant.alias)).toEqual(['Alice', 'Bob'])
    expect(body.data.matches).toHaveLength(1)
    expect(body.data.matches[0].playerA.alias).toBe('Alice')
    expect(body.data.matches[0].playerB.alias).toBe('Bob')
  })

  it('returns 404 when tournament detail is missing', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/tournaments/9999' })

    expect(response.statusCode).toBe(404)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('TOURNAMENT_NOT_FOUND')
  })

  it('returns 404 if creator does not exist', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/tournaments',
      payload: {
        name: 'Orphan Cup',
        createdById: 9999
      }
    })

    expect(response.statusCode).toBe(404)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('CREATOR_NOT_FOUND')
  })

  it('validates request body and query params', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/tournaments',
      payload: { name: 'x', createdById: -1 }
    })

    expect(response.statusCode).toBe(400)

    const listResponse = await server.inject({ method: 'GET', url: '/api/tournaments', query: { page: '0' } })
    expect(listResponse.statusCode).toBe(400)
  })
})
