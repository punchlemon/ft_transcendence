import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { buildServer } from '../app'

const createUser = (prisma: PrismaClient, data: {
  login: string
  email: string
  displayName: string
  status?: string
}) =>
  prisma.user.create({
    data: {
      passwordHash: 'hashed',
      ...data
    }
  })

const createMatch = (prisma: PrismaClient, playerAId: number, playerBId: number, winnerId: number) =>
  prisma.match.create({
    data: {
      playerAId,
      playerBId,
      winnerId,
      mode: 'STANDARD',
      status: 'FINISHED',
      startedAt: new Date(),
      endedAt: new Date(),
      results: {
        create: [
          { userId: playerAId, outcome: winnerId === playerAId ? 'WIN' : 'LOSS', score: 11 },
          { userId: playerBId, outcome: winnerId === playerBId ? 'WIN' : 'LOSS', score: 5 }
        ]
      }
    }
  })

const connectFriends = async (prisma: PrismaClient, userAId: number, userBId: number) => {
  const [requesterId, addresseeId] = userAId < userBId ? [userAId, userBId] : [userBId, userAId]
  await prisma.friendship.create({
    data: {
      requesterId,
      addresseeId,
      status: 'ACCEPTED'
    }
  })
}

const createSessionToken = async (server: FastifyInstance, prisma: PrismaClient, userId: number) => {
  const session = await prisma.session.create({
    data: {
      userId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      lastUsedAt: new Date(),
      ipAddress: '127.0.0.1',
      userAgent: 'vitest'
    }
  })
  return server.issueAccessToken({ userId, sessionId: session.id })
}

const authHeader = (token: string) => ({ authorization: `Bearer ${token}` })

describe('User History & Friends API', () => {
  let server: FastifyInstance
  let prisma: PrismaClient

  beforeAll(async () => {
    server = await buildServer()
    prisma = server.prisma
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(async () => {
    await prisma.message.deleteMany()
    await prisma.channelMember.deleteMany()
    await prisma.channelInvite.deleteMany()
    await prisma.channelBan.deleteMany()
    await prisma.channel.deleteMany()
    await prisma.partyMember.deleteMany()
    await prisma.partyInvite.deleteMany()
    await prisma.party.deleteMany()
    await prisma.tournamentMatch.deleteMany()
    await prisma.tournamentParticipant.deleteMany()
    await prisma.tournament.deleteMany()
    await prisma.twoFactorBackupCode.deleteMany()
    await prisma.mfaChallenge.deleteMany()
    await prisma.matchResult.deleteMany()
    await prisma.penalty.deleteMany()
    await prisma.match.deleteMany()
    await prisma.friendship.deleteMany()
    await prisma.friendRequest.deleteMany()
    await prisma.blocklist.deleteMany()
    await prisma.session.deleteMany()
    await prisma.userStats.deleteMany()
    await prisma.userAchievement.deleteMany()
    await prisma.notification.deleteMany()
    await prisma.auditLog.deleteMany()
    await prisma.oAuthAccount.deleteMany()
    // await prisma.ladderProfile.deleteMany()
    await prisma.ladderEnrollment.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.wallet.deleteMany()
    await prisma.inventoryItem.deleteMany()
    await prisma.user.deleteMany()
  })

  describe('GET /api/users/:id/matches', () => {
    it('returns match history for user', async () => {
      const user = await createUser(prisma, { login: 'hero', email: 'hero@example.com', displayName: 'Hero' })
      const opponent = await createUser(prisma, { login: 'villain', email: 'villain@example.com', displayName: 'Villain' })
      
      await createMatch(prisma, user.id, opponent.id, user.id) // Win
      await createMatch(prisma, opponent.id, user.id, opponent.id) // Loss

      const token = await createSessionToken(server, prisma, user.id)
      const response = await server.inject({
        method: 'GET',
        url: `/api/users/${user.id}/matches`,
        headers: authHeader(token)
      })

      expect(response.statusCode).toBe(200)
      const body = response.json<{ data: any[] }>()
      expect(body.data).toHaveLength(2)
      // Most recent match (Loss)
      expect(body.data[0].opponent.displayName).toBe('Villain')
      expect(body.data[0].result).toBe('LOSS')
      // Older match (Win)
      expect(body.data[1].opponent.displayName).toBe('Villain')
      expect(body.data[1].result).toBe('WIN')
    })
  })

  describe('GET /api/users/:id/friends', () => {
    it('returns friends list for user', async () => {
      const user = await createUser(prisma, { login: 'hero', email: 'hero@example.com', displayName: 'Hero' })
      const friend1 = await createUser(prisma, { login: 'f1', email: 'f1@example.com', displayName: 'Friend1', status: 'ONLINE' })
      const friend2 = await createUser(prisma, { login: 'f2', email: 'f2@example.com', displayName: 'Friend2', status: 'OFFLINE' })
      
      await connectFriends(prisma, user.id, friend1.id)
      await connectFriends(prisma, user.id, friend2.id)

      const token = await createSessionToken(server, prisma, user.id)
      const response = await server.inject({
        method: 'GET',
        url: `/api/users/${user.id}/friends`,
        headers: authHeader(token)
      })

      expect(response.statusCode).toBe(200)
      const body = response.json<{ data: any[] }>()
      expect(body.data).toHaveLength(2)
      const names = body.data.map((f: any) => f.displayName).sort()
      expect(names).toEqual(['Friend1', 'Friend2'])
      expect(body.data.find((f: any) => f.displayName === 'Friend1').status).toBe('ONLINE')
    })
  })
})
