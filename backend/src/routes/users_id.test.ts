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
  country?: string
}) =>
  prisma.user.create({
    data: {
      passwordHash: 'hashed',
      ...data,
      stats: {
        create: {
          wins: 10,
          losses: 5,
          matchesPlayed: 15,
          pointsScored: 100,
          pointsAgainst: 50
        }
      },
      ladderProfile: {
        create: {
          mmr: 1500,
          tier: 'GOLD',
          division: 2
        }
      }
    }
  })

const connectFriends = async (prisma: PrismaClient, userAId: number, userBId: number, status: string = 'ACCEPTED') => {
  const [requesterId, addresseeId] = userAId < userBId ? [userAId, userBId] : [userBId, userAId]

  await prisma.friendship.create({
    data: {
      requesterId,
      addresseeId,
      status
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

describe('GET /api/users/:id', () => {
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
    await prisma.session.deleteMany()
    await prisma.friendship.deleteMany()
    await prisma.userStats.deleteMany()
    await prisma.ladderProfile.deleteMany()
    await prisma.user.deleteMany()
  })

  it('returns user details with stats', async () => {
    const viewer = await createUser(prisma, { login: 'viewer', email: 'viewer@example.com', displayName: 'Viewer' })
    const target = await createUser(prisma, { login: 'target', email: 'target@example.com', displayName: 'Target' })
    const token = await createSessionToken(server, prisma, viewer.id)

    const response = await server.inject({
      method: 'GET',
      url: `/api/users/${target.id}`,
      headers: authHeader(token)
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toMatchObject({
      id: target.id,
      displayName: 'Target',
      stats: {
        wins: 10,
        losses: 5
      },
      ladder: {
        tier: 'GOLD'
      },
      friendshipStatus: 'NONE',
      mutualFriends: 0
    })
  })

  it('returns 404 for non-existent user', async () => {
    const viewer = await createUser(prisma, { login: 'viewer', email: 'viewer@example.com', displayName: 'Viewer' })
    const token = await createSessionToken(server, prisma, viewer.id)

    const response = await server.inject({
      method: 'GET',
      url: '/api/users/999999',
      headers: authHeader(token)
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('USER_NOT_FOUND')
  })

  it('returns correct friendship status (FRIEND)', async () => {
    const viewer = await createUser(prisma, { login: 'viewer', email: 'viewer@example.com', displayName: 'Viewer' })
    const target = await createUser(prisma, { login: 'target', email: 'target@example.com', displayName: 'Target' })
    await connectFriends(prisma, viewer.id, target.id, 'ACCEPTED')
    const token = await createSessionToken(server, prisma, viewer.id)

    const response = await server.inject({
      method: 'GET',
      url: `/api/users/${target.id}`,
      headers: authHeader(token)
    })

    expect(response.json().friendshipStatus).toBe('FRIEND')
  })

  it('returns correct friendship status (PENDING)', async () => {
    const viewer = await createUser(prisma, { login: 'viewer', email: 'viewer@example.com', displayName: 'Viewer' })
    const target = await createUser(prisma, { login: 'target', email: 'target@example.com', displayName: 'Target' })
    
    // Viewer sent request to Target
    await prisma.friendship.create({
      data: {
        requesterId: viewer.id,
        addresseeId: target.id,
        status: 'PENDING'
      }
    })
    
    const token = await createSessionToken(server, prisma, viewer.id)

    const response = await server.inject({
      method: 'GET',
      url: `/api/users/${target.id}`,
      headers: authHeader(token)
    })

    expect(response.json().friendshipStatus).toBe('PENDING_SENT')
  })

  it('returns correct friendship status (PENDING_RECEIVED)', async () => {
    const viewer = await createUser(prisma, { login: 'viewer', email: 'viewer@example.com', displayName: 'Viewer' })
    const target = await createUser(prisma, { login: 'target', email: 'target@example.com', displayName: 'Target' })
    
    // Target sent request to Viewer
    await prisma.friendship.create({
      data: {
        requesterId: target.id,
        addresseeId: viewer.id,
        status: 'PENDING'
      }
    })
    
    const token = await createSessionToken(server, prisma, viewer.id)

    const response = await server.inject({
      method: 'GET',
      url: `/api/users/${target.id}`,
      headers: authHeader(token)
    })

    expect(response.json().friendshipStatus).toBe('PENDING_RECEIVED')
  })

  it('calculates mutual friends correctly', async () => {
    const viewer = await createUser(prisma, { login: 'viewer', email: 'viewer@example.com', displayName: 'Viewer' })
    const target = await createUser(prisma, { login: 'target', email: 'target@example.com', displayName: 'Target' })
    const friend1 = await createUser(prisma, { login: 'f1', email: 'f1@example.com', displayName: 'F1' })
    const friend2 = await createUser(prisma, { login: 'f2', email: 'f2@example.com', displayName: 'F2' })

    // Viewer friends with F1, F2
    await connectFriends(prisma, viewer.id, friend1.id)
    await connectFriends(prisma, viewer.id, friend2.id)

    // Target friends with F1, F2
    await connectFriends(prisma, target.id, friend1.id)
    await connectFriends(prisma, target.id, friend2.id)

    const token = await createSessionToken(server, prisma, viewer.id)

    const response = await server.inject({
      method: 'GET',
      url: `/api/users/${target.id}`,
      headers: authHeader(token)
    })

    expect(response.json().mutualFriends).toBe(2)
  })
})
