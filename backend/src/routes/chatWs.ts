import { FastifyInstance } from 'fastify';
import { chatService } from '../services/chat';
import { notificationService } from '../services/notification';
import { friendService } from '../services/friend';
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

  chatService.on('channel_created', (channel) => {
    const payload = JSON.stringify({ type: 'channel_created', data: { id: channel.id } });
    // channel.members is expected to be populated because we included it in the create call
    if (channel.members) {
      for (const member of channel.members) {
        const userConns = connections.get(member.userId);
        if (userConns) {
          for (const ws of userConns) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(payload);
            }
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

  notificationService.on('notification_deleted', (event) => {
    const userConns = connections.get(event.userId);
    if (userConns) {
      const payload = JSON.stringify({ type: 'notification_deleted', data: { id: event.id } });
      for (const ws of userConns) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  });

  friendService.on('friend_accepted', (event) => {
    const { requesterId, addresseeId } = event;

    // Notify requester
    const requesterConns = connections.get(requesterId);
    if (requesterConns) {
      const payload = JSON.stringify({ 
        type: 'friend_update', 
        data: { friendId: addresseeId, status: 'FRIEND' } 
      });
      for (const ws of requesterConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }

    // Notify addressee
    const addresseeConns = connections.get(addresseeId);
    if (addresseeConns) {
      const payload = JSON.stringify({ 
        type: 'friend_update', 
        data: { friendId: requesterId, status: 'FRIEND' } 
      });
      for (const ws of addresseeConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  });

  friendService.on('friend_removed', (event) => {
    const { requesterId, addresseeId } = event;

    // Notify requester
    const requesterConns = connections.get(requesterId);
    if (requesterConns) {
      const payload = JSON.stringify({ 
        type: 'friend_update', 
        data: { friendId: addresseeId, status: 'NONE' } 
      });
      for (const ws of requesterConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }

    // Notify addressee
    const addresseeConns = connections.get(addresseeId);
    if (addresseeConns) {
      const payload = JSON.stringify({ 
        type: 'friend_update', 
        data: { friendId: requesterId, status: 'NONE' } 
      });
      for (const ws of addresseeConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  });

  friendService.on('user_blocked', (event) => {
    const { blockerId, blockedId } = event;

    // Notify blocker
    const blockerConns = connections.get(blockerId);
    if (blockerConns) {
      const payload = JSON.stringify({ 
        type: 'relationship_update', 
        data: { userId: blockedId, status: 'BLOCKING' } 
      });
      for (const ws of blockerConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  });

  friendService.on('user_unblocked', (event) => {
    const { blockerId, blockedId } = event;

    // Notify blocker
    const blockerConns = connections.get(blockerId);
    if (blockerConns) {
      const payload = JSON.stringify({ 
        type: 'relationship_update', 
        data: { userId: blockedId, status: 'NONE' } 
      });
      for (const ws of blockerConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  });

  friendService.on('friend_request_sent', (event) => {
    const { senderId, receiverId, requestId } = event;

    // Notify sender
    const senderConns = connections.get(senderId);
    if (senderConns) {
      const payload = JSON.stringify({ 
        type: 'friend_update', 
        data: { friendId: receiverId, status: 'PENDING_SENT', requestId } 
      });
      for (const ws of senderConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }

    // Notify receiver
    const receiverConns = connections.get(receiverId);
    if (receiverConns) {
      const payload = JSON.stringify({ 
        type: 'friend_update', 
        data: { friendId: senderId, status: 'PENDING_RECEIVED', requestId } 
      });
      for (const ws of receiverConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  });

  friendService.on('friend_request_cancelled', (event) => {
    const { senderId, receiverId } = event;

    // Notify sender
    const senderConns = connections.get(senderId);
    if (senderConns) {
      const payload = JSON.stringify({ 
        type: 'friend_update', 
        data: { friendId: receiverId, status: 'NONE' } 
      });
      for (const ws of senderConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }

    // Notify receiver
    const receiverConns = connections.get(receiverId);
    if (receiverConns) {
      const payload = JSON.stringify({ 
        type: 'friend_update', 
        data: { friendId: senderId, status: 'NONE' } 
      });
      for (const ws of receiverConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  });

  friendService.on('friend_request_declined', (event) => {
    const { senderId, receiverId } = event;

    // Notify sender (who sent the request)
    const senderConns = connections.get(senderId);
    if (senderConns) {
      const payload = JSON.stringify({ 
        type: 'friend_update', 
        data: { friendId: receiverId, status: 'NONE' } 
      });
      for (const ws of senderConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }

    // Notify receiver (who declined) - just to keep state consistent
    const receiverConns = connections.get(receiverId);
    if (receiverConns) {
      const payload = JSON.stringify({ 
        type: 'friend_update', 
        data: { friendId: senderId, status: 'NONE' } 
      });
      for (const ws of receiverConns) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  });

  fastify.get('/ws/chat', { websocket: true }, async (connection: any, req: any) => {
    // Guard: if this route was reached without a websocket connection object
    // (e.g. an accidental HTTP GET), avoid crashing the server.
    if (!connection) {
      req.log && req.log.warn && req.log.warn({ headers: req.headers }, 'WebSocket handler invoked without a connection')
      return
    }
    
    // Compatibility check: fastify-websocket v10 passes SocketStream, but sometimes we might get raw socket?
    // If connection has .socket, use it. If connection IS socket, use it.
    const socket = connection.socket || connection;

    if (!socket) {
       req.log && req.log.warn && req.log.warn({ headers: req.headers }, 'WebSocket handler invoked without a socket (connection object present)')
       return
    }
    
    const token = (req.query as any).token;
    if (!token) {
      socket.close(1008, 'Token required');
      return;
    }

    let userId: number;
    try {
      const user = fastify.jwt.verify(token) as any;
      userId = user.userId;
    } catch (err) {
      socket.close(1008, 'Invalid token');
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
    connections.get(userId)!.add(socket);

    socket.on('close', async () => {
      const userConns = connections.get(userId);
      if (userConns) {
        userConns.delete(socket);
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
