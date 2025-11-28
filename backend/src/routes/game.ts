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
    const query = req.query as { mode?: string; difficulty?: string };
    
    let gameResult;
    if (query.mode === 'ai') {
      gameResult = manager.createAIGame((query.difficulty as any) || 'NORMAL');
    } else if (query.mode === 'local') {
      gameResult = manager.createLocalGame();
    } else {
      gameResult = manager.findOrCreatePublicGame();
    }
    
    const { game, sessionId } = gameResult;
    
    let playerSlot: 'p1' | 'p2' | null = null;

    const handleMessage = (message: any) => {
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
          if (data.payload?.token) {
             try {
               const decoded = fastify.jwt.verify<{ userId: number }>(data.payload.token);
               userId = decoded.userId;
             } catch (e) {
               fastify.log.warn('Invalid token provided in ready event');
             }
          }

          if (query.mode === 'local') {
            game.addPlayer(socket as any, userId);
            game.addPlayer(socket as any, userId);
            playerSlot = 'p1';
          } else {
            playerSlot = game.addPlayer(socket as any, userId);
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
