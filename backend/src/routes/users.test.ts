/**
 * なぜテストが必要か:
 * - `/api/users` の JWT 認証必須化により、Authorization ヘッダーの有無で 401 が返ることを保証する。
 * - ビューア ID を JWT ペイロードから導き mutualFriends を算出するロジックを検証する。
 * - ページング/フィルタ/除外など既存仕様がトークン導入後も回帰しないことを担保する。
 */
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
      ...data
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
      expiresAt: new Date(Date.now() + 1000 * 60 * 60)
    }
  })

  return server.issueAccessToken({ userId, sessionId: session.id })
}

const authHeader = (token: string) => ({ authorization: `Bearer ${token}` })

describe('GET /api/users', () => {
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
    await prisma.twoFactorBackupCode.deleteMany()
    await prisma.mfaChallenge.deleteMany()
    await prisma.user.deleteMany()
  })

  it('returns paginated users ordered by displayName', async () => {
    const carol = await createUser(prisma, { login: 'carol', email: 'carol@example.com', displayName: 'Carol', status: 'OFFLINE' })
    const alice = await createUser(prisma, { login: 'alice', email: 'alice@example.com', displayName: 'Alice', status: 'ONLINE' })
    await createUser(prisma, { login: 'bob', email: 'bob@example.com', displayName: 'Bob', status: 'IN_MATCH' })
    const token = await createSessionToken(server, prisma, carol.id)

    const response = await server.inject({
      method: 'GET',
      url: '/api/users',
      query: { page: '1', limit: '2' },
      headers: authHeader(token)
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ data: Array<{ displayName: string }>; meta: { total: number; page: number; limit: number } }>()

    expect(body.meta).toEqual({ page: 1, limit: 2, total: 3 })
    expect(body.data.map((item) => item.displayName)).toEqual(['Alice', 'Bob'])
  })

  it('filters by query and status', async () => {
    const carol = await createUser(prisma, { login: 'carol', email: 'carol@example.com', displayName: 'Carol', status: 'AWAY' })
    await createUser(prisma, { login: 'dave', email: 'dave@example.com', displayName: 'Dave', status: 'ONLINE' })
    const token = await createSessionToken(server, prisma, carol.id)

    const response = await server.inject({
      method: 'GET',
      url: '/api/users',
      query: { q: 'car', status: 'AWAY' },
      headers: authHeader(token)
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ data: Array<{ displayName: string }> }>()

    expect(body.data).toHaveLength(1)
    expect(body.data[0].displayName).toBe('Carol')
  })

  it('excludes ids and clamps limit to 50', async () => {
    const alice = await createUser(prisma, { login: 'alice', email: 'alice@example.com', displayName: 'Alice', status: 'ONLINE' })
    await createUser(prisma, { login: 'bob', email: 'bob@example.com', displayName: 'Bob', status: 'ONLINE' })
    await createUser(prisma, { login: 'carol', email: 'carol@example.com', displayName: 'Carol', status: 'ONLINE' })
    const token = await createSessionToken(server, prisma, alice.id)

    const response = await server.inject({
      method: 'GET',
      url: '/api/users',
      query: {
        excludeFriendIds: `${alice.id}`,
        limit: '200'
      },
      headers: authHeader(token)
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ data: Array<{ id: number }>; meta: { limit: number } }>()

    expect(body.meta.limit).toBe(50)
    expect(body.data.find((item) => item.id === alice.id)).toBeUndefined()
  })

  it('computes mutual friend counts using viewer header', async () => {
    const viewer = await createUser(prisma, { login: 'viewer', email: 'viewer@example.com', displayName: 'Viewer', status: 'ONLINE' })
    const ally = await createUser(prisma, { login: 'ally', email: 'ally@example.com', displayName: 'Ally', status: 'ONLINE' })
    const buddy = await createUser(prisma, { login: 'buddy', email: 'buddy@example.com', displayName: 'Buddy', status: 'ONLINE' })
    const stranger = await createUser(prisma, { login: 'stranger', email: 'stranger@example.com', displayName: 'Stranger', status: 'ONLINE' })
    const target = await createUser(prisma, { login: 'target', email: 'target@example.com', displayName: 'Target', status: 'ONLINE' })

    await connectFriends(prisma, viewer.id, ally.id)
    await connectFriends(prisma, viewer.id, buddy.id)
    await connectFriends(prisma, target.id, ally.id)
    await connectFriends(prisma, target.id, buddy.id)
    await connectFriends(prisma, target.id, stranger.id)
    const token = await createSessionToken(server, prisma, viewer.id)

    const response = await server.inject({
      method: 'GET',
      url: '/api/users',
      headers: authHeader(token),
      query: { q: 'Target' }
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ data: Array<{ id: number; mutualFriends: number }> }>()
    expect(body.data[0]).toMatchObject({ id: target.id, mutualFriends: 2 })
  })

  it('rejects requests without Authorization header', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/users' })

    expect(response.statusCode).toBe(401)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 400 for invalid query params', async () => {
    const viewer = await createUser(prisma, { login: 'viewer', email: 'viewer@example.com', displayName: 'Viewer', status: 'ONLINE' })
    const token = await createSessionToken(server, prisma, viewer.id)
    const response = await server.inject({
      method: 'GET',
      url: '/api/users',
      query: { limit: '0' },
      headers: authHeader(token)
    })

    expect(response.statusCode).toBe(400)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('INVALID_QUERY')
  })
})

/*
解説:
1) connectFriends ヘルパーでフレンド関係生成を簡潔化し、JWT 導入後も再利用できる形にした。
2) セッション・フレンド・ユーザーを毎テスト初期化し、Authorization ヘッダー有無や viewer 計算の副作用を排除している。
3) JWT で発行したトークンを用いた認可・相互友人数ロジック・既存パラメータ制約の回帰を網羅的に検証している。
*/
