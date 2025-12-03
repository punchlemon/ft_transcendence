import { FastifyInstance } from 'fastify';
import { chatService } from '../services/chat';
import { notificationService } from '../services/notification';
import { WebSocket } from 'ws';

interface SocketStream {
  socket: WebSocket;
}

export default async function chatWsRoutes(fastify: FastifyInstance) {
  const connections = new Map<number, Set<WebSocket>>();

  chatService.on('message', async (message) => {
    // Get members of the channel
    // We use prisma directly here to avoid circular dependency or just for speed
    const members = await fastify.prisma.channelMember.findMany({
      where: { channelId: message.channelId },
      select: { userId: true }
    });

    const payload = JSON.stringify({ type: 'message', data: message });

    for (const member of members) {
      const userConns = connections.get(member.userId);
      if (userConns) {
        for (const ws of userConns) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
          }
        }
      }
    }
  });

  chatService.on('read', async (event) => {
    const members = await fastify.prisma.channelMember.findMany({
      where: { channelId: event.channelId },
      select: { userId: true }
    });

    const payload = JSON.stringify({ type: 'read', data: event });

    for (const member of members) {
      const userConns = connections.get(member.userId);
      if (userConns) {
        for (const ws of userConns) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
          }
        }
      }
    }
  });

  notificationService.on('notification', (notification) => {
    const userConns = connections.get(notification.userId);
    if (userConns) {
      const payload = JSON.stringify({ type: 'notification', data: notification });
      for (const ws of userConns) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  });

  fastify.get('/ws/chat', { websocket: true }, async (connection: any, req: any) => {
    // Guard: if this route was reached without a websocket connection object
    // (e.g. an accidental HTTP GET), avoid crashing the server.
    if (!connection || !connection.socket) {
      req.log && req.log.warn && req.log.warn({ headers: req.headers }, 'WebSocket handler invoked without a connection.socket')
      return
    }
    const token = (req.query as any).token;
    if (!token) {
      connection.socket.close(1008, 'Token required');
      return;
    }

    let userId: number;
    try {
      const user = fastify.jwt.verify(token) as any;
      userId = user.userId;
    } catch (err) {
      connection.socket.close(1008, 'Invalid token');
      return;
    }

    if (!connections.has(userId)) {
      connections.set(userId, new Set());
      // First connection, set status ONLINE
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { status: 'ONLINE' }
      }).catch(console.error);
    }
    connections.get(userId)!.add(connection.socket);

    connection.socket.on('close', async () => {
      const userConns = connections.get(userId);
      if (userConns) {
        userConns.delete(connection.socket);
        if (userConns.size === 0) {
          connections.delete(userId);
          // Last connection, set status OFFLINE
          await fastify.prisma.user.update({
            where: { id: userId },
            data: { status: 'OFFLINE' }
          }).catch(console.error);
        }
      }
    });
  });
}
