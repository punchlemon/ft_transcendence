import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { fetch as undiciFetch } from 'undici'
import argon2 from 'argon2'
import { authenticator } from 'otplib'
import { z } from 'zod'
import type { PrismaClient } from '@prisma/client'
import { userService } from '../services/user'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days
const MFA_CHALLENGE_TTL_MS = 1000 * 60 * 5 // 5 minutes
const BACKUP_CODE_COUNT = 10
const BACKUP_CODE_LENGTH = 10
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const BACKUP_CODE_REGEX = /^[A-Z0-9]{5}-[A-Z0-9]{5}$/
const OAUTH_STATE_TTL_MS = 1000 * 60 * 10 // 10 minutes
const CODE_VERIFIER_BYTE_LENGTH = 32
const PKCE_METHOD = 'S256'
const DEFAULT_REDIRECT_URI = 'http://localhost:5173/oauth/callback'

// デフォルトアバター画像のパス配列（frontend/public/avatars/と同期）
const DEFAULT_AVATARS = [
  '/avatars/avatar-01.png',
  '/avatars/avatar-02.png',
  '/avatars/avatar-03.png',
  '/avatars/avatar-04.png',
  '/avatars/avatar-05.png',
  '/avatars/avatar-06.png',
  '/avatars/avatar-07.png',
  '/avatars/avatar-08.png',
  '/avatars/avatar-09.png',
  '/avatars/avatar-10.png',
  '/avatars/avatar-11.png',
  '/avatars/avatar-12.png',
  '/avatars/avatar-13.png',
  '/avatars/avatar-14.png'
]

/**
 * 文字列をシードにしてデフォルトアバターを取得
 * 同じloginは常に同じアバターになる
 */
const getDefaultAvatarForLogin = (login: string): string => {
  let hash = 0
  for (let i = 0; i < login.length; i += 1) {
    const char = login.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  const index = Math.abs(hash) % DEFAULT_AVATARS.length
  return DEFAULT_AVATARS[index]!
}

type OAuthProviderKey = 'google'

type ProviderProfile = {
  providerUserId: string
  email: string
  displayName: string
  avatarUrl?: string | null
}

type ProviderTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

type OAuthProviderConfig = {
  authorizeUrl: string
  tokenUrl: string
  profileUrl: string
  scope: string[]
  pkce: boolean
  clientId?: string
  clientSecret?: string
  extraAuthParams?: Record<string, string>
  mapProfile: (raw: unknown) => ProviderProfile | null
}

type OAuthProviderStaticConfig = Omit<OAuthProviderConfig, 'clientId' | 'clientSecret'>

type SessionClientMetadata = {
  ipAddress?: string | null
  userAgent?: string | null
}

const getAllowedRedirects = () => {
  const raw = process.env.OAUTH_REDIRECT_WHITELIST ?? DEFAULT_REDIRECT_URI
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (entries.length === 0) {
    entries.push(DEFAULT_REDIRECT_URI)
  }
  return entries
}

const oauthProviderStaticConfigs: Record<OAuthProviderKey, OAuthProviderStaticConfig> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: ['openid', 'email', 'profile'],
    pkce: true,
    extraAuthParams: {
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent'
    },
    mapProfile: (raw) => {
      const data = raw as {
        sub?: string
        email?: string
        name?: string
        picture?: string
      }
      if (!data?.sub || !data.email) {
        return null
      }
      return {
        providerUserId: data.sub,
        email: data.email.toLowerCase(),
        displayName: data.name?.trim() || data.email,
        avatarUrl: data.picture ?? null
      }
    }
  }
}

const sanitizeCredential = (value?: string) => {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('your-') || lower.includes('change-me')) {
    return undefined
  }
  return trimmed
}

const resolveProviderConfig = (providerKey: OAuthProviderKey): OAuthProviderConfig => {
  const base = oauthProviderStaticConfigs[providerKey]
  const credentials = {
    clientId: sanitizeCredential(process.env.GOOGLE_OAUTH_CLIENT_ID),
    clientSecret: sanitizeCredential(process.env.GOOGLE_OAUTH_CLIENT_SECRET)
  }
  return {
    ...base,
    ...credentials
  }
}

const oauthUrlQuerySchema = z.object({
  redirectUri: z.string().url()
})

const oauthCallbackSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(512),
  state: z.string().uuid(),
  redirectUri: z.string().url()
})

const RESERVED_USERNAMES = [
  'admin',
  'login',
  'api',
  'help',
  'profile',
  'settings',
  'dashboard',
  'auth',
  'users',
  'game',
  'chat',
  'notifications',
  'register',
  'logout',
  'home',
  'about',
  'contact',
  'terms',
  'privacy'
]

