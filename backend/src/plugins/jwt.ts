import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

const ACCESS_TOKEN_TTL = '15m'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    issueAccessToken: (payload: { userId: number; sessionId: number }) => Promise<string>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: number
      sessionId: number
    }
    user: {
      userId: number
      sessionId: number
    }
  }
}

const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  const secret = process.env.JWT_SECRET ?? 'dev-secret'

  await fastify.register(jwt, {
    secret
  })

  fastify.decorate('issueAccessToken', async ({ userId, sessionId }: { userId: number; sessionId: number }) => {
    return fastify.jwt.sign({ userId, sessionId }, { expiresIn: ACCESS_TOKEN_TTL })
  })

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      request.log.error(err)
      reply.code(401)
      return reply.send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is invalid'
        }
      })
    }
  })
}

export default fp(jwtPlugin)

/*
解説:
1) `@fastify/jwt` をプラグインとして登録し、ENV (`JWT_SECRET`) が未設定でも開発用シークレットで動作するようにフォールバックを設けた。
2) `issueAccessToken` デコレーターで `userId` と `sessionId` を含む 15 分間有効な JWT を発行し、各ルートから再利用できるようにした。
3) `authenticate` デコレーターで `request.jwtVerify()` を呼び、署名検証に失敗した場合は 401 のエラーレスポンスを JSON 形式で返す。
*/
