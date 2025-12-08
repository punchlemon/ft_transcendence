import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { buildServer } from '../app'
import { calculateUserStats } from './stats'

describe('Stats Calculation Fix', () => {
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
    await prisma.notification.deleteMany()
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
    await prisma.matchResult.deleteMany()
    await prisma.matchRound.deleteMany()
    await prisma.penalty.deleteMany()
    await prisma.match.deleteMany()
    await prisma.friendship.deleteMany()
    await prisma.blocklist.deleteMany()
    await prisma.friendRequest.deleteMany()
    await prisma.userStats.deleteMany()
    await prisma.ladderEnrollment.deleteMany()
    await prisma.wallet.deleteMany()
    await prisma.inventoryItem.deleteMany()
    await prisma.userAchievement.deleteMany()
    await prisma.auditLog.deleteMany()
    await prisma.oAuthState.deleteMany()
    await prisma.oAuthAccount.deleteMany()
    await prisma.mfaChallenge.deleteMany()
    await prisma.session.deleteMany()
    await prisma.twoFactorBackupCode.deleteMany()
    await prisma.user.deleteMany()
  })

  it('should count AI match loss (winnerId=null) as a loss', async () => {
    const user = await prisma.user.create({
      data: {
        login: 'test_user',
        email: 'test@example.com',
        displayName: 'Test User',
        passwordHash: 'hashed'
      }
    })

    // Create a match where user played against AI (playerBId=null) and lost (winnerId=null)
    await prisma.match.create({
      data: {
        playerAId: user.id,
        playerBId: null, // AI
        winnerId: null, // AI won
        mode: 'STANDARD',
        status: 'FINISHED',
        startedAt: new Date(),
        endedAt: new Date()
      }
    })

    const stats = await calculateUserStats(prisma, user.id)
    expect(stats.matchesPlayed).toBe(1)
    expect(stats.wins).toBe(0)
    expect(stats.losses).toBe(1)
  })

  it('should count AI match win (winnerId=userId) as a win', async () => {
    const user = await prisma.user.create({
      data: {
        login: 'test_user_win',
        email: 'test_win@example.com',
        displayName: 'Test User Win',
        passwordHash: 'hashed'
      }
    })

    // Create a match where user played against AI (playerBId=null) and won (winnerId=userId)
    await prisma.match.create({
      data: {
        playerAId: user.id,
        playerBId: null, // AI
        winnerId: user.id, // User won
        mode: 'STANDARD',
        status: 'FINISHED',
        startedAt: new Date(),
        endedAt: new Date()
      }
    })

    const stats = await calculateUserStats(prisma, user.id)
    expect(stats.matchesPlayed).toBe(1)
    expect(stats.wins).toBe(1)
    expect(stats.losses).toBe(0)
  })
})
