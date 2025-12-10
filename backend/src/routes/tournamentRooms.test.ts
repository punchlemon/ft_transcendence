import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../app'

const register = async (server: FastifyInstance, payload: { email: string; username: string; displayName: string; password: string }) => {
  const res = await server.inject({ method: 'POST', url: '/api/auth/register', payload })
  const body = await res.json()
  if (res.statusCode !== 201) {
    throw new Error(`Registration failed: ${res.statusCode} ${JSON.stringify(body)}`)
  }
  return body as { user: { id: number }; tokens: { access: string; refresh: string } }
}

describe('TournamentRoom routes', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await buildServer()
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(async () => {
    const p = server.prisma
    await p.message.deleteMany()
    await p.channelMember.deleteMany()
    await p.channelInvite.deleteMany()
    await p.channelBan.deleteMany()
    await p.channel.deleteMany()
    await p.partyMember.deleteMany()
    await p.partyInvite.deleteMany()
    await p.party.deleteMany()
    await p.session.deleteMany()
    await p.tournamentMatch.deleteMany()
    await p.tournamentParticipant.deleteMany()
    await p.tournamentRoomInvite.deleteMany()
    await p.tournamentRoom.deleteMany()
    await p.tournament.deleteMany()
    await p.matchResult.deleteMany()
    await p.matchRound.deleteMany()
    await p.penalty.deleteMany()
    await p.match.deleteMany()
    await p.friendship.deleteMany()
    await p.blocklist.deleteMany()
    await p.friendRequest.deleteMany()
    await p.notification.deleteMany()
    await p.ladderEnrollment.deleteMany()
    // await p.ladderProfile.deleteMany()
    await p.userStats.deleteMany()
    await p.userAchievement.deleteMany()
    await p.inventoryItem.deleteMany()
    await p.transaction.deleteMany()
    await p.wallet.deleteMany()
    await p.auditLog.deleteMany()
    await p.oAuthState.deleteMany()
    await p.oAuthAccount.deleteMany()
    await p.twoFactorBackupCode.deleteMany()
    await p.mfaChallenge.deleteMany()
    await p.user.deleteMany()
  })

  it('owner can create a tournament room and invited user gets notification', async () => {
    const owner = await register(server, { email: 'o1@example.com', username: 'o1user', displayName: 'Owner1', password: 'Pass1234' })
    const friend = await register(server, { email: 'f1@example.com', username: 'f1user', displayName: 'Friend1', password: 'Pass1234' })

    // make them friends
    await server.prisma.friendship.create({ data: { requesterId: owner.user.id, addresseeId: friend.user.id, status: 'ACCEPTED' } })
    await server.prisma.user.update({ where: { id: friend.user.id }, data: { status: 'ONLINE' } })

    const tournament = await server.prisma.tournament.create({ data: { name: 'Room Cup', createdById: owner.user.id } })

    const res = await server.inject({
      method: 'POST',
      url: `/api/tournaments/${tournament.id}/rooms`,
      headers: { authorization: `Bearer ${owner.tokens.access}` },
      payload: { invitedUserIds: [friend.user.id], mode: 'REMOTE' }
    })

    expect(res.statusCode).toBe(201)
    const body = res.json<{ data: { roomId: number } }>()
    expect(body.data.roomId).toBeTruthy()

    const notifs = await server.prisma.notification.findMany({ where: { userId: friend.user.id } })
    expect(notifs.length).toBeGreaterThan(0)
    expect(notifs.some(n => n.type === 'TOURNAMENT_INVITE')).toBe(true)
  })

  it('invited user can accept room invite via PATCH', async () => {
    const owner = await register(server, { email: 'o2@example.com', username: 'o2user', displayName: 'Owner2', password: 'Pass1234' })
    const friend = await register(server, { email: 'f2@example.com', username: 'f2user', displayName: 'Friend2', password: 'Pass1234' })

    await server.prisma.friendship.create({ data: { requesterId: owner.user.id, addresseeId: friend.user.id, status: 'ACCEPTED' } })
    await server.prisma.user.update({ where: { id: friend.user.id }, data: { status: 'ONLINE' } })

    const tournament = await server.prisma.tournament.create({ data: { name: 'Room Cup 2', createdById: owner.user.id } })
    const createRes = await server.inject({ method: 'POST', url: `/api/tournaments/${tournament.id}/rooms`, headers: { authorization: `Bearer ${owner.tokens.access}` }, payload: { invitedUserIds: [friend.user.id] } })
    const createBody = createRes.json<{ data: { roomId: number } }>()

    const invite = await server.prisma.tournamentRoomInvite.findFirst({ where: { roomId: createBody.data.roomId, userId: friend.user.id } })
    expect(invite).toBeTruthy()

    const acceptRes = await server.inject({ method: 'PATCH', url: `/api/tournaments/rooms/${createBody.data.roomId}/invites/${invite!.id}`, headers: { authorization: `Bearer ${friend.tokens.access}` }, payload: { action: 'ACCEPT' } })
    expect(acceptRes.statusCode).toBe(200)
    const accepted = acceptRes.json<{ data: any }>()
    expect(accepted.data.state).toBe('ACCEPTED')
  })
})
