import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../app'
import { tournamentService } from '../services/tournamentService'

const register = async (server: FastifyInstance, payload: { email: string; username: string; displayName: string; password: string }) => {
  const res = await server.inject({ method: 'POST', url: '/api/auth/register', payload })
  return res.json<{ user: { id: number }; tokens: { access: string; refresh: string } }>()
}

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
    await server.prisma.message.deleteMany()
    await server.prisma.channelMember.deleteMany()
    await server.prisma.channelInvite.deleteMany()
    await server.prisma.channelBan.deleteMany()
    await server.prisma.channel.deleteMany()
    await server.prisma.partyMember.deleteMany()
    await server.prisma.partyInvite.deleteMany()
    await server.prisma.party.deleteMany()
    await server.prisma.session.deleteMany()
    await server.prisma.tournamentMatch.deleteMany()
    await server.prisma.tournamentParticipant.deleteMany()
    await server.prisma.tournament.deleteMany()
    await server.prisma.matchResult.deleteMany()
    await server.prisma.matchRound.deleteMany()
    await server.prisma.penalty.deleteMany()
    await server.prisma.match.deleteMany()
    await server.prisma.friendship.deleteMany()
    await server.prisma.blocklist.deleteMany()
    await server.prisma.friendRequest.deleteMany()
    await server.prisma.notification.deleteMany()
    await server.prisma.ladderEnrollment.deleteMany()
    // await server.prisma.ladderProfile.deleteMany()
    await server.prisma.userStats.deleteMany()
    await server.prisma.userAchievement.deleteMany()
    await server.prisma.inventoryItem.deleteMany()
    await server.prisma.transaction.deleteMany()
    await server.prisma.wallet.deleteMany()
    await server.prisma.auditLog.deleteMany()
    await server.prisma.oAuthState.deleteMany()
    await server.prisma.oAuthAccount.deleteMany()
    await server.prisma.twoFactorBackupCode.deleteMany()
    await server.prisma.mfaChallenge.deleteMany()
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

  it('sends notifications to invited users when participants include userIds on creation', async () => {
    const owner = await createUser(server, { displayName: 'Owner' })
    const friend = await createUser(server, { displayName: 'Friend' })

    await server.prisma.user.update({ where: { id: friend.id }, data: { status: 'ONLINE' } })

    const response = await server.inject({
      method: 'POST',
      url: '/api/tournaments',
      payload: {
        name: 'Creation Invite Cup',
        createdById: owner.id,
        participants: [
          { alias: owner.displayName, userId: owner.id, inviteState: 'ACCEPTED' },
          { alias: friend.displayName, userId: friend.id }
        ]
      }
    })

    expect(response.statusCode).toBe(201)

    const notifications = await server.prisma.notification.findMany({ where: { userId: friend.id } })
    expect(notifications.some((n) => n.type === 'TOURNAMENT_INVITE')).toBe(true)
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

  it('prevents start when invites are pending and allows start after all accept', async () => {
    const owner = await register(server, { email: 'owner-start@example.com', username: 'owner_start', displayName: 'OwnerStart', password: 'Pass1234' })
    const friend = await register(server, { email: 'friend-start@example.com', username: 'friend_start', displayName: 'FriendStart', password: 'Pass1234' })

    // Create draft tournament with friend invited
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tournaments',
      payload: {
        name: 'Start Flow Cup',
        createdById: owner.user.id,
        participants: [
          { alias: 'OwnerStart', userId: owner.user.id, inviteState: 'ACCEPTED' },
          { alias: 'FriendStart', userId: friend.user.id }
        ]
      }
    })

    expect(createRes.statusCode).toBe(201)
    const created = createRes.json<{ data: { id: number } }>()

    const startRes = await server.inject({
      method: 'POST',
      url: `/api/tournaments/${created.data.id}/start`,
      headers: { authorization: `Bearer ${owner.tokens.access}` }
    })

    expect(startRes.statusCode).toBe(409)
    const friendParticipant = await server.prisma.tournamentParticipant.findFirst({
      where: { tournamentId: created.data.id, userId: friend.user.id }
    })
    expect(friendParticipant).toBeTruthy()

    const acceptRes = await server.inject({
      method: 'PATCH',
      url: `/api/tournaments/${created.data.id}/participants/${friendParticipant!.id}`,
      headers: { authorization: `Bearer ${friend.tokens.access}` },
      payload: { action: 'ACCEPT' }
    })
    expect(acceptRes.statusCode).toBe(200)

    const startOk = await server.inject({
      method: 'POST',
      url: `/api/tournaments/${created.data.id}/start`,
      headers: { authorization: `Bearer ${owner.tokens.access}` }
    })

    expect(startOk.statusCode).toBe(200)
    const started = startOk.json<{ data: { status: string; matches: Array<any> } }>()
    expect(started.data.status).toBe('RUNNING')
    expect(started.data.matches.length).toBeGreaterThan(0)
  })

  it('notifies winners when a next round match becomes ready', async () => {
    const owner = await createUser(server, { displayName: 'Owner' })
    const alice = await createUser(server, { displayName: 'Alice' })
    const bob = await createUser(server, { displayName: 'Bob' })
    const carol = await createUser(server, { displayName: 'Carol' })
    const dave = await createUser(server, { displayName: 'Dave' })

    const tournament = await server.prisma.tournament.create({
      data: {
        name: 'Knockout Cup',
        status: 'RUNNING',
        bracketType: 'SINGLE_ELIMINATION',
        createdById: owner.id
      }
    })

    const aliceP = await server.prisma.tournamentParticipant.create({
      data: { tournamentId: tournament.id, alias: 'Alice', userId: alice.id, inviteState: 'ACCEPTED' }
    })
    const bobP = await server.prisma.tournamentParticipant.create({
      data: { tournamentId: tournament.id, alias: 'Bob', userId: bob.id, inviteState: 'ACCEPTED' }
    })
    const carolP = await server.prisma.tournamentParticipant.create({
      data: { tournamentId: tournament.id, alias: 'Carol', userId: carol.id, inviteState: 'ACCEPTED' }
    })
    const daveP = await server.prisma.tournamentParticipant.create({
      data: { tournamentId: tournament.id, alias: 'Dave', userId: dave.id, inviteState: 'ACCEPTED' }
    })
    const placeholder = await server.prisma.tournamentParticipant.create({
      data: { tournamentId: tournament.id, alias: 'TBD', inviteState: 'PLACEHOLDER' }
    })

    const match1 = await server.prisma.tournamentMatch.create({
      data: { tournamentId: tournament.id, round: 1, playerAId: aliceP.id, playerBId: bobP.id, status: 'RUNNING' }
    })
    const match2 = await server.prisma.tournamentMatch.create({
      data: { tournamentId: tournament.id, round: 1, playerAId: carolP.id, playerBId: daveP.id, status: 'RUNNING' }
    })
    await server.prisma.tournamentMatch.create({
      data: { tournamentId: tournament.id, round: 2, playerAId: placeholder.id, playerBId: placeholder.id, status: 'PENDING' }
    })

    await tournamentService.handleMatchResult(match1.id, alice.id, 5, 3)

    const afterFirst = await server.prisma.notification.findMany({ where: { type: 'TOURNAMENT_MATCH_READY' } })
    expect(afterFirst).toHaveLength(0)

    await tournamentService.handleMatchResult(match2.id, carol.id, 5, 1)

    const notifications = await server.prisma.notification.findMany({ where: { type: 'TOURNAMENT_MATCH_READY' }, orderBy: { id: 'asc' } })
    expect(notifications).toHaveLength(2)
    expect(new Set(notifications.map((n) => n.userId))).toEqual(new Set([alice.id, carol.id]))

    const payload = notifications.map((n) => (n.data ? JSON.parse(n.data) : null))
    payload.forEach((data) => {
      expect(data).toBeTruthy()
      expect(data?.sessionId).toMatch(/^local-match-\d+$/)
      expect(data?.p1Name).toBeTruthy()
      expect(data?.p2Name).toBeTruthy()
    })
  })
})
