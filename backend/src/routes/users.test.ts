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

  it('returns 400 for invalid query params', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/users', query: { limit: '0' } })

    expect(response.statusCode).toBe(400)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('INVALID_QUERY')
  })
})
