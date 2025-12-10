import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../app'

const register = async (server: FastifyInstance, payload: { email: string; username: string; displayName: string; password: string }) => {
  const res = await server.inject({ method: 'POST', url: '/api/auth/register', payload })
  return res.json<{ user: { id: number }; tokens: { access: string; refresh: string } }>()
}

describe('Tournament Invite Flow', () => {
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

  it('owner can invite online friend and notification is created', async () => {
    const ownerBody = await register(server, { email: 'owner@example.com', username: 'owner', displayName: 'Owner', password: 'Pass1234' })
    const friendBody = await register(server, { email: 'friend@example.com', username: 'friend', displayName: 'Friend', password: 'Pass1234' })

    // Make them friends
    await server.prisma.friendship.create({ data: { requesterId: ownerBody.user.id, addresseeId: friendBody.user.id, status: 'ACCEPTED' } })

    // Ensure friend is online (presenceService fallback uses user.status)
    await server.prisma.user.update({ where: { id: friendBody.user.id }, data: { status: 'ONLINE' } })

    const tournament = await server.prisma.tournament.create({ data: { name: 'Invite Cup', createdById: ownerBody.user.id } })

    const res = await server.inject({
      method: 'POST',
      url: `/api/tournaments/${tournament.id}/invite`,
      headers: { authorization: `Bearer ${ownerBody.tokens.access}` },
      payload: { userId: friendBody.user.id }
    })

    expect(res.statusCode).toBe(201)
    const body = res.json<{ data: { id: number; inviteState: string } }>()
    expect(body.data.inviteState).toBe('INVITED')

    const notifications = await server.prisma.notification.findMany({ where: { userId: friendBody.user.id } })
    expect(notifications.length).toBeGreaterThan(0)
    expect(notifications[0].type).toBe('TOURNAMENT_INVITE')
  })

  it('invited user can accept invite', async () => {
    const ownerBody = await register(server, { email: 'owner2@example.com', username: 'owner2', displayName: 'Owner2', password: 'Pass1234' })
    const friendBody = await register(server, { email: 'friend2@example.com', username: 'friend2', displayName: 'Friend2', password: 'Pass1234' })

    await server.prisma.friendship.create({ data: { requesterId: ownerBody.user.id, addresseeId: friendBody.user.id, status: 'ACCEPTED' } })
    await server.prisma.user.update({ where: { id: friendBody.user.id }, data: { status: 'ONLINE' } })

    const tournament = await server.prisma.tournament.create({ data: { name: 'Invite Cup 2', createdById: ownerBody.user.id } })

    const inviteRes = await server.inject({
      method: 'POST',
      url: `/api/tournaments/${tournament.id}/invite`,
      headers: { authorization: `Bearer ${ownerBody.tokens.access}` },
      payload: { userId: friendBody.user.id }
    })
    expect(inviteRes.statusCode).toBe(201)
    const invite = inviteRes.json<{ data: { id: number } }>()

    const acceptRes = await server.inject({
      method: 'PATCH',
      url: `/api/tournaments/${tournament.id}/participants/${invite.data.id}`,
      headers: { authorization: `Bearer ${friendBody.tokens.access}` },
      payload: { action: 'ACCEPT' }
    })

    expect(acceptRes.statusCode).toBe(200)
    const accepted = acceptRes.json<{ data: { inviteState: string; joinedAt?: string } }>()
    expect(accepted.data.inviteState).toBe('ACCEPTED')
    expect(accepted.data.joinedAt).toBeTruthy()

    const ownerNotifs = await server.prisma.notification.findMany({ where: { userId: ownerBody.user.id } })
    expect(ownerNotifs.some(n => n.type === 'TOURNAMENT_INVITE')).toBe(true)
  })

  it('invite TTL expires and marks participant DECLINED', async () => {
    // For reliability across different timer implementations, use a short real TTL
    const originalTtl = process.env.TOURNAMENT_INVITE_TTL_SEC
    process.env.TOURNAMENT_INVITE_TTL_SEC = '1'
    try {
      const ownerBody = await register(server, { email: 'owner3@example.com', username: 'owner3', displayName: 'Owner3', password: 'Pass1234' })
      const friendBody = await register(server, { email: 'friend3@example.com', username: 'friend3', displayName: 'Friend3', password: 'Pass1234' })

      await server.prisma.friendship.create({ data: { requesterId: ownerBody.user.id, addresseeId: friendBody.user.id, status: 'ACCEPTED' } })
      await server.prisma.user.update({ where: { id: friendBody.user.id }, data: { status: 'ONLINE' } })

      const tournament = await server.prisma.tournament.create({ data: { name: 'Invite Cup 3', createdById: ownerBody.user.id } })

      const inviteRes = await server.inject({
        method: 'POST',
        url: `/api/tournaments/${tournament.id}/invite`,
        headers: { authorization: `Bearer ${ownerBody.tokens.access}` },
        payload: { userId: friendBody.user.id }
      })
      expect(inviteRes.statusCode).toBe(201)
      const invite = inviteRes.json<{ data: { id: number } }>()

      // Advance timers by the configured TTL (default 20s) - read env var if set
      const ttlSec = Number(process.env.TOURNAMENT_INVITE_TTL_SEC || 1)
      // Wait slightly longer than TTL to allow server-side expiry to run
      await new Promise((res) => setTimeout(res, ttlSec * 1000 + 300))

      const participant = await server.prisma.tournamentParticipant.findUnique({ where: { id: invite.data.id } })
      expect(participant?.inviteState).toBe('DECLINED')
    } finally {
      if (originalTtl === undefined) delete process.env.TOURNAMENT_INVITE_TTL_SEC
      else process.env.TOURNAMENT_INVITE_TTL_SEC = originalTtl
    }
  })
})
