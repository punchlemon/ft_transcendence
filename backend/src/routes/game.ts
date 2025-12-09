import { FastifyInstance } from 'fastify'
import { GameManager } from '../game/GameManager'
import { notificationService } from '../services/notification'
import { getDisplayNameOrFallback } from '../services/user'
import GameSocketHandler, { sharedGameSockets as gameSockets } from '../game/GameSocketHandler'
// Manage game sockets separately to avoid interfering with chat sockets
// Shared registry is provided by `GameSocketHandler` to keep behavior compatible
// with the original inline implementation.

// Request/Response types for invite endpoint
interface InviteBody {
  targetUserId: number
  inviteType?: 'match' | 'tournament'
  tournamentId?: number
  participantId?: number
}

interface InviteResponse {
  success: true
  type: 'match' | 'tournament'
  sessionId: string | null
}

const inviteSchema = {
  body: {
    type: 'object',
    required: ['targetUserId'],
    properties: {
      targetUserId: { type: 'number' },
      inviteType: { type: 'string', enum: ['match', 'tournament'], default: 'match' },
      tournamentId: { type: 'number' },
      participantId: { type: 'number' }
    }
  }
} as const

export default async function gameRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: InviteBody; Reply: InviteResponse }>('/game/invite', {
    preValidation: [
      fastify.authenticate,
      // wrap decorator call to avoid evaluating possibly-undefined decorator at route registration time
      async (req, reply) => {
        const fn = (fastify as any).rejectIfInGame
        if (typeof fn === 'function') {
          // call and return whatever it returns (it may send reply)
          return await fn(req, reply)
        }
      }
    ],
    schema: inviteSchema
  }, async (req, reply) => {
    // Support both 1v1 match invites and tournament invites
    const { targetUserId, inviteType = 'match', tournamentId, participantId } = req.body
    const user = req.user as any

    const blocked = await fastify.isBlocked(user.userId, targetUserId)

    // For match invites we create a private session and return sessionId
    if (inviteType === 'match') {
      const manager = GameManager.getInstance()
      const { sessionId } = manager.createPrivateGame(user.userId)

      // Log sessionId and invite URL for debugging
      try {
        const invitePath = `/game/${sessionId}?mode=remote&private=true`
        fastify.log.info({ sessionId, invitePath }, 'Created private game for invite')
      } catch (e) {
        fastify.log.warn({ err: e }, 'Failed to log private game creation')
      }

      if (!blocked) {
        const inviterDisplay = await getDisplayNameOrFallback(fastify, user.userId)

        await notificationService.createNotification(
          targetUserId,
          'MATCH_INVITE',
          'Game Invitation',
          `${inviterDisplay} invited you to a game!`,
          { sessionId, inviterId: user.userId }
        )
      }

      return { success: true, type: 'match', sessionId }
    }

    // Tournament invite flow (no session created here)
    if (inviteType === 'tournament') {
      if (!blocked) {
        // Optionally fetch tournament name for message if tournamentId provided
        let tournamentName: string | null = null
        if (typeof tournamentId === 'number') {
          const t = await fastify.prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } })
          tournamentName = t?.name ?? null
        }

        const inviterDisplay = await getDisplayNameOrFallback(fastify, user.userId)
        const message = tournamentName
          ? `${inviterDisplay} invited you to tournament ${tournamentName}`
          : `${inviterDisplay} invited you to a tournament`

        await notificationService.createNotification(
          targetUserId,
          'TOURNAMENT_INVITE',
          'Tournament Invite',
          message,
          { tournamentId, participantId, inviterId: user.userId }
        )
      }

      return { success: true, type: 'tournament', sessionId: null }
    }

    // Unreachable due to schema, but keep for safety
    return reply.code(400).send({ error: 'Invalid invite type' } as any)
  })

  // Create a private room without inviting anyone. Returns sessionId for the created private game.
  fastify.post('/game/private', {
    preValidation: [
      fastify.authenticate,
      async (req, reply) => {
        const fn = (fastify as any).rejectIfInGame
        if (typeof fn === 'function') return await fn(req, reply)
      }
    ]
  }, async (req, reply) => {
    const manager = GameManager.getInstance()
    const { sessionId } = manager.createPrivateGame((req.user as any)?.userId)
    // Log sessionId and returned URL for debugging
    try {
      const invitePath = `/game/${sessionId}?mode=remote&private=true`
      fastify.log.info({ sessionId, invitePath }, 'Created private game (direct)')
    } catch (e) {
      fastify.log.warn({ err: e }, 'Failed to log private game creation (direct)')
    }

    return { sessionId }
  })

  // Check whether a game session exists / is available. Returns { sessionId, available }
  fastify.get('/game/:sessionId/status', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const manager = GameManager.getInstance()
    const existing = manager.getGame(sessionId)
    const expired = manager.isExpired(sessionId)
    return { sessionId, available: !!existing && !expired }
  })

  fastify.get('/ws/game', { websocket: true }, (connection, req) => {
    fastify.log.info('Client connected to game websocket')
    try {
      const handler = new GameSocketHandler(fastify)
      handler.handle(connection, req)
    } catch (e) {
      fastify.log.error({ err: e }, 'Failed to delegate websocket handling to GameSocketHandler')
      try { if ((connection as any)?.close) (connection as any).close() } catch (e) {}
    }
  })
}
