import { FastifyInstance } from 'fastify';
import ChatSocketHandler from '../chat/ChatSocketHandler';

export default async function chatWsRoutes(fastify: FastifyInstance) {
  // Create a single ChatSocketHandler for the application lifetime so
  // connection maps are shared across incoming sockets.
  const handler = new ChatSocketHandler(fastify);
  fastify.get('/ws/chat', { websocket: true }, async (connection: any, req: any) => {
    if (!connection) {
      req.log && req.log.warn && req.log.warn({ headers: req.headers }, 'WebSocket handler invoked without a connection');
      return;
    }
    try {
      await handler.handle(connection, req);
    } catch (e) {
      fastify.log.error({ err: e }, 'Failed to handle chat websocket connection');
      try { connection.socket && connection.socket.close && connection.socket.close(1011); } catch (err) {}
    }
  });
}
