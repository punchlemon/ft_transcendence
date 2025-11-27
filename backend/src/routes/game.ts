import { FastifyInstance } from 'fastify'
import { GameEngine } from '../game/engine'

// Singleton for now
const gameEngine = new GameEngine()

export default async function gameRoutes(fastify: FastifyInstance) {
  fastify.get('/ws/game', { websocket: true }, (connection, req) => {
    fastify.log.info('Client connected to game websocket')
    
    // Connection is the socket itself in @fastify/websocket v10+
    const socket = connection
    
    if (!socket) {
      fastify.log.error('No socket found in connection')
      return
    }

    const handleMessage = (message: any) => {
      try {
        // Handle both Buffer (ws) and MessageEvent (native)
        const rawData = message.data || message
        const data = JSON.parse(rawData.toString())
        fastify.log.info({ msg: 'Received message', data })

        if (data.event === 'ready') {
          const response = JSON.stringify({
            event: 'match:event',
            payload: { type: 'CONNECTED', message: 'Successfully connected to game server' }
          })
          
          if (typeof (socket as any).send === 'function') {
            (socket as any).send(response)
          }

          // Add to game engine (force p1 for testing)
          gameEngine.addPlayer(socket as any, 'p1')
        }
      } catch (err) {
        fastify.log.error(err, 'Failed to parse message')
      }
    }

    const handleClose = () => {
      fastify.log.info('Client disconnected from game websocket')
      gameEngine.removePlayer(socket as any)
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