const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254),
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, { message: 'Only letters, numbers and _ are allowed' })
    .refine((val) => !RESERVED_USERNAMES.includes(val.toLowerCase()), {
      message: 'This username is reserved'
    }),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
      message: 'Password must include letters and numbers'
    }),
  displayName: z
    .string()
    .trim()
    .min(3)
    .max(32)
})

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254),
  password: z.string().min(8).max(128)
})

const refreshSchema = z.object({
  refreshToken: z.string().uuid()
})

const otpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
})

const disableMfaSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/)
      .optional(),
    backupCode: z
      .string()
      .trim()
      .regex(BACKUP_CODE_REGEX)
      .optional()
  })
  .refine((value) => Boolean(value.code || value.backupCode), {
    message: 'Either code or backupCode is required'
  })

const backupCodesQuerySchema = z.object({
  regenerate: z.enum(['true', 'false']).optional()
})

const sessionIdParamSchema = z.object({
  sessionId: z.coerce.number().int().positive()
})

const challengeSchema = z
  .object({
    challengeId: z.string().uuid(),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/)
      .optional(),
    backupCode: z
      .string()
      .trim()
      .regex(BACKUP_CODE_REGEX)
      .optional()
  })
  .refine((value) => Boolean(value.code || value.backupCode), {
    message: 'Either code or backupCode is required'
  })

const generateBackupCode = () => {
  const bytes = randomBytes(BACKUP_CODE_LENGTH)
  let raw = ''
  for (let i = 0; i < BACKUP_CODE_LENGTH; i += 1) {
    const index = bytes[i]! % BACKUP_CODE_ALPHABET.length
    raw += BACKUP_CODE_ALPHABET[index]
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}

const normalizeBackupCode = (code: string) => code.trim().toUpperCase()

const toBase64Url = (buffer: Buffer) =>
  buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const generateCodeVerifier = () => toBase64Url(randomBytes(CODE_VERIFIER_BYTE_LENGTH))

const deriveCodeChallenge = (codeVerifier: string) => toBase64Url(createHash('sha256').update(codeVerifier).digest())

const isRedirectAllowed = (redirectUri: string) => getAllowedRedirects().includes(redirectUri)

const isSupportedProvider = (provider?: string): provider is OAuthProviderKey => provider === 'google'

const sanitizeClientMetadata = (metadata?: SessionClientMetadata) => {
  const ipAddress = typeof metadata?.ipAddress === 'string' ? metadata.ipAddress.slice(0, 128) : null
  const rawAgent = metadata?.userAgent
  const userAgent = typeof rawAgent === 'string' ? rawAgent.slice(0, 512) : null
  return { ipAddress, userAgent }
}

const extractClientMetadata = (request: FastifyRequest): SessionClientMetadata => {
  const uaHeader = request.headers['user-agent']
  const resolvedUserAgent = Array.isArray(uaHeader) ? uaHeader[0] : uaHeader
  return sanitizeClientMetadata({
    ipAddress: request.ip,
    userAgent: resolvedUserAgent ?? null
  })
}

const buildSessionData = (userId: number, metadata?: SessionClientMetadata) => {
  const sanitized = sanitizeClientMetadata(metadata)
  return {
    userId,
    token: randomUUID(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    lastUsedAt: new Date(),
    ipAddress: sanitized.ipAddress,
    userAgent: sanitized.userAgent
  }
}

const buildAuthorizationUrl = (
  config: OAuthProviderConfig,
  params: { redirectUri: string; state: string; codeChallenge: string | null }
) => {
  const url = new URL(config.authorizeUrl)
  url.searchParams.set('client_id', config.clientId ?? '')
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', config.scope.join(' '))
  url.searchParams.set('state', params.state)

  if (config.pkce && params.codeChallenge) {
    url.searchParams.set('code_challenge', params.codeChallenge)
    url.searchParams.set('code_challenge_method', PKCE_METHOD)
  }

  if (config.extraAuthParams) {
    for (const [key, value] of Object.entries(config.extraAuthParams)) {
      url.searchParams.set(key, value)
    }
  }

  return url.toString()
}

const exchangeAuthorizationCode = async (
  config: OAuthProviderConfig,
  params: { code: string; redirectUri: string; codeVerifier?: string | null }
): Promise<ProviderTokenResponse> => {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: config.clientId ?? ''
  })

  if (config.clientSecret) {
    form.set('client_secret', config.clientSecret)
  }

  if (config.pkce && params.codeVerifier) {
    form.set('code_verifier', params.codeVerifier)
  }

  const response = await undiciFetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed with status ${response.status}`)
  }

  return (await response.json()) as ProviderTokenResponse
}

const fetchProviderProfile = async (config: OAuthProviderConfig, accessToken: string) => {
  const response = await undiciFetch(config.profileUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Profile fetch failed with status ${response.status}`)
  }

  return config.mapProfile(await response.json())
}

