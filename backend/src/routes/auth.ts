import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import argon2 from 'argon2'
import { z } from 'zod'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

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
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, { message: 'Only letters, numbers, _ and - are allowed' }),
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

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/register', async (request, reply) => {
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
        OR: [{ email }, { login: username }, { displayName }]
      },
      select: { id: true }
    })

    if (existing) {
      reply.code(409)
      return {
        error: {
          code: 'USER_ALREADY_EXISTS',
          message: 'User with same email/login/displayName already exists'
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

    const refreshToken = randomUUID()
    await fastify.prisma.session.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS)
      }
    })

    reply.code(201)
    return {
      user,
      tokens: {
        access: randomUUID(),
        refresh: refreshToken
      }
    }
  })

  fastify.post('/auth/login', async (request, reply) => {
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
      reply.code(423)
      return {
        error: {
          code: 'MFA_REQUIRED',
          message: 'Multi-factor authentication required before issuing tokens'
        }
      }
    }

    const updatedUser = await fastify.prisma.user.update({
      where: { id: userRecord.id },
      data: {
        status: 'ONLINE',
        lastLoginAt: new Date()
      },
      select: {
        id: true,
        displayName: true,
        status: true
      }
    })

    const refreshToken = randomUUID()
    await fastify.prisma.session.create({
      data: {
        userId: updatedUser.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS)
      }
    })

    return {
      user: updatedUser,
      tokens: {
        access: randomUUID(),
        refresh: refreshToken
      },
      mfaRequired: false
    }
  })
}

export default fp(authRoutes)

/*
解説:
1) Zod スキーマで登録/ログイン双方の入力制約を定義し、バリデーション失敗時に 400 を即時返却する。
2) 登録時は Argon2id でハッシュ化した上でユーザーを作成し、`Session` にリフレッシュトークンと有効期限を保存してレスポンスと同期させる。
3) ログイン時は資格情報を検証し、2FA フラグをチェックした後に `ONLINE` へ状態更新・セッション生成・暫定アクセス/リフレッシュトークン返却を行う。
*/
