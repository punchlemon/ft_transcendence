/**
 * なぜテストが必要か:
 * - `/auth/register` と `/auth/login` の入力検証・レスポンス構造・セキュリティ要件 (Argon2 ハッシュ/セッション生成) を保証する。
 * - 認証フローが `Session` テーブルと同期し、重複登録や不正ログインに適切な HTTP ステータスを返すか継続的に検証する。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'
import { buildServer } from '../app'

const basePayload = {
  email: 'player@example.com',
  username: 'player1',
  password: 'Secure123',
  displayName: 'Player One'
}

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
  await prisma.user.deleteMany()
})

describe('POST /auth/register', () => {

  it('creates a user with hashed password and returns tokens', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: basePayload
    })

    expect(response.statusCode).toBe(201)
    const body = response.json<{ user: { id: number; login: string; displayName: string; email: string }; tokens: { access: string; refresh: string } }>()

    expect(body.user).toMatchObject({
      login: basePayload.username,
      displayName: basePayload.displayName,
      email: basePayload.email.toLowerCase()
    })
    expect(body.tokens.access).toMatch(/\w+/)
    expect(body.tokens.refresh).toMatch(/\w+/)

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: body.user.id } })
    expect(stored.passwordHash).toBeTruthy()
    expect(stored.passwordHash).not.toBe(basePayload.password)
    const isValid = await argon2.verify(stored.passwordHash!, basePayload.password)
    expect(isValid).toBe(true)
    const session = await prisma.session.findFirstOrThrow({ where: { userId: stored.id } })
    expect(session.token).toBe(body.tokens.refresh)
  })

  it('rejects duplicate emails or usernames', async () => {
    await server.inject({ method: 'POST', url: '/auth/register', payload: basePayload })

    const response = await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        ...basePayload,
        password: 'Another123'
      }
    })

    expect(response.statusCode).toBe(409)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('USER_ALREADY_EXISTS')
  })

  it('validates payload and returns 400 for weak password', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'bad',
        username: 'p',
        password: '123',
        displayName: ''
      }
    })

    expect(response.statusCode).toBe(400)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('INVALID_BODY')
  })
})

describe('POST /auth/login', () => {
  it('logs in with valid credentials and issues a new session', async () => {
    const registerResponse = await server.inject({ method: 'POST', url: '/auth/register', payload: basePayload })
    const registered = registerResponse.json<{ user: { id: number } }>()

    const response = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: basePayload.email,
        password: basePayload.password
      }
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{
      user: { id: number; displayName: string; status: string }
      tokens: { access: string; refresh: string }
      mfaRequired: boolean
    }>()

    expect(body.user).toMatchObject({ id: registered.user.id, displayName: basePayload.displayName, status: 'ONLINE' })
    expect(body.mfaRequired).toBe(false)
    expect(body.tokens.access).toMatch(/\w+/)
    expect(body.tokens.refresh).toMatch(/\w+/)

    const sessions = await prisma.session.findMany({ where: { userId: registered.user.id }, orderBy: { id: 'desc' } })
    expect(sessions[0]?.token).toBe(body.tokens.refresh)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: registered.user.id } })
    expect(user.status).toBe('ONLINE')
    expect(user.lastLoginAt).not.toBeNull()
  })

  it('rejects invalid credential pairs', async () => {
    await server.inject({ method: 'POST', url: '/auth/register', payload: basePayload })

    const response = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: basePayload.email,
        password: 'WrongPassword1'
      }
    })

    expect(response.statusCode).toBe(401)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('validates payload shape', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'not-an-email', password: '123' }
    })

    expect(response.statusCode).toBe(400)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('INVALID_BODY')
  })
})

/*
解説:
1) 登録 API の正常系で Argon2 ハッシュと `Session` トークンの整合を確認し、重複登録・入力エラーの応答コードも検証する。
2) ログイン API の正常系でユーザー状態更新・新規セッショントークン発行・レスポンス構造を保証する。
3) 不正な資格情報や入力フォーマットに対して 401/400 を返すことを確認し、セキュリティ上のガードを自動テスト化する。
*/
