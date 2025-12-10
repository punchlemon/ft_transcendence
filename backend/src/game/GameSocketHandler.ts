import { FastifyInstance } from 'fastify'
import { GameManager } from './GameManager'
import { notificationService } from '../services/notification'
import { getDisplayNameOrFallback } from '../services/user'
import connectionManager, { registerConnection, unregisterConnection, getConnection } from '../utils/connectionManager'
import { handleControlEvent } from './ws/controlHandlers'

export default class GameSocketHandler {
  private fastify: FastifyInstance

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  handle(connection: any, req: any) {
    const socket = (connection && (connection as any).socket) ? (connection as any).socket : connection

    const manager = GameManager.getInstance()
    const query = req.query as { mode?: string; difficulty?: string; sessionId?: string; aiSlot?: string }

    let game: any = undefined
    let gameResult: { game: any; sessionId: string } | undefined = undefined
    let sessionId: string | undefined = undefined
    let pairedWaitingSocket: any = null
    let pairedWaitingUserId: number | undefined = undefined

    if (query.sessionId) {
      if (manager.isExpired(query.sessionId)) {
        try {
          const resp = JSON.stringify({ event: 'match:event', payload: { type: 'UNAVAILABLE', message: 'Session is no longer available', sessionId: query.sessionId } })
          if (typeof (socket as any).send === 'function') (socket as any).send(resp)
        } catch (e) {}
        try { if (typeof (socket as any).close === 'function') (socket as any).close(); } catch (e) {}
        return
      }

      const existingGame = manager.getGame(query.sessionId)
      if (existingGame) {
        gameResult = { game: existingGame, sessionId: query.sessionId }
      } else {
        try {
          gameResult = { game: manager.createGame(query.sessionId), sessionId: query.sessionId }
        } catch (err) {
          try {
            const resp = JSON.stringify({ event: 'match:event', payload: { type: 'UNAVAILABLE', message: 'Session is no longer available', sessionId: query.sessionId } })
            if (typeof (socket as any).send === 'function') (socket as any).send(resp)
          } catch (e) {}
          try { if (typeof (socket as any).close === 'function') (socket as any).close(); } catch (e) {}
          return
        }
      }

      if (gameResult) {
        game = gameResult.game
        sessionId = gameResult.sessionId
      }

      if (query.mode === 'ai' && game) {
        game.addAIPlayer((query.difficulty as any) || 'NORMAL', (query.aiSlot as any))
      }
    } else if (query.mode === 'ai') {
      const g = manager.createAIGame((query.difficulty as any) || 'NORMAL')
      game = g.game
      sessionId = g.sessionId
    } else if (query.mode === 'local') {
      const g = manager.createLocalGame()
      game = g.game
      sessionId = g.sessionId
    } else {
      sessionId = undefined
      game = undefined
    }

    let playerSlot: 'p1' | 'p2' | null = null
    let authSessionId: number | null = null

    const handleMessage = async (message: any) => {
      try {
        const rawData = message.data || message
        const data = JSON.parse(rawData.toString())

        if (data.event !== 'input') {
          this.fastify.log.info({ msg: 'Received message', data })
        }

        if (data.event === 'ready') {
          try {
            const mgr = GameManager.getInstance()
            if (sessionId && mgr.isExpired(sessionId)) {
              try {
                const resp = JSON.stringify({ event: 'match:event', payload: { type: 'UNAVAILABLE', message: 'Session is no longer available', sessionId } })
                if (typeof (socket as any).send === 'function') (socket as any).send(resp)
              } catch (e) {}
              try { if (typeof (socket as any).close === 'function') (socket as any).close(); } catch (e) {}
              return
            }
          } catch (e) {}

          let userId: number | undefined
          let displayName: string | undefined
          if (data.payload?.token) {
            try {
              const decoded = this.fastify.jwt.verify<{ userId: number; sessionId?: number }>(data.payload.token)
              userId = decoded.userId
              authSessionId = decoded.sessionId ?? null
              if (authSessionId) {
                (socket as any).__sessionId = authSessionId
              }
              if (userId) {
                const u = await this.fastify.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } })
                displayName = u?.displayName
              }
            } catch (e) {
              this.fastify.log.warn('Invalid token provided in ready event')
            }
            if (userId) { (socket as any).__userId = userId }

            // If this connection is for a tournament local-match session, ensure
            // the connecting user is one of the scheduled participants. Reject
            // otherwise to prevent unauthorized players occupying match slots.
            try {
              if (sessionId && typeof sessionId === 'string' && sessionId.startsWith('local-match-') && userId) {
                const matchIdStr = sessionId.replace('local-match-', '')
                const matchId = parseInt(matchIdStr, 10)
                if (!isNaN(matchId)) {
                  const m = await this.fastify.prisma.tournamentMatch.findUnique({ where: { id: matchId }, include: { playerA: true, playerB: true } })
                  if (m) {
                    const pAUser = m.playerA?.userId
                    const pBUser = m.playerB?.userId
                    const allowed = (typeof pAUser === 'number' && pAUser === userId) || (typeof pBUser === 'number' && pBUser === userId)
                    if (!allowed) {
                      // Not a scheduled participant: reject connection
                      try {
                        const resp = JSON.stringify({ event: 'match:event', payload: { type: 'UNAVAILABLE', message: 'Not a participant of this match', sessionId } })
                        if (typeof (socket as any).send === 'function') (socket as any).send(resp)
                      } catch (e) {}
                      try { if (typeof (socket as any).close === 'function') (socket as any).close(); } catch (e) {}
                      return
                    }
                  }
                }
              }
            } catch (e) {
              this.fastify.log.warn({ err: e }, 'Failed to validate local-match participant')
            }

            try {
              if (userId) {
                const dbUser = await this.fastify.prisma.user.findUnique({ where: { id: userId }, select: { status: true } })
                if (dbUser && dbUser.status === 'IN_GAME') {
                  const existing = sessionId ? getConnection(userId as number, sessionId) : null

                  let isRejoiningCurrentGame = false
                  if (!existing && sessionId) {
                    const targetGame = manager.getGame(sessionId)
                    if (targetGame && typeof (targetGame as any).isPlayer === 'function') {
                      if ((targetGame as any).isPlayer(userId)) {
                        isRejoiningCurrentGame = true
                      }
                    }
                  }

                  if (!existing && !isRejoiningCurrentGame) {
                    try {
                      const resp = JSON.stringify({ event: 'match:event', payload: { type: 'UNAVAILABLE', message: 'User already in a different game', sessionId } })
                      if (typeof (socket as any).send === 'function') (socket as any).send(resp)
                    } catch (e) {}
                    try { if (typeof (socket as any).close === 'function') (socket as any).close(); } catch (e) {}
                    return
                  }
                }
              }

              if (!query.sessionId && query.mode === undefined) {
                const waiting = manager.takeWaitingSlot()
                if (waiting) {
                  const newSessionId = `game_${Date.now()}_${Math.random().toString(36).substr(2,9)}`
                  sessionId = newSessionId
                  try {
                    game = manager.createGame(sessionId)
                  } catch (e) {
                    try { const resp = JSON.stringify({ event: 'match:event', payload: { type: 'UNAVAILABLE', message: 'Failed to create game', sessionId } }); if (typeof (socket as any).send === 'function') (socket as any).send(resp); } catch (e) {}
                    try { if (typeof (socket as any).close === 'function') (socket as any).close(); } catch (e) {}
                    return
                  }

                    try { if (typeof waiting.userId === 'number') registerConnection(waiting.userId, sessionId, waiting.socket, 'game') } catch (e) {}

                  try {
                    this.fastify.log.info({ sessionId, waitingUser: waiting.userId }, 'Adding waiting socket to created game')
                    const slot = game.addPlayer(waiting.socket, waiting.userId, waiting.displayName)
                    this.fastify.log.info({ sessionId, slot, waitingUser: waiting.userId }, 'Added waiting socket to game')
                  } catch (e) {
                    this.fastify.log.warn({ err: e }, 'Failed to add waiting player to newly created game')
                  }

                  pairedWaitingSocket = waiting.socket
                  pairedWaitingUserId = waiting.userId

                  if (userId && sessionId) {
                    try { registerConnection(userId, sessionId, socket, 'game', authSessionId) } catch (e) {}
                  }
                } else {
                  const waitId = manager.createWaitingSlot(undefined, socket, userId, displayName)
                  sessionId = waitId
                  try {
                    if (userId && waitId) {
                      this.fastify.log.debug({ userId, waitId }, 'Registering game socket (wait)')
                      registerConnection(userId, waitId, socket, 'game', authSessionId)
                    }
                  } catch (e) { this.fastify.log.warn({ err: e }, 'Failed to register waiting connection') }
                  const resp = JSON.stringify({ event: 'match:event', payload: { type: 'CONNECTED', message: 'Waiting for opponent', slot: 'p1', waiting: true } })
                  if (typeof (socket as any).send === 'function') (socket as any).send(resp)
                  return
                }
              } else {
                if (userId && sessionId) {
                  this.fastify.log.debug({ userId, sessionId }, 'Registering game socket')
                  registerConnection(userId, sessionId, socket, 'game', authSessionId)
                }
              }
            } catch (e) {
              this.fastify.log.warn({ err: e }, 'Failed to register connection in connectionManager')
            }
          }

          if (query.mode === 'local') {
            game.addPlayer(socket as any, userId, displayName)
            game.addPlayer(socket as any)
            playerSlot = 'p1'
          } else {
            try {
              this.fastify.log.info({ sessionId, userId }, 'Adding joining socket to game')
              playerSlot = game.addPlayer(socket as any, userId, displayName as any)
              this.fastify.log.info({ sessionId, playerSlot, userId }, 'Added joining socket to game')
            } catch (e) {
              this.fastify.log.warn({ err: e, sessionId, userId }, 'Failed to add joining socket to game')
            }
          }

          const response = JSON.stringify({
            event: 'match:event',
            payload: {
              type: 'CONNECTED',
              message: 'Successfully connected to game server',
              sessionId,
              slot: playerSlot
            }
          })

          if (typeof (socket as any).send === 'function') {
            (socket as any).send(response)
          }

          if (pairedWaitingSocket && sessionId) {
            try {
              const msgWaiting = JSON.stringify({ event: 'match:event', payload: { type: 'MATCH_FOUND', message: 'Opponent found', sessionId, slot: 'p1' } })
              if (typeof (pairedWaitingSocket as any).send === 'function') (pairedWaitingSocket as any).send(msgWaiting)
            } catch (e) {}

            try {
              const msgJoining = JSON.stringify({ event: 'match:event', payload: { type: 'MATCH_FOUND', message: 'Match started', sessionId, slot: playerSlot } })
              if (typeof (socket as any).send === 'function') (socket as any).send(msgJoining)
            } catch (e) {}
          }
        } else if (data.event === 'input') {
          if (query.mode === 'local') {
            const p = data.payload.player as 'p1' | 'p2'
            if (p) game.processInput(p, data.payload)
          } else if (playerSlot) {
            game.processInput(playerSlot, data.payload)
          }
        } else if (data.event === 'control') {
          await handleControlEvent({ fastify: this.fastify, game, data, socket, sessionId })
        }
      } catch (err) {
        this.fastify.log.error(err, 'Failed to parse message')
      }
    }

    const handleClose = () => {
      this.fastify.log.info({ sessionId, userId: (socket as any).__userId ?? null }, 'Client disconnected from game websocket')
      try {
        const maybeUserId = (socket as any).__userId as number | undefined
        if (maybeUserId) {
          try {
            const rec = getConnection(maybeUserId, sessionId ?? '')
            if (rec && rec.socket === socket) {
              this.fastify.log.debug({ userId: maybeUserId, session: rec.sessionId }, 'Removing game socket for user on close')
              unregisterConnection(maybeUserId, rec.sessionId, socket, 'game')
            } else if (rec) {
              this.fastify.log.debug({ userId: maybeUserId, storedSession: rec.sessionId }, 'Close event did not match stored game socket')
            }
          } catch (e) {}
        }
      } catch (e) {}

      // Defer game teardown to next tick to avoid interacting with the
      // underlying socket object while the close event is still being processed
      // by the ws implementation. This helps avoid native-level races leading
      // to process aborts.
      setImmediate(() => {
        try {
          if (game) {
            game.removePlayer(socket as any)
          } else {
            if (sessionId) {
              try {
                this.fastify.log.info({ sessionId }, 'Removing waiting slot on socket close')
                manager.removeWaitingSlot(sessionId)
              } catch (e) { this.fastify.log.warn({ err: e, sessionId }, 'Failed to remove waiting slot on close') }
            }
          }
        } catch (e) {}
      })
    }

    try {
      if (socket && typeof (socket as any).on === 'function') {
        (socket as any).on('message', handleMessage)
        (socket as any).on('close', handleClose)
      } else if (socket && typeof (socket as any).addEventListener === 'function') {
        (socket as any).addEventListener('message', handleMessage)
        (socket as any).addEventListener('close', handleClose)
      } else {
        this.fastify.log.error('Socket has no listener method')
      }
    } catch (e) {
      // Fallback: attempt to attach in a safer way for wrapped connection objects
      try {
        if (socket && (socket as any).addEventListener) {
          (socket as any).addEventListener('message', handleMessage)
        }
      } catch (ee) {
        this.fastify.log.warn({ err: ee }, 'Failed to attach message listener')
      }
      try {
        if (socket && (socket as any).addEventListener) {
          (socket as any).addEventListener('close', handleClose)
        }
      } catch (ee) {
        this.fastify.log.warn({ err: ee }, 'Failed to attach close listener')
      }
    }
  }
}
