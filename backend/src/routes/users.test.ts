import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
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
    await prisma.friendship.deleteMany()
    await prisma.user.deleteMany()
  })

  it('returns paginated users ordered by displayName', async () => {
    await createUser(prisma, { login: 'carol', email: 'carol@example.com', displayName: 'Carol', status: 'OFFLINE' })
    await createUser(prisma, { login: 'alice', email: 'alice@example.com', displayName: 'Alice', status: 'ONLINE' })
    await createUser(prisma, { login: 'bob', email: 'bob@example.com', displayName: 'Bob', status: 'IN_MATCH' })

    const response = await server.inject({ method: 'GET', url: '/api/users', query: { page: '1', limit: '2' } })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ data: Array<{ displayName: string }>; meta: { total: number; page: number; limit: number } }>()

    expect(body.meta).toEqual({ page: 1, limit: 2, total: 3 })
    expect(body.data.map((item) => item.displayName)).toEqual(['Alice', 'Bob'])
  })

  it('filters by query and status', async () => {
    await createUser(prisma, { login: 'carol', email: 'carol@example.com', displayName: 'Carol', status: 'AWAY' })
    await createUser(prisma, { login: 'dave', email: 'dave@example.com', displayName: 'Dave', status: 'ONLINE' })

    const response = await server.inject({ method: 'GET', url: '/api/users', query: { q: 'car', status: 'AWAY' } })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ data: Array<{ displayName: string }> }>()

    expect(body.data).toHaveLength(1)
    expect(body.data[0].displayName).toBe('Carol')
  })

  it('excludes ids and clamps limit to 50', async () => {
    const alice = await createUser(prisma, { login: 'alice', email: 'alice@example.com', displayName: 'Alice', status: 'ONLINE' })
    await createUser(prisma, { login: 'bob', email: 'bob@example.com', displayName: 'Bob', status: 'ONLINE' })
    await createUser(prisma, { login: 'carol', email: 'carol@example.com', displayName: 'Carol', status: 'ONLINE' })

    const response = await server.inject({
      method: 'GET',
      url: '/api/users',
      query: {
        excludeFriendIds: `${alice.id}`,
        limit: '200'
      }
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

    const response = await server.inject({
      method: 'GET',
      url: '/api/users',
      headers: { 'x-user-id': viewer.id.toString() },
      query: { q: 'Target' }
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ data: Array<{ id: number; mutualFriends: number }> }>()
    expect(body.data[0]).toMatchObject({ id: target.id, mutualFriends: 2 })
  })

  it('returns 400 for invalid query params', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/users', query: { limit: '0' } })

    expect(response.statusCode).toBe(400)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('INVALID_QUERY')
  })
})

/*
解説:
1) connectFriends ヘルパーを導入し、双方向フレンドシップの生成と `status = ACCEPTED` 固定を簡潔にした。
2) beforeEach で `friendship` テーブルも掃除することで、テスト間の外部キー汚染を防ぐ。
3) 新規テストでは `X-User-Id` を用いた viewer コンテキストで相互友人数が期待通り 2 となることを検証し、API 仕様の暫定要件を自動化した。
*/
