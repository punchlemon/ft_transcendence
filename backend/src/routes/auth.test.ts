/**
 * なぜテストが必要か:
 * - `/auth/register` と `/auth/login` の入力検証・レスポンス構造・セキュリティ要件 (Argon2 ハッシュ/セッション生成) を保証する。
 * - 認証フローが `Session` テーブルと同期し、重複登録や不正ログインに適切な HTTP ステータスを返すか継続的に検証する。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi, type Mock } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'
import { randomUUID } from 'node:crypto'
import { authenticator } from 'otplib'
import { buildServer } from '../app'
import * as undici from 'undici'

const basePayload = {
  email: 'player@example.com',
  username: 'player1',
  password: 'Secure123',
  displayName: 'Player One'
}

const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

process.env.OAUTH_REDIRECT_WHITELIST = 'https://app.ft/oauth/callback'
process.env.FORTYTWO_OAUTH_CLIENT_ID = 'test-42-client-id'
process.env.FORTYTWO_OAUTH_CLIENT_SECRET = 'test-42-client-secret'
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-google-client-id'
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-google-client-secret'

vi.mock('undici', async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return {
    ...actual,
    fetch: vi.fn()
  }
})

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
  await prisma.ladderProfile.deleteMany()
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

afterEach(() => {
  ;(undici.fetch as unknown as Mock).mockReset()
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
    expect(body.tokens.access).toMatch(jwtPattern)
    expect(body.tokens.refresh).toMatch(/\w+/)

    const decoded = server.jwt.decode<{ userId: number; sessionId: number }>(body.tokens.access)
    expect(decoded?.userId).toBe(body.user.id)

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
    expect(body.tokens.access).toMatch(jwtPattern)
    expect(body.tokens.refresh).toMatch(/\w+/)

    const decoded = server.jwt.decode<{ userId: number; sessionId: number }>(body.tokens.access)
    expect(decoded?.userId).toBe(body.user.id)

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

describe('POST /auth/refresh', () => {
  it('rotates the refresh token and extends the session validity', async () => {
    const registerResponse = await server.inject({ method: 'POST', url: '/auth/register', payload: basePayload })
    const registerBody = registerResponse.json<{ tokens: { refresh: string } }>()

    const response = await server.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: registerBody.tokens.refresh }
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{
      user: { id: number; displayName: string; status: string }
      tokens: { access: string; refresh: string }
    }>()

    expect(body.tokens.access).toMatch(jwtPattern)
    expect(body.tokens.refresh).not.toBe(registerBody.tokens.refresh)
    const newSession = await prisma.session.findUnique({ where: { token: body.tokens.refresh } })
    expect(newSession).not.toBeNull()
    expect(newSession?.expiresAt.getTime() ?? 0).toBeGreaterThan(Date.now())
    const oldSession = await prisma.session.findFirst({ where: { token: registerBody.tokens.refresh } })
    expect(oldSession).toBeNull()

    const decoded = server.jwt.decode<{ userId: number; sessionId: number }>(body.tokens.access)
    expect(decoded?.userId).toBe(body.user.id)
  })

  it('rejects expired refresh tokens and purges the session', async () => {
    const registerResponse = await server.inject({ method: 'POST', url: '/auth/register', payload: basePayload })
    const registered = registerResponse.json<{ user: { id: number } }>()
    const expiredToken = randomUUID()

    await prisma.session.create({
      data: {
        userId: registered.user.id,
        token: expiredToken,
        expiresAt: new Date(Date.now() - 1000),
        lastUsedAt: new Date(Date.now() - 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'vitest'
      }
    })

    const response = await server.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: expiredToken }
    })

    expect(response.statusCode).toBe(401)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('INVALID_REFRESH_TOKEN')
    const leftover = await prisma.session.findFirst({ where: { token: expiredToken } })
    expect(leftover).toBeNull()
  })
})

describe('POST /auth/logout', () => {
  it('deletes the session and is idempotent', async () => {
    const registerResponse = await server.inject({ method: 'POST', url: '/auth/register', payload: basePayload })
    const registerBody = registerResponse.json<{ tokens: { refresh: string } }>()

    const firstResponse = await server.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: registerBody.tokens.refresh }
    })

    expect(firstResponse.statusCode).toBe(204)
    const sessionsAfterLogout = await prisma.session.count({ where: { token: registerBody.tokens.refresh } })
    expect(sessionsAfterLogout).toBe(0)

    const secondResponse = await server.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: registerBody.tokens.refresh }
    })

    expect(secondResponse.statusCode).toBe(204)
  })

  it('validates body shape and returns 400 when missing token', async () => {
    const response = await server.inject({ method: 'POST', url: '/auth/logout', payload: {} })
    expect(response.statusCode).toBe(400)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('INVALID_BODY')
  })
})

describe('GET /auth/sessions and DELETE /auth/sessions/:sessionId', () => {
  it('lists every active session for the authenticated user', async () => {
    await server.inject({ method: 'POST', url: '/auth/register', payload: basePayload })
    const loginResponse = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: basePayload.email, password: basePayload.password }
    })

    const loginBody = loginResponse.json<{ tokens: { access: string } }>()

    const listResponse = await server.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: { authorization: `Bearer ${loginBody.tokens.access}` }
    })

    expect(listResponse.statusCode).toBe(200)
    const listBody = listResponse.json<{
      sessions: Array<{ id: number; current: boolean; userAgent: string | null; ipAddress: string | null; lastUsedAt: string }>
    }>()

    expect(listBody.sessions.length).toBeGreaterThanOrEqual(2)
    expect(listBody.sessions.some((session) => session.current)).toBe(true)
    expect(listBody.sessions.some((session) => !session.current)).toBe(true)
    const currentSession = listBody.sessions.find((session) => session.current)
    expect(currentSession?.userAgent).toBeTruthy()
    expect(new Date(currentSession?.lastUsedAt ?? '').getTime()).toBeGreaterThan(0)
  })

  it('revokes a specific session by id', async () => {
    await server.inject({ method: 'POST', url: '/auth/register', payload: basePayload })
    const loginResponse = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: basePayload.email, password: basePayload.password }
    })
    const loginBody = loginResponse.json<{ tokens: { access: string } }>()

    const listBefore = await server.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: { authorization: `Bearer ${loginBody.tokens.access}` }
    })
    const beforeBody = listBefore.json<{
      sessions: Array<{ id: number; current: boolean }>
    }>()

    expect(beforeBody.sessions.length).toBeGreaterThan(1)
    const target = beforeBody.sessions.find((session) => session.current === false)
    expect(target).toBeTruthy()

    const deleteResponse = await server.inject({
      method: 'DELETE',
      url: `/auth/sessions/${target!.id}`,
      headers: { authorization: `Bearer ${loginBody.tokens.access}` }
    })

    expect(deleteResponse.statusCode).toBe(204)

    const deleteAgain = await server.inject({
      method: 'DELETE',
      url: `/auth/sessions/${target!.id}`,
      headers: { authorization: `Bearer ${loginBody.tokens.access}` }
    })
    expect(deleteAgain.statusCode).toBe(404)

    const listAfter = await server.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: { authorization: `Bearer ${loginBody.tokens.access}` }
    })
    const afterBody = listAfter.json<{ sessions: Array<{ id: number }> }>()
    expect(afterBody.sessions.find((session) => session.id === target!.id)).toBeUndefined()
  })
})

describe('MFA management and challenge flow', () => {
  const authHeader = (token: string) => ({ authorization: `Bearer ${token}` })

  const registerAndLogin = async () => {
    await server.inject({ method: 'POST', url: '/auth/register', payload: basePayload })
    const loginResponse = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: basePayload.email, password: basePayload.password }
    })

    return loginResponse.json<{
      user: { id: number }
      tokens: { access: string; refresh: string }
    }>()
  }

  it('enables and disables MFA via setup/verify/delete endpoints', async () => {
    const { user, tokens } = await registerAndLogin()

    const setupResponse = await server.inject({
      method: 'GET',
      url: '/auth/mfa/setup',
      headers: authHeader(tokens.access)
    })

    expect(setupResponse.statusCode).toBe(200)
    const setupBody = setupResponse.json<{ secret: string; otpauthUrl: string }>()
  expect(setupBody.secret.length).toBeGreaterThanOrEqual(32)
    expect(setupBody.otpauthUrl).toContain('otpauth://totp/')

    const verifyResponse = await server.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: authHeader(tokens.access),
      payload: { code: authenticator.generate(setupBody.secret) }
    })

    expect(verifyResponse.statusCode).toBe(200)
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(updated.twoFAEnabled).toBe(true)
    expect(updated.twoFASecret).toBe(setupBody.secret)

    const secondSetup = await server.inject({
      method: 'GET',
      url: '/auth/mfa/setup',
      headers: authHeader(tokens.access)
    })
    expect(secondSetup.statusCode).toBe(409)

    const disableResponse = await server.inject({
      method: 'DELETE',
      url: '/auth/mfa',
      headers: authHeader(tokens.access),
      payload: { code: authenticator.generate(setupBody.secret) }
    })

    expect(disableResponse.statusCode).toBe(204)
    const disabled = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(disabled.twoFAEnabled).toBe(false)
    expect(disabled.twoFASecret).toBeNull()
  })

  it('completes login via MFA challenge when 2FA is enabled', async () => {
    const { tokens } = await registerAndLogin()

    const setupResponse = await server.inject({ method: 'GET', url: '/auth/mfa/setup', headers: authHeader(tokens.access) })
    const setupBody = setupResponse.json<{ secret: string }>()
    await server.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: authHeader(tokens.access),
      payload: { code: authenticator.generate(setupBody.secret) }
    })

    const loginResponse = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: basePayload.email, password: basePayload.password }
    })

    expect(loginResponse.statusCode).toBe(423)
    const loginBody = loginResponse.json<{ error: { code: string }; mfaRequired: boolean; challengeId: string }>()
    expect(loginBody.error.code).toBe('MFA_REQUIRED')
    expect(loginBody.mfaRequired).toBe(true)
    expect(loginBody.challengeId).toMatch(/-/)

    const challengeResponse = await server.inject({
      method: 'POST',
      url: '/auth/mfa/challenge',
      payload: { challengeId: loginBody.challengeId, code: authenticator.generate(setupBody.secret) }
    })

    expect(challengeResponse.statusCode).toBe(200)
    const challengeBody = challengeResponse.json<{
      user: { id: number }
      tokens: { access: string; refresh: string }
    }>()
    expect(challengeBody.tokens.access).toMatch(jwtPattern)
    expect(challengeBody.tokens.refresh).toBeTruthy()

    const remainingChallenges = await prisma.mfaChallenge.count()
    expect(remainingChallenges).toBe(0)
  })

  it('rejects backup-code operations when MFA is disabled or query is invalid', async () => {
    const { tokens } = await registerAndLogin()

    const response = await server.inject({
      method: 'GET',
      url: '/auth/mfa/backup-codes',
      headers: authHeader(tokens.access)
    })

    expect(response.statusCode).toBe(409)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('MFA_NOT_ENABLED')

    const invalidQuery = await server.inject({
      method: 'GET',
      url: '/auth/mfa/backup-codes',
      headers: authHeader(tokens.access),
      query: { regenerate: 'maybe' }
    })

    expect(invalidQuery.statusCode).toBe(400)
    const invalidBody = invalidQuery.json<{ error: { code: string } }>()
    expect(invalidBody.error.code).toBe('INVALID_QUERY')
  })

  it('regenerates, consumes, and exhausts MFA backup codes', async () => {
    const { user, tokens } = await registerAndLogin()

    const setupResponse = await server.inject({ method: 'GET', url: '/auth/mfa/setup', headers: authHeader(tokens.access) })
    const setupBody = setupResponse.json<{ secret: string }>()
    await server.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: authHeader(tokens.access),
      payload: { code: authenticator.generate(setupBody.secret) }
    })

    const regenerateResponse = await server.inject({
      method: 'GET',
      url: '/auth/mfa/backup-codes',
      headers: authHeader(tokens.access),
      query: { regenerate: 'true' }
    })

    expect(regenerateResponse.statusCode).toBe(200)
    const regenerateBody = regenerateResponse.json<{ regenerated: boolean; codes: string[]; remaining: number }>()
    expect(regenerateBody.regenerated).toBe(true)
    expect(regenerateBody.codes).toHaveLength(10)
    regenerateBody.codes.forEach((code) => expect(code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/))
    expect(regenerateBody.remaining).toBe(10)

    const remainingResponse = await server.inject({
      method: 'GET',
      url: '/auth/mfa/backup-codes',
      headers: authHeader(tokens.access)
    })
    expect(remainingResponse.statusCode).toBe(200)
    const remainingBody = remainingResponse.json<{ regenerated: boolean; remaining: number }>()
    expect(remainingBody.regenerated).toBe(false)
    expect(remainingBody.remaining).toBe(10)

    const loginResponse = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: basePayload.email, password: basePayload.password }
    })

    expect(loginResponse.statusCode).toBe(423)
    const loginBody = loginResponse.json<{ challengeId: string }>()
    const backupResponse = await server.inject({
      method: 'POST',
      url: '/auth/mfa/challenge',
      payload: { challengeId: loginBody.challengeId, backupCode: regenerateBody.codes[0] }
    })

    expect(backupResponse.statusCode).toBe(200)
    const usedCount = await prisma.twoFactorBackupCode.count({ where: { userId: user.id, usedAt: { not: null } } })
    expect(usedCount).toBe(1)

    const reuseLogin = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: basePayload.email, password: basePayload.password }
    })
    expect(reuseLogin.statusCode).toBe(423)
    const reuseBody = reuseLogin.json<{ challengeId: string }>()
    const reuseResponse = await server.inject({
      method: 'POST',
      url: '/auth/mfa/challenge',
      payload: { challengeId: reuseBody.challengeId, backupCode: regenerateBody.codes[0] }
    })

    expect(reuseResponse.statusCode).toBe(400)
    const reuseError = reuseResponse.json<{ error: { code: string } }>()
    expect(reuseError.error.code).toBe('INVALID_MFA_CODE')

    await prisma.twoFactorBackupCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } })

    const exhaustedLogin = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: basePayload.email, password: basePayload.password }
    })
    expect(exhaustedLogin.statusCode).toBe(423)
    const exhaustedBody = exhaustedLogin.json<{ challengeId: string }>()
    const exhaustedResponse = await server.inject({
      method: 'POST',
      url: '/auth/mfa/challenge',
      payload: { challengeId: exhaustedBody.challengeId, backupCode: regenerateBody.codes[1] }
    })

    expect(exhaustedResponse.statusCode).toBe(409)
    const exhaustedError = exhaustedResponse.json<{ error: { code: string } }>()
    expect(exhaustedError.error.code).toBe('MFA_BACKUP_CODES_EXHAUSTED')
  })
})

describe('OAuth flow', () => {
  const redirectUri = 'https://app.ft/oauth/callback'

  it('returns 404 for unsupported providers', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/oauth/unknown/url',
      query: { redirectUri }
    })

    expect(response.statusCode).toBe(404)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('OAUTH_PROVIDER_NOT_SUPPORTED')
  })

  it('rejects redirect URIs outside the whitelist', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/oauth/fortytwo/url',
      query: { redirectUri: 'https://evil.example.com/callback' }
    })

    expect(response.statusCode).toBe(400)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('INVALID_REDIRECT_URI')
  })

  it('returns a PKCE challenge for Google integrations', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/oauth/google/url',
      query: { redirectUri }
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ codeChallenge: string | null; authorizationUrl: string }>()
    expect(body.codeChallenge).toBeTruthy()
    expect(body.authorizationUrl).toContain('code_challenge=')
  })

  it('completes OAuth exchange and creates a new user session', async () => {
    const urlResponse = await server.inject({
      method: 'GET',
      url: '/auth/oauth/fortytwo/url',
      query: { redirectUri }
    })

    const urlBody = urlResponse.json<{ state: string }>()
    const tokenResponse = new undici.Response(
      JSON.stringify({ access_token: 'provider-access', refresh_token: 'provider-refresh', expires_in: 3600 }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
    const profileResponse = new undici.Response(
      JSON.stringify({
        id: 99,
        email: 'oauth-user@example.com',
        usual_full_name: 'OAuth User',
        login: 'oauthuser',
        image: { link: 'https://cdn.example.com/avatar.png' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )

    const fetchMock = undici.fetch as unknown as Mock
    fetchMock.mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(profileResponse)

    const callbackResponse = await server.inject({
      method: 'POST',
      url: '/auth/oauth/fortytwo/callback',
      payload: {
        code: 'auth-code',
        state: urlBody.state,
        redirectUri
      }
    })

    expect(callbackResponse.statusCode).toBe(200)
    const body = callbackResponse.json<{
      user: { id: number; displayName: string }
      tokens: { access: string; refresh: string }
      oauthProvider: string
      mfaRequired: boolean
    }>()
    expect(body.oauthProvider).toBe('fortytwo')
    expect(body.mfaRequired).toBe(false)
    expect(body.tokens.access).toMatch(jwtPattern)

    const account = await prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: 'fortytwo', providerUserId: '99' } }
    })
    expect(account).not.toBeNull()
  })

  it('requires MFA completion when the email already belongs to a 2FA user', async () => {
    await prisma.user.create({
      data: {
        email: 'oauth-user@example.com',
        login: 'securedplayer',
        displayName: 'Secured Player',
        passwordHash: await argon2.hash('Secure123!'),
        twoFAEnabled: true,
        twoFASecret: 'secret'
      }
    })

    const urlResponse = await server.inject({
      method: 'GET',
      url: '/auth/oauth/fortytwo/url',
      query: { redirectUri }
    })
    const urlBody = urlResponse.json<{ state: string }>()

    const tokenResponse = new undici.Response(
      JSON.stringify({ access_token: 'provider-access', refresh_token: 'provider-refresh', expires_in: 3600 }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
    const profileResponse = new undici.Response(
      JSON.stringify({
        id: 77,
        email: 'oauth-user@example.com',
        usual_full_name: 'OAuth User',
        login: 'oauthuser'
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )

    const fetchMock = undici.fetch as unknown as Mock
    fetchMock.mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(profileResponse)

    const callbackResponse = await server.inject({
      method: 'POST',
      url: '/auth/oauth/fortytwo/callback',
      payload: {
        code: 'auth-code',
        state: urlBody.state,
        redirectUri
      }
    })

    expect(callbackResponse.statusCode).toBe(409)
    const body = callbackResponse.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('EMAIL_IN_USE_MFA_REQUIRED')
    const accountCount = await prisma.oAuthAccount.count()
    expect(accountCount).toBe(0)
  })

  it('rejects expired OAuth state payloads', async () => {
    const stateRecord = await prisma.oAuthState.create({
      data: {
        provider: 'fortytwo',
        state: randomUUID(),
        redirectUri,
        codeVerifier: null,
        expiresAt: new Date(Date.now() - 1000)
      }
    })

    const response = await server.inject({
      method: 'POST',
      url: '/auth/oauth/fortytwo/callback',
      payload: {
        code: 'late-code',
        state: stateRecord.state,
        redirectUri
      }
    })

    expect(response.statusCode).toBe(410)
    const body = response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('OAUTH_STATE_EXPIRED')
  })
})

/*
解説:
1) 登録 API の正常系で Argon2 ハッシュと `Session` トークンの整合を確認し、重複登録・入力エラーの応答コードも検証する。
2) ログイン API の正常系でユーザー状態更新・新規セッショントークン発行・レスポンス構造を保証する。
3) 不正な資格情報や入力フォーマットに対して 401/400 を返すことを確認し、セキュリティ上のガードを自動テスト化する。
4) MFA セットアップ/検証/チャレンジ/解除フローを通しでテストし、2FA 有効化時の 423 応答と `/auth/mfa/challenge` によるトークン発行が回帰しないようにしている。
*/
