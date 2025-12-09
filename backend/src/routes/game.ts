import { FastifyInstance } from 'fastify'
import { GameManager } from '../game/GameManager'
import { notificationService } from '../services/notification'
import { getDisplayNameOrFallback } from '../services/user'
// Manage game sockets separately to avoid interfering with chat sockets
const gameSockets = new Map<number, { socket: any; sessionId: string }>();

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
    
    // Connection is the socket itself in @fastify/websocket v10+
    const socket = connection
    
    if (!socket) {
      fastify.log.error('No socket found in connection')
      return
    }

    // Use GameManager to find/create game
    // In future, extract sessionId from req.query or token
    const manager = GameManager.getInstance();
    const query = req.query as { mode?: string; difficulty?: string; sessionId?: string; aiSlot?: string };
    
    let game: any = undefined;
    let gameResult: { game: any; sessionId: string } | undefined = undefined;
    let sessionId: string | undefined = undefined;
    let pairedWaitingSocket: any = null
    let pairedWaitingUserId: number | undefined = undefined

    if (query.sessionId) {
      // If client provides a specific session ID (e.g. tournament match), use it.
      // This allows the frontend to dictate the session ID for tournament matches.
        // If the sessionId has been marked expired/removed, refuse to allow
        // re-creation and notify the client that the session is unavailable.
        if (manager.isExpired(query.sessionId)) {
          // Attempt to notify client and close socket immediately.
          try {
            const resp = JSON.stringify({ event: 'match:event', payload: { type: 'UNAVAILABLE', message: 'Session is no longer available', sessionId: query.sessionId } });
            if (typeof (socket as any).send === 'function') (socket as any).send(resp);
          } catch (e) {}
          try { if (typeof (socket as any).close === 'function') (socket as any).close(); } catch (e) {}
          return;
        }

        const existingGame = manager.getGame(query.sessionId);
        if (existingGame) {
          gameResult = { game: existingGame, sessionId: query.sessionId };
        } else {
          // Create new game with this specific ID
          try {
            gameResult = { game: manager.createGame(query.sessionId), sessionId: query.sessionId };
          } catch (err) {
            try { fastify.log.warn({ err, sessionId: query.sessionId }, 'createGame threw when handling provided sessionId') } catch (e) {}
            // If createGame refused due to expiration, notify client and close socket.
            try {
              const resp = JSON.stringify({ event: 'match:event', payload: { type: 'UNAVAILABLE', message: 'Session is no longer available', sessionId: query.sessionId } });
              if (typeof (socket as any).send === 'function') (socket as any).send(resp);
            } catch (e) {}
            try { if (typeof (socket as any).close === 'function') (socket as any).close(); } catch (e) {}
            return;
          }
        }

        // Ensure local references are set so later handlers (ready/addPlayer)
        // can safely access `game` and `sessionId` regardless of mode.
        if (gameResult) {
          game = gameResult.game;
          sessionId = gameResult.sessionId;
        }

        if (query.mode === 'ai' && game) {
          // existing specific-session + ai slot
          game.addAIPlayer((query.difficulty as any) || 'NORMAL', (query.aiSlot as any));
        }
    } else if (query.mode === 'ai') {
      const g = manager.createAIGame((query.difficulty as any) || 'NORMAL');
      game = g.game
      sessionId = g.sessionId
    } else if (query.mode === 'local') {
      const g = manager.createLocalGame();
      game = g.game
      sessionId = g.sessionId
    } else {
      // public mode: do not create game yet. We'll handle waiting/creation on 'ready'.
      sessionId = undefined
      game = undefined
    }
    
    let playerSlot: 'p1' | 'p2' | null = null;
    let authSessionId: number | null = null;

    const handleMessage = async (message: any) => {
      try {
        // Handle both Buffer (ws) and MessageEvent (native)
        const rawData = message.data || message
        const data = JSON.parse(rawData.toString())
        
        // Log non-input messages
        if (data.event !== 'input') {
          fastify.log.info({ msg: 'Received message', data })
        }

        if (data.event === 'ready') {
          // Defensive: re-check expiration at the time the client declares
          // readiness. Fastify accepts websocket connections before this
          // handler runs, so a client may connect briefly even for an
          // expired session. Prevent any further processing if the
          // session is expired.
          try {
            const mgr = GameManager.getInstance();
            if (sessionId && mgr.isExpired(sessionId)) {
              try {
                const resp = JSON.stringify({ event: 'match:event', payload: { type: 'UNAVAILABLE', message: 'Session is no longer available', sessionId } });
                if (typeof (socket as any).send === 'function') (socket as any).send(resp);
              } catch (e) {}
              try { if (typeof (socket as any).close === 'function') (socket as any).close(); } catch (e) {}
              return;
            }
          } catch (e) {
            // swallow
          }
          let userId: number | undefined;
          let displayName: string | undefined;
          if (data.payload?.token) {
             try {
               const decoded = fastify.jwt.verify<{ userId: number; sessionId?: number }>(data.payload.token);
               userId = decoded.userId;
               authSessionId = decoded.sessionId ?? null;
               
               // Bind socket to authSessionId for force-close on logout
               if (authSessionId) {
                 (socket as any).__sessionId = authSessionId;
               }
               
               if (userId) {
                 const u = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
                 displayName = u?.displayName;
               }
             } catch (e) {
               fastify.log.warn('Invalid token provided in ready event');
             }
            if (userId) {
              ;(socket as any).__userId = userId
            }
            // If the user is already in a different game (IN_GAME) and is not
            // reconnecting to the same session, refuse to join/start another game.
            try {
              if (userId) {
                const dbUser = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { status: true } })
                if (dbUser && dbUser.status === 'IN_GAME') {
                  // If there's an existing connection for the same user/session, allow (reconnect)
                  const existingRec = sessionId ? gameSockets.get(userId) : null
                  const existing = existingRec && existingRec.sessionId === sessionId ? existingRec : null
                  if (!existing) {
                    try {
                      const resp = JSON.stringify({ event: 'match:event', payload: { type: 'UNAVAILABLE', message: 'User already in a different game', sessionId } });
                      if (typeof (socket as any).send === 'function') (socket as any).send(resp);
                    } catch (e) {}
                    try { if (typeof (socket as any).close === 'function') (socket as any).close(); } catch (e) {}
                    return;
                  }
                }
              }
              // Public mode lazy matching: if no sessionId supplied and mode is public,
              // either create a waiting slot (first player) or pair with an existing waiter.
              if (!query.sessionId && query.mode === undefined) {
                // public
                const waiting = manager.takeWaitingSlot()
                if (waiting) {
                  // Found a waiting player: create a new GameEngine session now and add both players
                  const newSessionId = `game_${Date.now()}_${Math.random().toString(36).substr(2,9)}`
                  sessionId = newSessionId
                  try {
                    game = manager.createGame(sessionId)
                  } catch (e) {
                    // if createGame fails, notify and close
                    try { const resp = JSON.stringify({ event: 'match:event', payload: { type: 'UNAVAILABLE', message: 'Failed to create game', sessionId } }); if (typeof (socket as any).send === 'function') (socket as any).send(resp); } catch (e) {}
                    try { if (typeof (socket as any).close === 'function') (socket as any).close(); } catch (e) {}
                    return
                  }

                  // register waiting player's connection under the new session id
                  try {
                    if (typeof waiting.userId === 'number') gameSockets.set(waiting.userId, { socket: waiting.socket, sessionId })
                  } catch (e) {}

                  // add the waiting socket first
                  try {
                    fastify.log.info({ sessionId, waitingUser: waiting.userId }, 'Adding waiting socket to created game')
                    const slot = game.addPlayer(waiting.socket, waiting.userId, waiting.displayName)
                    fastify.log.info({ sessionId, slot, waitingUser: waiting.userId }, 'Added waiting socket to game')
                  } catch (e) {
                    fastify.log.warn({ err: e }, 'Failed to add waiting player to newly created game')
                  }

                  // remember paired waiting socket so we can notify it after current joins
                  pairedWaitingSocket = waiting.socket
                  pairedWaitingUserId = waiting.userId

                  // then proceed to register & add current socket (registration now binds to new sessionId)
                  if (userId && sessionId) {
                    try { gameSockets.set(userId, { socket, sessionId }) } catch (e) {}
                  }
                } else {
                  // No waiter: create waiting slot for this socket and return CONNECTED WAITING
                  const waitId = manager.createWaitingSlot(undefined, socket, userId, displayName)
                  // remember the waiting slot id in this handler so socket close
                  // will remove the waiting slot correctly
                  sessionId = waitId
                  try {
                    if (userId && waitId) {
                      // Diagnostic log: registering/writing game socket for user
                      try { console.info(`[game/ws] Registering game socket (wait) user=${userId} session=${waitId}`) } catch (e) {}
                      try { console.info(new Error('stack:').stack) } catch (e) {}
                      gameSockets.set(userId, { socket, sessionId: waitId })
                    }
                  } catch (e) {}
                  // Send waiting response WITHOUT sessionId to avoid exposing a navigable URL
                  const resp = JSON.stringify({ event: 'match:event', payload: { type: 'CONNECTED', message: 'Waiting for opponent', slot: 'p1', waiting: true } })
                  if (typeof (socket as any).send === 'function') (socket as any).send(resp)
                  return
                }
              } else {
                // Non-public or explicit session: register connection normally
                if (userId && sessionId) {
                  try { console.info(`[game/ws] Registering game socket user=${userId} session=${sessionId}`) } catch (e) {}
                  try { console.info(new Error('stack:').stack) } catch (e) {}
                  gameSockets.set(userId, { socket, sessionId })
                }
              }
            } catch (e) {
              fastify.log.warn({ err: e }, 'Failed to register connection in connectionManager')
            }
          }

          if (query.mode === 'local') {
            // For local/demo mode, only the first player should be associated
            // with the viewer's userId. The second local player is treated as
            // an anonymous/local slot so we avoid saving duplicate user IDs.
            game.addPlayer(socket as any, userId, displayName);
            game.addPlayer(socket as any);
            playerSlot = 'p1';
          } else {
            try {
              fastify.log.info({ sessionId, userId }, 'Adding joining socket to game')
              playerSlot = game.addPlayer(socket as any, userId, displayName as any);
              fastify.log.info({ sessionId, playerSlot, userId }, 'Added joining socket to game')
            } catch (e) {
              fastify.log.warn({ err: e, sessionId, userId }, 'Failed to add joining socket to game')
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
          // If we paired this socket with a previously-waiting socket,
          // notify both participants that a match was found and include
          // the newly-created sessionId so clients can navigate.
          if (pairedWaitingSocket && sessionId) {
            try {
              const msgWaiting = JSON.stringify({ event: 'match:event', payload: { type: 'MATCH_FOUND', message: 'Opponent found', sessionId, slot: 'p1' } })
              if (typeof (pairedWaitingSocket as any).send === 'function') (pairedWaitingSocket as any).send(msgWaiting)
            } catch (e) { /* swallow */ }

            try {
              const msgJoining = JSON.stringify({ event: 'match:event', payload: { type: 'MATCH_FOUND', message: 'Match started', sessionId, slot: playerSlot } })
              if (typeof (socket as any).send === 'function') (socket as any).send(msgJoining)
            } catch (e) { /* swallow */ }
          }
        } else if (data.event === 'input') {
          if (query.mode === 'local') {
            const p = data.payload.player as 'p1' | 'p2';
            if (p) game.processInput(p, data.payload);
          } else if (playerSlot) {
            game.processInput(playerSlot, data.payload);
          }
        } else if (data.event === 'control') {
          const type = data.payload?.type
          if (type === 'PAUSE') {
            game.pauseGame('Paused by player')
          } else if (type === 'RESUME') {
            game.startGame()
          } else if (type === 'ABORT') {
            try {
              // Try to gracefully abort and persist partial result
              if (typeof (game as any).abortGame === 'function') {
                ;(game as any).abortGame()
              } else if (typeof (game as any).finishGame === 'function') {
                // Fallback: determine winner by score
                const s = (game as any).state?.score
                const winner = s && s.p2 > s.p1 ? 'p2' : 'p1'
                ;(game as any).finishGame(winner)
              }
            } catch (e) {
              fastify.log.error({ err: e }, 'Failed to abort game')
            }
          } else if (type === 'LEAVE') {
            // Explicit leave: remove this player immediately instead of
            // waiting for socket close. This covers SPA navigation away
            // from the game or an explicit "leave" button.
            try {
              game.removePlayer(socket as any)

              // Send an optional confirmation event to the client
              const resp = JSON.stringify({
                event: 'match:event',
                payload: { type: 'LEFT', message: 'You have left the match', sessionId }
              })
              if (typeof (socket as any).send === 'function') {
                (socket as any).send(resp)
              }
            } catch (e) {
              fastify.log.warn({ err: e, sessionId }, 'Error while handling LEAVE control event')
            } finally {
              // Try to close the socket from server side to ensure a clean
              // deterministic removal; client may already close itself.
              try {
                if (typeof (socket as any).close === 'function') {
                  ;(socket as any).close()
                }
              } catch (e) {
                // ignore
              }
            }
            } else if (type === 'RESTART_MATCH') {
              // Allow clients to request a new match in the same session
              try {
                const params = data.payload?.params
                if (typeof (game as any).restartMatch === 'function') {
                  ;(game as any).restartMatch(params)
                } else {
                  // If engine doesn't support restartMatch, fallback to restarting via startGame
                  try { game.startGame() } catch (e) {}
                }
              } catch (e) {
                fastify.log.warn({ err: e, sessionId }, 'Error while handling RESTART_MATCH control event')
              }
          }
        }
      } catch (err) {
        fastify.log.error(err, 'Failed to parse message')
      }
    }

    const handleClose = () => {
      fastify.log.info({ sessionId, userId: (socket as any).__userId ?? null }, 'Client disconnected from game websocket')
        try {
          const maybeUserId = (socket as any).__userId as number | undefined
          if (maybeUserId) {
            // If this socket is registered in the local gameSockets map, remove it
              try {
                const rec = gameSockets.get(maybeUserId)
                if (rec && rec.socket === socket) {
                  try { console.info(`[game/ws] Removing game socket for user=${maybeUserId} session=${rec.sessionId} on close`) } catch (e) {}
                  try { console.info(new Error('stack:').stack) } catch (e) {}
                  gameSockets.delete(maybeUserId)
                } else if (rec) {
                  try { console.info(`[game/ws] Close event for user=${maybeUserId} did not match stored game socket (storedSession=${rec.sessionId})`) } catch (e) {}
                }
              } catch (e) {}
          }
        } catch (e) {}
      // Central unregister is not used here; gameSockets map is the source
      // of truth for game connections and was cleaned up above.
      try {
        if (game) {
          game.removePlayer(socket as any)
        } else {
          // if no game and sessionId corresponds to a waiting slot, remove it
          if (sessionId) {
            try {
              fastify.log.info({ sessionId }, 'Removing waiting slot on socket close')
              manager.removeWaitingSlot(sessionId)
            } catch (e) { fastify.log.warn({ err: e, sessionId }, 'Failed to remove waiting slot on close') }
          }
        }
      } catch (e) {
        // swallow
      }
    }

    if (typeof (socket as any).on === 'function') {
      (socket as any).on('message', handleMessage);
      (socket as any).on('close', handleClose);
    } else if (typeof (socket as any).addEventListener === 'function') {
      (socket as any).addEventListener('message', handleMessage);
      (socket as any).addEventListener('close', handleClose);
    } else {
      fastify.log.error('Socket has no listener method')
    }
  })
}
