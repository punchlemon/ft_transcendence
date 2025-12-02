import { FastifyInstance } from 'fastify'
import { GameManager } from '../game/GameManager'
import { notificationService } from '../services/notification'

export default async function gameRoutes(fastify: FastifyInstance) {
  fastify.post('/game/invite', {
    preValidation: [fastify.authenticate]
  }, async (req, reply) => {
    const { targetUserId } = req.body as { targetUserId: number };
    const user = req.user;
    
    if (!targetUserId) {
      return reply.code(400).send({ error: 'targetUserId is required' });
    }

    const inviter = await fastify.prisma.user.findUnique({
      where: { id: user.userId },
      select: { displayName: true }
    });

    const manager = GameManager.getInstance();
    const { sessionId } = manager.createPrivateGame();

    await notificationService.createNotification(
      targetUserId,
      'MATCH_INVITE',
      'Game Invitation',
      `${inviter?.displayName || 'Someone'} invited you to a game!`,
      { sessionId, inviterId: user.userId }
    );

    return { sessionId };
  });

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
    
    let gameResult;
    if (query.sessionId) {
      // If client provides a specific session ID (e.g. tournament match), use it.
      // This allows the frontend to dictate the session ID for tournament matches.
      const existingGame = manager.getGame(query.sessionId);
      if (existingGame) {
        gameResult = { game: existingGame, sessionId: query.sessionId };
      } else {
        // Create new game with this specific ID
        gameResult = { game: manager.createGame(query.sessionId), sessionId: query.sessionId };
      }

      if (query.mode === 'ai') {
        gameResult.game.addAIPlayer((query.difficulty as any) || 'NORMAL', (query.aiSlot as any));
      }
    } else if (query.mode === 'ai') {
      gameResult = manager.createAIGame((query.difficulty as any) || 'NORMAL');
    } else if (query.mode === 'local') {
      gameResult = manager.createLocalGame();
    } else {
      gameResult = manager.findOrCreatePublicGame();
    }
    
    const { game, sessionId } = gameResult;
    
    let playerSlot: 'p1' | 'p2' | null = null;

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
          let userId: number | undefined;
          let displayName: string | undefined;
          if (data.payload?.token) {
             try {
               const decoded = fastify.jwt.verify<{ userId: number }>(data.payload.token);
               userId = decoded.userId;
               if (userId) {
                 const u = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
                 displayName = u?.displayName;
               }
             } catch (e) {
               fastify.log.warn('Invalid token provided in ready event');
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
            playerSlot = game.addPlayer(socket as any, userId, displayName as any);
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
          }
        }
      } catch (err) {
        fastify.log.error(err, 'Failed to parse message')
      }
    }

    const handleClose = () => {
      fastify.log.info('Client disconnected from game websocket')
      game.removePlayer(socket as any)
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
