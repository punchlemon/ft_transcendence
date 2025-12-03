import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { buildServer } from '../app'

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
  // Chat related
  await prisma.message.deleteMany()
  await prisma.channelMember.deleteMany()
  await prisma.channelInvite.deleteMany()
  await prisma.channelBan.deleteMany()
  await prisma.channel.deleteMany()
  await prisma.partyMember.deleteMany()
  await prisma.partyInvite.deleteMany()
  await prisma.party.deleteMany()
  
  // Auth related
  await prisma.session.deleteMany()
  await prisma.oAuthAccount.deleteMany()
  await prisma.mfaChallenge.deleteMany()
  await prisma.twoFactorBackupCode.deleteMany()
  
  // Tournament related
  await prisma.tournamentMatch.deleteMany()
  await prisma.tournamentParticipant.deleteMany()
  await prisma.tournament.deleteMany()

  // Social related
  await prisma.friendship.deleteMany()
  await prisma.blocklist.deleteMany()
  await prisma.friendRequest.deleteMany()
  await prisma.notification.deleteMany()

  // Game related
  await prisma.matchResult.deleteMany()
  await prisma.matchRound.deleteMany()
  await prisma.penalty.deleteMany()
  await prisma.match.deleteMany()
  await prisma.userStats.deleteMany()
    // await prisma.ladderProfile.deleteMany()
    await prisma.ladderEnrollment.deleteMany()
  await prisma.userAchievement.deleteMany()
  await prisma.inventoryItem.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.wallet.deleteMany()
  await prisma.auditLog.deleteMany()

  // User related
  await prisma.user.deleteMany()
})

const registerUser = async (name: string) => {
  const payload = {
    email: `${name}@example.com`,
    username: name,
    password: 'Password123!',
    displayName: name
  }
  const res = await server.inject({
    method: 'POST',
    url: '/auth/register',
    payload
  })
  return res.json<{ user: { id: number }, tokens: { access: string } }>()
}

describe('Chat Routes', () => {
  it('should create a DM thread between two users', async () => {
    const user1 = await registerUser('alice')
    const user2 = await registerUser('bob')

    const res = await server.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: { authorization: `Bearer ${user1.tokens.access}` },
      payload: {
        type: 'DM',
        targetUserId: user2.user.id
      }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: { id: number } }>()
    expect(body.data.id).toBeDefined()

    const channel = await prisma.channel.findUnique({
      where: { id: body.data.id },
      include: { members: true }
    })
    expect(channel?.type).toBe('DM')
    expect(channel?.members).toHaveLength(2)
  })

  it('should return existing DM if trying to create duplicate', async () => {
    const user1 = await registerUser('alice')
    const user2 = await registerUser('bob')

    // First create
    const res1 = await server.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: { authorization: `Bearer ${user1.tokens.access}` },
      payload: { type: 'DM', targetUserId: user2.user.id }
    })
    const id1 = res1.json<{ data: { id: number } }>().data.id

    // Second create
    const res2 = await server.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: { authorization: `Bearer ${user1.tokens.access}` },
      payload: { type: 'DM', targetUserId: user2.user.id }
    })
    const id2 = res2.json<{ data: { id: number } }>().data.id

    expect(id1).toBe(id2)
  })

  it('should create a group thread', async () => {
    const user1 = await registerUser('alice')
    const user2 = await registerUser('bob')
    const user3 = await registerUser('charlie')

    const res = await server.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: { authorization: `Bearer ${user1.tokens.access}` },
      payload: {
        type: 'PUBLIC',
        name: 'General Chat'
      }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: { id: number } }>()
    
    const channel = await prisma.channel.findUnique({
      where: { id: body.data.id },
      include: { members: true }
    })
    expect(channel?.type).toBe('PUBLIC')
    expect(channel?.name).toBe('General Chat')
    expect(channel?.members).toHaveLength(1)
  })

  it('should list threads for user', async () => {
    const user1 = await registerUser('alice')
    const user2 = await registerUser('bob')

    // Create DM
    await server.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: { authorization: `Bearer ${user1.tokens.access}` },
      payload: { type: 'DM', targetUserId: user2.user.id }
    })

    const res = await server.inject({
      method: 'GET',
      url: '/api/chat/threads',
      headers: { authorization: `Bearer ${user1.tokens.access}` }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: any[] }>()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].type).toBe('DM')
    // Name should be Bob's display name for Alice
    expect(body.data[0].name).toBe('bob')
  })

  it('should send and receive messages', async () => {
    const user1 = await registerUser('alice')
    const user2 = await registerUser('bob')

    // Create DM
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: { authorization: `Bearer ${user1.tokens.access}` },
      payload: { type: 'DM', targetUserId: user2.user.id }
    })
    const channelId = createRes.json<{ data: { id: number } }>().data.id

    // Send message
    const sendRes = await server.inject({
      method: 'POST',
      url: `/api/chat/threads/${channelId}/messages`,
      headers: { authorization: `Bearer ${user1.tokens.access}` },
      payload: { content: 'Hello Bob!' }
    })
    expect(sendRes.statusCode).toBe(200)

    // Get messages
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/chat/threads/${channelId}/messages`,
      headers: { authorization: `Bearer ${user2.tokens.access}` }
    })
    expect(getRes.statusCode).toBe(200)
    const body = getRes.json<{ data: any[] }>()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].content).toBe('Hello Bob!')
    expect(body.data[0].user.displayName).toBe('alice')
  })

  it('should forbid access to non-members', async () => {
    const user1 = await registerUser('alice')
    const user2 = await registerUser('bob')
    const user3 = await registerUser('eve')

    // Create DM between Alice and Bob
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: { authorization: `Bearer ${user1.tokens.access}` },
      payload: { type: 'DM', targetUserId: user2.user.id }
    })
    const channelId = createRes.json<{ data: { id: number } }>().data.id

    // Eve tries to read messages
    const res = await server.inject({
      method: 'GET',
      url: `/api/chat/threads/${channelId}/messages`,
      headers: { authorization: `Bearer ${user3.tokens.access}` }
    })
    expect(res.statusCode).toBe(403)
  })
})
