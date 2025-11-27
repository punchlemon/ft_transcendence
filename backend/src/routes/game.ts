import { FastifyInstance } from 'fastify'
import { GameManager } from '../game/GameManager'

export default async function gameRoutes(fastify: FastifyInstance) {
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
    const { game, sessionId } = manager.findOrCreatePublicGame();
    
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
          playerSlot = game.addPlayer(socket as any);
          
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
        } else if (data.event === 'input' && playerSlot) {
          game.processInput(playerSlot, data.payload);
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