const ensureUniqueLogin = async (prisma: PrismaClient, preferred: string) => {
  const normalized = preferred.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)
  const base = normalized.length >= 3 ? normalized : `player${toBase64Url(randomBytes(3))}`
  let attempt = 0
  while (attempt < 50) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`
    const existing = await prisma.user.findUnique({ where: { login: candidate } })
    if (!existing) {
      return candidate
    }
    attempt += 1
  }
  return `${base}${randomUUID().slice(0, 4)}`
}

const ensureUniqueDisplayName = async (_prisma: PrismaClient, preferred: string) => {
  // No longer enforce uniqueness at application or DB level.
  // Normalize and return a safe display name. If the provider value is
  // too short, fall back to a generated player name.
  const normalized = preferred?.trim().replace(/\s+/g, ' ').slice(0, 32) ?? ''
  const base = normalized.length >= 3 ? normalized : `Player ${Math.floor(Math.random() * 9000) + 1000}`
  return base
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const issueSessionTokens = async (userId: number, metadata?: SessionClientMetadata) => {
    const previousUser = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true }
    })

    const user = await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'ONLINE',
        lastLoginAt: new Date()
      },
      select: {
        id: true,
        displayName: true,
        login: true,
        status: true,
        avatarUrl: true,
        createdAt: true
      }
    })

    const session = await fastify.prisma.session.create({
      data: buildSessionData(userId, metadata),
      select: {
        id: true,
        token: true
      }
    })

    if (previousUser?.status === 'OFFLINE') {
      userService.emitStatusChange(userId, 'ONLINE')
    }

    const accessToken = await fastify.issueAccessToken({ userId, sessionId: session.id })

    return {
      user,
      tokens: {
        access: accessToken,
        refresh: session.token
      }
    }
  }

  fastify.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body)

    if (!parsed.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_BODY',
          message: 'Invalid registration payload',
          details: parsed.error.flatten().fieldErrors
        }
      }
    }

    const { email, username, password, displayName } = parsed.data

    const existing = await fastify.prisma.user.findFirst({
      where: {
        OR: [{ email }, { login: username }]
      },
      select: { id: true }
    })

    if (existing) {
      reply.code(409)
      return {
        error: {
          code: 'USER_ALREADY_EXISTS',
          message: 'User with same email or login already exists'
        }
      }
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id })

    const user = await fastify.prisma.user.create({
      data: {
        email,
        login: username,
        displayName,
        passwordHash,
        avatarUrl: getDefaultAvatarForLogin(username),
        status: 'OFFLINE',
        profileVisibility: 'PUBLIC',
        twoFAEnabled: false
      },
      select: {
        id: true,
        login: true,
        displayName: true,
        email: true,
        status: true,
        createdAt: true
      }
    })

    const sessionResult = await issueSessionTokens(user.id, extractClientMetadata(request))

    userService.emitUserCreated(sessionResult.user)

    reply.code(201)
    return {
      user: {
        ...user,
        status: sessionResult.user.status
      },
      tokens: sessionResult.tokens
    }
  })

  fastify.get<{ Params: { provider: string }; Querystring: { redirectUri?: string } }>('/oauth/:provider/url', async (request, reply) => {
    const providerParam = request.params.provider?.toLowerCase()

    if (!isSupportedProvider(providerParam)) {
      reply.code(404)
      return {
        error: {
          code: 'OAUTH_PROVIDER_NOT_SUPPORTED',
          message: 'Requested OAuth provider is not supported'
        }
      }
    }

    const providerConfig = resolveProviderConfig(providerParam)

    if (!providerConfig.clientId || !providerConfig.clientSecret) {
      reply.code(500)
      return {
        error: {
          code: 'OAUTH_PROVIDER_MISCONFIGURED',
          message: 'OAuth provider is not configured on the server'
        }
      }
    }

    const parsedQuery = oauthUrlQuerySchema.safeParse(request.query)
    if (!parsedQuery.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_REDIRECT_URI',
          message: 'Redirect URI is required'
        }
      }
    }

    const redirectUri = parsedQuery.data.redirectUri.trim()

    if (!isRedirectAllowed(redirectUri)) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_REDIRECT_URI',
          message: 'Redirect URI is not allowed'
        }
      }
    }

    const state = randomUUID()
    const codeVerifier = providerConfig.pkce ? generateCodeVerifier() : null
    const codeChallenge = providerConfig.pkce && codeVerifier ? deriveCodeChallenge(codeVerifier) : null

    try {
      await fastify.prisma.oAuthState.create({
        data: {
          provider: providerParam,
          state,
          codeVerifier,
          redirectUri,
          expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS)
        }
      })
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to persist OAuth state')
      reply.code(500)
      return {
        error: {
          code: 'OAUTH_STATE_PERSIST_FAILED',
          message: 'Failed to persist OAuth transaction state'
        }
      }
    }

    const authorizationUrl = buildAuthorizationUrl(providerConfig, {
      redirectUri,
      state,
      codeChallenge
    })

    return {
      authorizationUrl,
      state,
      codeChallenge,
      expiresIn: Math.floor(OAUTH_STATE_TTL_MS / 1000)
    }
  })

  fastify.post<{ Params: { provider: string }; Body: { code?: string; state?: string; redirectUri?: string } }>('/oauth/:provider/callback', async (request, reply) => {
    const providerParam = request.params.provider?.toLowerCase()

    if (!isSupportedProvider(providerParam)) {
      reply.code(404)
      return {
        error: {
          code: 'OAUTH_PROVIDER_NOT_SUPPORTED',
          message: 'Requested OAuth provider is not supported'
        }
      }
    }

    const providerConfig = resolveProviderConfig(providerParam)

    if (!providerConfig.clientId || !providerConfig.clientSecret) {
      reply.code(500)
      return {
        error: {
          code: 'OAUTH_PROVIDER_MISCONFIGURED',
          message: 'OAuth provider is not configured on the server'
        }
      }
    }

    const parsedBody = oauthCallbackSchema.safeParse(request.body)

    if (!parsedBody.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_BODY',
          message: 'Invalid OAuth callback payload'
        }
      }
    }

    const { code, state, redirectUri } = parsedBody.data

    const stateRecord = await fastify.prisma.oAuthState.findUnique({ where: { state } })

    if (
      !stateRecord ||
      stateRecord.provider !== providerParam ||
      stateRecord.redirectUri !== redirectUri ||
      stateRecord.expiresAt.getTime() <= Date.now()
    ) {
      if (stateRecord) {
        await fastify.prisma.oAuthState.delete({ where: { state } }).catch(() => {})
      }
      reply.code(410)
      return {
        error: {
          code: 'OAUTH_STATE_EXPIRED',
          message: 'OAuth state is invalid or expired'
        }
      }
    }

    await fastify.prisma.oAuthState.delete({ where: { state } }).catch(() => {})

    if (providerConfig.pkce && !stateRecord.codeVerifier) {
      reply.code(410)
      return {
        error: {
          code: 'OAUTH_STATE_EXPIRED',
          message: 'OAuth state is invalid or expired'
        }
      }
    }

    let tokenPayload: ProviderTokenResponse
    try {
      tokenPayload = await exchangeAuthorizationCode(providerConfig, {
        code,
        redirectUri,
        codeVerifier: stateRecord.codeVerifier
      })
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to exchange OAuth code')
      reply.code(502)
      return {
        error: {
          code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
          message: 'Failed to exchange authorization code'
        }
      }
    }

    if (!tokenPayload.access_token) {
      reply.code(502)
      return {
        error: {
          code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
          message: 'Provider did not return an access token'
        }
      }
    }

    let profile: ProviderProfile | null = null
    try {
      profile = await fetchProviderProfile(providerConfig, tokenPayload.access_token)
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch OAuth profile')
      reply.code(502)
      return {
        error: {
          code: 'OAUTH_PROFILE_FETCH_FAILED',
          message: 'Failed to fetch profile from provider'
        }
      }
    }

    if (!profile) {
      reply.code(502)
      return {
        error: {
          code: 'OAUTH_PROFILE_FETCH_FAILED',
          message: 'Provider did not return a usable profile'
        }
      }
    }

    const normalizedEmail = profile.email.toLowerCase()
    const expiresAt = tokenPayload.expires_in ? new Date(Date.now() + tokenPayload.expires_in * 1000) : null
    const uniqueProviderKey = {
      provider: providerParam,
      providerUserId: profile.providerUserId
    }

    let userId: number
    let isNewUser = false

    const existingAccount = await fastify.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: uniqueProviderKey
      },
      select: {
        userId: true
      }
    })

    if (existingAccount) {
      userId = existingAccount.userId
      await fastify.prisma.oAuthAccount.update({
        where: {
          provider_providerUserId: uniqueProviderKey
        },
        data: {
          accessToken: tokenPayload.access_token,
          refreshToken: tokenPayload.refresh_token ?? null,
          expiresAt
        }
      })
    } else {
      const existingUser = await fastify.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, twoFAEnabled: true }
      })

      if (existingUser) {
        if (existingUser.twoFAEnabled) {
          reply.code(409)
          return {
            error: {
              code: 'EMAIL_IN_USE_MFA_REQUIRED',
              message: 'Account with this email requires MFA before linking OAuth'
            }
          }
        }
        userId = existingUser.id
      } else {
        const loginSeed = normalizedEmail.split('@')[0] || profile.providerUserId
        const uniqueLogin = await ensureUniqueLogin(fastify.prisma, loginSeed)
        const sanitizedDisplayName = await ensureUniqueDisplayName(fastify.prisma, profile.displayName)

        const createdUser = await fastify.prisma.user.create({
          data: {
            email: normalizedEmail,
            login: uniqueLogin,
            displayName: sanitizedDisplayName,
            avatarUrl: profile.avatarUrl ?? getDefaultAvatarForLogin(uniqueLogin),
            passwordHash: null,
            twoFAEnabled: false
          },
          select: { id: true }
        })

        userId = createdUser.id
        isNewUser = true
      }

      await fastify.prisma.oAuthAccount.create({
        data: {
          userId,
          provider: providerParam,
          providerUserId: profile.providerUserId,
          accessToken: tokenPayload.access_token,
          refreshToken: tokenPayload.refresh_token ?? null,
          expiresAt
        }
      })
    }

    const result = await issueSessionTokens(userId, extractClientMetadata(request))

    if (isNewUser) {
      userService.emitUserCreated(result.user)
    }

    return {
      ...result,
      mfaRequired: false,
      oauthProvider: providerParam
    }
  })

  fastify.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)

    if (!parsed.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_BODY',
          message: 'Invalid login payload',
          details: parsed.error.flatten().fieldErrors
        }
      }
    }

    const { email, password } = parsed.data
    const userRecord = await fastify.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        displayName: true,
        status: true,
        passwordHash: true,
        twoFAEnabled: true
      }
    })

    if (!userRecord || !userRecord.passwordHash) {
      reply.code(401)
      return {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect'
        }
      }
    }

    const passwordValid = await argon2.verify(userRecord.passwordHash, password)
    if (!passwordValid) {
      reply.code(401)
      return {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect'
        }
      }
    }

    if (userRecord.twoFAEnabled) {
      await fastify.prisma.mfaChallenge.deleteMany({ where: { userId: userRecord.id } })
      const challenge = await fastify.prisma.mfaChallenge.create({
        data: {
          token: randomUUID(),
          userId: userRecord.id,
          expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS)
        }
      })

      reply.code(423)
      return {
        error: {
          code: 'MFA_REQUIRED',
          message: 'Multi-factor authentication required before issuing tokens'
        },
        mfaRequired: true,
        challengeId: challenge.token
      }
    }

    const sessionResult = await issueSessionTokens(userRecord.id, extractClientMetadata(request))

    return {
      user: sessionResult.user,
      tokens: sessionResult.tokens,
      mfaRequired: false
    }
  })

  fastify.get('/mfa/setup', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user?.userId
    if (!userId) {
      reply.code(401)
      return {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is invalid'
        }
      }
    }

    const user = await fastify.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFAEnabled: true, email: true, login: true }
    })

    if (user.twoFAEnabled) {
      reply.code(409)
      return {
        error: {
          code: 'MFA_ALREADY_ENABLED',
          message: 'Two-factor authentication is already enabled'
        }
      }
    }

    const secret = authenticator.generateSecret(32)
    const otpauthUrl = authenticator.keyuri(user.email ?? user.login, 'ft_transcendence', secret)

    await fastify.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          twoFASecret: secret,
          twoFAEnabled: false
        }
      })
      await tx.twoFactorBackupCode.deleteMany({ where: { userId } })
    })

    return {
      secret,
      otpauthUrl
    }
  })

  fastify.post('/mfa/verify', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user?.userId
    if (!userId) {
      reply.code(401)
      return {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is invalid'
        }
      }
    }

    const parsed = otpCodeSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_BODY',
          message: 'Invalid MFA verification payload',
          details: parsed.error.flatten().fieldErrors
        }
      }
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFASecret: true }
    })

    if (!user?.twoFASecret) {
      reply.code(400)
      return {
        error: {
          code: 'MFA_SETUP_REQUIRED',
          message: 'Generate a secret via /auth/mfa/setup first'
        }
      }
    }

    const valid = authenticator.verify({ token: parsed.data.code, secret: user.twoFASecret })
    if (!valid) {
      request.log.warn({
        msg: 'MFA verification failed',
        userId,
        token: parsed.data.code,
        secretPrefix: user.twoFASecret.substring(0, 4)
      })
      reply.code(400)
      return {
        error: {
          code: 'INVALID_MFA_CODE',
          message: 'Provided MFA code is not valid'
        }
      }
    }

    await fastify.prisma.user.update({
      where: { id: userId },
      data: { twoFAEnabled: true }
    })

    return {
      twoFAEnabled: true
    }
  })

  fastify.get('/mfa/backup-codes', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user?.userId
    if (!userId) {
      reply.code(401)
      return {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is invalid'
        }
      }
    }

    const parsedQuery = backupCodesQuerySchema.safeParse((request.query as Record<string, unknown>) ?? {})
    if (!parsedQuery.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_QUERY',
          message: 'Invalid query parameters',
          details: parsedQuery.error.flatten().fieldErrors
        }
      }
    }

    const regenerate = parsedQuery.data.regenerate === 'true'
    const user = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { twoFAEnabled: true } })

    if (!user?.twoFAEnabled) {
      reply.code(409)
      return {
        error: {
          code: 'MFA_NOT_ENABLED',
          message: 'Enable two-factor authentication before managing backup codes'
        }
      }
    }

    if (regenerate) {
      const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode)
      const codeHashes = await Promise.all(
        codes.map((code) => argon2.hash(code, { type: argon2.argon2id }))
      )

      await fastify.prisma.$transaction(async (tx) => {
        await tx.twoFactorBackupCode.deleteMany({ where: { userId } })
        await tx.twoFactorBackupCode.createMany({
          data: codeHashes.map((codeHash) => ({ userId, codeHash }))
        })
      })

      return {
        regenerated: true,
        codes,
        remaining: codes.length
      }
    }

    const remaining = await fastify.prisma.twoFactorBackupCode.count({ where: { userId, usedAt: null } })

    return {
      regenerated: false,
      remaining
    }
  })

  fastify.delete('/mfa', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user?.userId
    if (!userId) {
      reply.code(401)
      return {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is invalid'
        }
      }
    }

    const parsed = disableMfaSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_BODY',
          message: 'Invalid MFA disable payload',
          details: parsed.error.flatten().fieldErrors
        }
      }
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFASecret: true, twoFAEnabled: true }
    })

    if (!user?.twoFAEnabled) {
      reply.code(409)
      return {
        error: {
          code: 'MFA_NOT_ENABLED',
          message: 'Two-factor authentication is not enabled'
        }
      }
    }

    const otpCode = parsed.data.code
    const normalizedBackupCode = parsed.data.backupCode ? normalizeBackupCode(parsed.data.backupCode) : undefined

    if (otpCode) {
      if (!user.twoFASecret) {
        // Should not happen if twoFAEnabled is true, but for safety
        reply.code(409)
        return {
          error: {
            code: 'MFA_NOT_ENABLED',
            message: 'Two-factor authentication secret is missing'
          }
        }
      }
      const valid = authenticator.verify({ token: otpCode, secret: user.twoFASecret })
      if (!valid) {
        reply.code(400)
        return {
          error: {
            code: 'INVALID_MFA_CODE',
            message: 'Provided MFA code is not valid'
          }
        }
      }
    } else if (normalizedBackupCode) {
      const availableCodes = await fastify.prisma.twoFactorBackupCode.findMany({
        where: { userId, usedAt: null },
        select: { id: true, codeHash: true }
      })

      if (!availableCodes.length) {
        reply.code(409)
        return {
          error: {
            code: 'MFA_BACKUP_CODES_EXHAUSTED',
            message: 'All backup codes have been used'
          }
        }
      }

      let matched = false
      for (const candidate of availableCodes) {
        const matches = await argon2.verify(candidate.codeHash, normalizedBackupCode)
        if (matches) {
          matched = true
          break
        }
      }

      if (!matched) {
        reply.code(400)
        return {
          error: {
            code: 'INVALID_BACKUP_CODE',
            message: 'Provided backup code is invalid'
          }
        }
      }
    }

    await fastify.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          twoFAEnabled: false,
          twoFASecret: null
        }
      })
      await tx.twoFactorBackupCode.deleteMany({ where: { userId } })
    })

    reply.code(204)
    return null
  })

  fastify.post('/mfa/challenge', async (request, reply) => {
    const parsed = challengeSchema.safeParse(request.body)

    if (!parsed.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_BODY',
          message: 'Invalid MFA challenge payload',
          details: parsed.error.flatten().fieldErrors
        }
      }
    }

    const challenge = await fastify.prisma.mfaChallenge.findUnique({
      where: { token: parsed.data.challengeId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            status: true,
            twoFASecret: true
          }
        }
      }
    })

    if (!challenge) {
      reply.code(404)
      return {
        error: {
          code: 'MFA_CHALLENGE_NOT_FOUND',
          message: 'Challenge does not exist'
        }
      }
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      await fastify.prisma.mfaChallenge.delete({ where: { id: challenge.id } })
      reply.code(410)
      return {
        error: {
          code: 'MFA_CHALLENGE_EXPIRED',
          message: 'Challenge expired, please login again'
        }
      }
    }

    const otpCode = parsed.data.code
    const normalizedBackupCode = parsed.data.backupCode ? normalizeBackupCode(parsed.data.backupCode) : undefined
    let matchedBackupCodeId: number | null = null

    if (otpCode) {
      if (!challenge.user.twoFASecret) {
        await fastify.prisma.mfaChallenge.delete({ where: { id: challenge.id } })
        reply.code(409)
        return {
          error: {
            code: 'MFA_NOT_ENABLED',
            message: 'User does not have MFA enabled'
          }
        }
      }

      const valid = authenticator.verify({ token: otpCode, secret: challenge.user.twoFASecret })
      if (!valid) {
        reply.code(400)
        return {
          error: {
            code: 'INVALID_MFA_CODE',
            message: 'Provided MFA code is not valid'
          }
        }
      }
    } else if (normalizedBackupCode) {
      const availableCodes = await fastify.prisma.twoFactorBackupCode.findMany({
        where: { userId: challenge.user.id, usedAt: null },
        select: { id: true, codeHash: true }
      })

      if (!availableCodes.length) {
        reply.code(409)
        return {
          error: {
            code: 'MFA_BACKUP_CODES_EXHAUSTED',
            message: 'All backup codes have been used'
          }
        }
      }

      for (const candidate of availableCodes) {
        const matches = await argon2.verify(candidate.codeHash, normalizedBackupCode)
        if (matches) {
          matchedBackupCodeId = candidate.id
          break
        }
      }

      if (!matchedBackupCodeId) {
        reply.code(400)
        return {
          error: {
            code: 'INVALID_MFA_CODE',
            message: 'Provided backup code is not valid'
          }
        }
      }
    } else {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_MFA_CODE',
          message: 'Either code or backupCode must be provided'
        }
      }
    }

    const clientMetadata = extractClientMetadata(request)

    const result = await fastify.prisma.$transaction(async (tx) => {
      await tx.mfaChallenge.delete({ where: { id: challenge.id } })

      if (matchedBackupCodeId) {
        await tx.twoFactorBackupCode.update({
          where: { id: matchedBackupCodeId },
          data: { usedAt: new Date() }
        })
      }

      const updatedUser = await tx.user.update({
        where: { id: challenge.user.id },
        data: {
          status: 'ONLINE',
          lastLoginAt: new Date()
        },
        select: {
          id: true,
          displayName: true,
          login: true,
          status: true
        }
      })

      const session = await tx.session.create({
        data: buildSessionData(updatedUser.id, clientMetadata),
        select: {
          id: true,
          token: true
        }
      })

      return { updatedUser, session }
    })

    const accessToken = await fastify.issueAccessToken({ userId: result.updatedUser.id, sessionId: result.session.id })

    return {
      user: result.updatedUser,
      tokens: {
        access: accessToken,
        refresh: result.session.token
      },
      mfaRequired: false
    }
  })

  fastify.post('/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body)

    if (!parsed.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_BODY',
          message: 'Invalid refresh payload',
          details: parsed.error.flatten().fieldErrors
        }
      }
    }

    const { refreshToken } = parsed.data
    const session = await fastify.prisma.session.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            login: true,
            status: true
          }
        }
      }
    })

    if (!session || session.expiresAt.getTime() <= Date.now()) {
      if (session) {
        await fastify.prisma.session.delete({ where: { id: session.id } })
      }

      reply.code(401)
      return {
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid or expired'
        }
      }
    }

    const nextRefresh = randomUUID()
    const nextExpiry = new Date(Date.now() + SESSION_TTL_MS)
    const clientMetadata = extractClientMetadata(request)

    await fastify.prisma.session.update({
      where: { id: session.id },
      data: {
        token: nextRefresh,
        expiresAt: nextExpiry,
        lastUsedAt: new Date(),
        ipAddress: clientMetadata.ipAddress,
        userAgent: clientMetadata.userAgent
      }
    })

    const accessToken = await fastify.issueAccessToken({ userId: session.user.id, sessionId: session.id })

    return {
      user: session.user,
      tokens: {
        access: accessToken,
        refresh: nextRefresh
      }
    }
  })

  fastify.get('/sessions', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user?.userId
    if (!userId) {
      reply.code(401)
      return {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is invalid'
        }
      }
    }

    const currentSessionId = request.user?.sessionId ?? null
    const sessions = await fastify.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        ipAddress: true,
        userAgent: true
      }
    })

    return {
      sessions: sessions.map((session) => ({
        ...session,
        current: session.id === currentSessionId
      }))
    }
  })

  fastify.delete('/sessions/:sessionId', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user?.userId
    if (!userId) {
      reply.code(401)
      return {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is invalid'
        }
      }
    }

    const parsedParams = sessionIdParamSchema.safeParse(request.params ?? {})
    if (!parsedParams.success) {
      reply.code(400)
      return {
        error: {
          code: 'INVALID_PARAMS',
          message: 'Session id must be a positive integer'
        }
      }
    }

    const session = await fastify.prisma.session.findFirst({
      where: {
        id: parsedParams.data.sessionId,
        userId
      },
      select: { id: true }
    })

    if (!session) {
      reply.code(404)
      return {
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session does not exist or does not belong to the user'
        }
      }
    }

    await fastify.prisma.session.delete({ where: { id: session.id } })
    reply.code(204)
    return null
  })

  fastify.post('/logout', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body)

    if (!parsed.success) {
      request.log.warn({ error: parsed.error }, 'Logout failed: Invalid body')
      reply.code(400)
      return {
        error: {
          code: 'INVALID_BODY',
          message: 'Invalid logout payload',
          details: parsed.error.flatten().fieldErrors
        }
      }
    }

    const session = await fastify.prisma.session.findUnique({
      where: { token: parsed.data.refreshToken },
      select: { userId: true, id: true }
    })

    if (session) {
      const sessionId = session.id;
      const userId = session.userId;
      
      // Force close WebSocket connections for this session (load presenceService lazily)
      try {
        // Use require here so startup won't fail if module resolution differs inside container
        // (e.g. during build/deploy). This keeps the behavior robust while still calling
        // the presence helper when available.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const presenceMod = require('../services/presence')
        if (presenceMod && presenceMod.presenceService && typeof presenceMod.presenceService.closeSocketsBySession === 'function') {
          await presenceMod.presenceService.closeSocketsBySession(sessionId)
        }
      } catch (err) {
        request.log.warn({ err }, 'Failed to call presenceService.closeSocketsBySession')
      }
      
      // Delete the session from DB
      await fastify.prisma.session.deleteMany({ where: { token: parsed.data.refreshToken } })
      
      // Check remaining sessions
      const remainingSessions = await fastify.prisma.session.count({
        where: { userId }
      })

      if (remainingSessions === 0) {
        // If there are no DB sessions left, check active websocket connections
        try {
          // Lazy require presence service; if available, ask for connection count
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const presenceMod = require('../services/presence')
          if (presenceMod && presenceMod.presenceService && typeof presenceMod.presenceService.getConnectionCount === 'function') {
            const connCount = await presenceMod.presenceService.getConnectionCount(userId)
            if (connCount === 0) {
              await fastify.prisma.user.update({
                where: { id: userId },
                data: { status: 'OFFLINE' }
              })
              userService.emitStatusChange(userId, 'OFFLINE')
              request.log.info({ userId }, 'Logout successful: All sessions deleted and no active sockets; status set to OFFLINE')
            } else {
              request.log.info({ userId, sockets: connCount }, 'Logout: sessions cleared but user still has active websocket connections; leaving ONLINE')
            }
          } else {
            // presence service not available — fall back to setting OFFLINE (conservative)
            await fastify.prisma.user.update({
              where: { id: userId },
              data: { status: 'OFFLINE' }
            })
            userService.emitStatusChange(userId, 'OFFLINE')
            request.log.info({ userId }, 'Logout successful: All sessions deleted, presence service unavailable; status set to OFFLINE')
          }
        } catch (err) {
          request.log.warn({ err }, 'Failed to query presenceService.getConnectionCount; setting OFFLINE as fallback')
          await fastify.prisma.user.update({
            where: { id: userId },
            data: { status: 'OFFLINE' }
          })
          userService.emitStatusChange(userId, 'OFFLINE')
        }
      } else {
        request.log.info({ userId, remaining: remainingSessions }, 'Logout successful: Session deleted, user remains ONLINE')
      }
    } else {
      request.log.warn({ token: parsed.data.refreshToken }, 'Logout failed: Session not found for token')
    }

    reply.code(204)
    return null
  })
}

export default authRoutes

/*
解説:
1) Zod スキーマで登録/ログイン/MFA/リフレッシュ/ログアウトの入力制約を定義し、バリデーション失敗時は詳細付きで 400 を返す。
2) 登録時は Argon2id でハッシュ化した上でユーザー/セッションを作成し、`issueAccessToken` で `userId` と `sessionId` を含む JWT を発行する。
3) `twoFAEnabled` ユーザーがログインすると `MfaChallenge` を 5 分 TTL で生成し、423 応答に `challengeId` を含めて `/auth/mfa/challenge` に誘導する。
4) `/auth/mfa/setup` `verify` `delete` は `otplib` で TOTP を検証しながらシークレット生成・有効化・解除を行い、バックアップコード実装の土台を整えている。
5) リフレッシュではセッション UUID をローテーションしつつ新しい JWT を払い出し、ログアウトでは対象セッションを削除して強制失効できるようにしている。
*/
