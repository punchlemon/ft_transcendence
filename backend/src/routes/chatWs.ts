import { FastifyInstance } from 'fastify';
import { chatService } from '../services/chat';
import { notificationService } from '../services/notification';
import { friendService } from '../services/friend';
import { userService } from '../services/user';
import { presenceService } from '../services/presence';
import { WebSocket } from 'ws';

interface SocketStream {
  socket: WebSocket;
}

interface SocketWithSessionId extends WebSocket {
  __sessionId?: number;
}

export default async function chatWsRoutes(fastify: FastifyInstance) {
  const connections = new Map<number, Set<SocketWithSessionId>>();
  const sessionSockets = new Map<number, Set<SocketWithSessionId>>();

  const broadcastStatusChange = (userId: number, status: string) => {
    const payload = JSON.stringify({
      type: 'user_update',
      data: { id: userId, status }
    });
    
    for (const userSockets of connections.values()) {
      for (const ws of userSockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  };

  const broadcastUserCreated = (user: any) => {
    const payload = JSON.stringify({
      type: 'user_created',
      data: user
    });
    
    for (const userSockets of connections.values()) {
      for (const ws of userSockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  };

  const broadcastUserUpdated = (user: any) => {
    const payload = JSON.stringify({
      type: 'user_update',
      data: user
    });
    
    for (const userSockets of connections.values()) {
      for (const ws of userSockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  };

  const onStatusChange = (event: any) => {
    broadcastStatusChange(event.userId, event.status);
  };

  const onUserCreated = (user: any) => {
    broadcastUserCreated(user);
  };

  const onUserUpdated = (user: any) => {
    broadcastUserUpdated(user);
  };

  userService.on('status_change', onStatusChange);
  userService.on('user_created', onUserCreated);
  userService.on('user_updated', onUserUpdated);

  fastify.addHook('onClose', (instance, done) => {
    userService.off('status_change', onStatusChange);
    userService.off('user_created', onUserCreated);
    userService.off('user_updated', onUserUpdated);
    done();
  });

  const onChatMessage = async (message: any) => {
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
  };

  const onChatRead = async (event: any) => {
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
  };

  const onChannelCreated = (channel: any) => {
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
  };

  const onNotification = (notification: any) => {
    const userConns = connections.get(notification.userId);
    if (userConns) {
      const payload = JSON.stringify({ type: 'notification', data: notification });
      for (const ws of userConns) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  };

  const onNotificationDeleted = (event: any) => {
    const userConns = connections.get(event.userId);
    if (userConns) {
      const payload = JSON.stringify({ type: 'notification_deleted', data: { id: event.id } });
      for (const ws of userConns) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  };

  // Match history updates: emitted by GameManager when a match is persisted
  const onMatchHistory = (event: any) => {
    const payload = JSON.stringify({ type: 'match_history_update', data: event.match });
    // If event specifies a userId, send only to that user's connections.
    if (typeof event.userId === 'number') {
      const userConns = connections.get(event.userId);
      if (userConns) {
        for (const ws of userConns) {
          if (ws.readyState === WebSocket.OPEN) ws.send(payload);
        }
      }
      return;
    }

    // Otherwise broadcast to all connected users (public update)
    for (const userSockets of connections.values()) {
      for (const ws of userSockets) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  };

  notificationService.on('match_history', onMatchHistory);
  notificationService.on('match_history_public', onMatchHistory);

  chatService.on('message', onChatMessage);
  chatService.on('read', onChatRead);
  chatService.on('channel_created', onChannelCreated);
  notificationService.on('notification', onNotification);
  notificationService.on('notification_deleted', onNotificationDeleted);

  // Session expiration events (emitted from GameManager) are broadcast
  // to all connected chat clients so UI like invite Join buttons can be
  // invalidated in real time.
  const onSessionExpired = (event: any) => {
    const payload = JSON.stringify({ type: 'session_expired', data: event });
    for (const userSockets of connections.values()) {
      for (const ws of userSockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  };
  notificationService.on('session_expired', onSessionExpired);

  fastify.addHook('onClose', (instance, done) => {
    userService.off('status_change', onStatusChange);
    userService.off('user_created', onUserCreated);
    userService.off('user_updated', onUserUpdated);
    
    friendService.off('friend_accepted', onFriendAccepted);
    friendService.off('friend_removed', onFriendRemoved);
    friendService.off('user_blocked', onUserBlocked);
    friendService.off('user_unblocked', onUserUnblocked);
    friendService.off('friend_request_sent', onFriendRequestSent);
    friendService.off('friend_request_cancelled', onFriendRequestCancelled);
    friendService.off('friend_request_declined', onFriendRequestDeclined);

    chatService.off('message', onChatMessage);
    chatService.off('read', onChatRead);
    chatService.off('channel_created', onChannelCreated);
    notificationService.off('notification', onNotification);
    notificationService.off('notification_deleted', onNotificationDeleted);
    notificationService.off('session_expired', onSessionExpired);
    // Remove match history listeners
    try { notificationService.off('match_history', onMatchHistory); } catch (e) {}
    try { notificationService.off('match_history_public', onMatchHistory); } catch (e) {}
    
    done();
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

  const broadcastPublicFriendUpdate = (data: any) => {
    const payload = JSON.stringify({
      type: 'public_friend_update',
      data
    });
    
    for (const userSockets of connections.values()) {
      for (const ws of userSockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  };

  const onFriendAccepted = async (event: any) => {
    const { requesterId, addresseeId } = event;
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

    // Public updates
    const requester = await fastify.prisma.user.findUnique({ where: { id: requesterId } });
    const addressee = await fastify.prisma.user.findUnique({ where: { id: addresseeId } });

    if (requester && addressee) {
        broadcastPublicFriendUpdate({
            userId: requesterId,
            type: 'ADD',
            friend: {
                id: addressee.id,
                displayName: addressee.displayName,
                login: addressee.login,
                status: addressee.status,
                avatarUrl: addressee.avatarUrl
            }
        });

        broadcastPublicFriendUpdate({
            userId: addresseeId,
            type: 'ADD',
            friend: {
                id: requester.id,
                displayName: requester.displayName,
                login: requester.login,
                status: requester.status,
                avatarUrl: requester.avatarUrl
            }
        });
    }
  };

  const onFriendRemoved = (event: any) => {
    const { requesterId, addresseeId } = event;
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

    // Public updates
    broadcastPublicFriendUpdate({
        userId: requesterId,
        type: 'REMOVE',
        friendId: addresseeId
    });

    broadcastPublicFriendUpdate({
        userId: addresseeId,
        type: 'REMOVE',
        friendId: requesterId
    });
  };

  const onUserBlocked = (event: any) => {
    const { blockerId, blockedId } = event;
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
  };

  const onUserUnblocked = (event: any) => {
    const { blockerId, blockedId } = event;
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
  };

  const onFriendRequestSent = (event: any) => {
    const { senderId, receiverId, requestId } = event;
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
  };

  const onFriendRequestCancelled = (event: any) => {
    const { senderId, receiverId } = event;
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
  };

  const onFriendRequestDeclined = (event: any) => {
    const { senderId, receiverId } = event;
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
  };

  friendService.on('friend_accepted', onFriendAccepted);
  friendService.on('friend_removed', onFriendRemoved);
  friendService.on('user_blocked', onUserBlocked);
  friendService.on('user_unblocked', onUserUnblocked);
  friendService.on('friend_request_sent', onFriendRequestSent);
  friendService.on('friend_request_cancelled', onFriendRequestCancelled);
  friendService.on('friend_request_declined', onFriendRequestDeclined);

  fastify.addHook('onClose', (instance, done) => {
    userService.off('status_change', onStatusChange);
    userService.off('user_created', onUserCreated);
    userService.off('user_updated', onUserUpdated);
    
    friendService.off('friend_accepted', onFriendAccepted);
    friendService.off('friend_removed', onFriendRemoved);
    friendService.off('user_blocked', onUserBlocked);
    friendService.off('user_unblocked', onUserUnblocked);
    friendService.off('friend_request_sent', onFriendRequestSent);
    friendService.off('friend_request_cancelled', onFriendRequestCancelled);
    friendService.off('friend_request_declined', onFriendRequestDeclined);
    
    done();
  });

  // Register closeSocketsBySession implementation for presenceService
  presenceService.setCloseSocketsBySession(async (sessionId: number) => {
    let count = 0;
    const sockets = sessionSockets.get(sessionId);
    if (sockets) {
      for (const ws of sockets) {
        try {
          ws.close(4000, 'session_revoked');
          count++;
        } catch (e) {
          console.error(`[WS] Error closing socket for sessionId ${sessionId}:`, e);
        }
      }
      sessionSockets.delete(sessionId);
    }
    return count;
  });
    
  // Also register getConnectionCount implementation
  presenceService.setGetConnectionCount(async (userId: number) => {
    const set = connections.get(userId);
    return set ? set.size : 0;
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
    const socket = connection.socket || connection as SocketWithSessionId;

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
    let sessionId: number;
    try {
      const user = fastify.jwt.verify(token) as any;
      userId = user.userId;
      sessionId = user.sessionId;
    } catch (err) {
      socket.close(1008, 'Invalid token');
      return;
    }

    if (!sessionId) {
      socket.close(1008, 'Session ID missing from token');
      return;
    }

    // Bind socket to sessionId
    (socket as SocketWithSessionId).__sessionId = sessionId;
    if (!sessionSockets.has(sessionId)) {
      sessionSockets.set(sessionId, new Set());
    }
    sessionSockets.get(sessionId)!.add(socket as SocketWithSessionId);
    try { console.info(`[chat/ws] Added sessionSocket user=${userId} session=${sessionId}`) } catch (e) {}
    try { console.info(new Error('stack:').stack) } catch (e) {}

    // Chat handler manages its own `connections` map; do not register
    // with the central connection manager here to avoid cross-type evictions.

    if (!connections.has(userId)) {
      console.log(`[WS] User ${userId} connected (First connection)`);
      connections.set(userId, new Set());
      // First connection, set status ONLINE
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { status: 'ONLINE' }
      }).catch(console.error);
      broadcastStatusChange(userId, 'ONLINE');
    } else {
      console.log(`[WS] User ${userId} connected (New tab/window)`);
    }
    connections.get(userId)!.add(socket as SocketWithSessionId);
    try { console.info(`[chat/ws] Added chat connection user=${userId} session=${sessionId} totalConns=${connections.get(userId)!.size}`) } catch (e) {}
    try { console.info(new Error('stack:').stack) } catch (e) {}

    socket.on('close', async () => {
      console.log(`[WS] Socket closed for user ${userId}, sessionId ${sessionId}`);
      
      // Clean up from sessionSockets
      const sessionSocketSet = sessionSockets.get(sessionId);
      if (sessionSocketSet) {
        sessionSocketSet.delete(socket as SocketWithSessionId);
        if (sessionSocketSet.size === 0) {
          sessionSockets.delete(sessionId);
        }
      }

      try { console.info(`[chat/ws] Removed sessionSocket user=${userId} session=${sessionId}`) } catch (e) {}
      try { console.info(new Error('stack:').stack) } catch (e) {}

      // Chat handler manages its own `connections` map; nothing to unregister
      // in the central connection manager.

      const userConns = connections.get(userId);
      if (userConns) {
        userConns.delete(socket as SocketWithSessionId);
        try { console.info(`[chat/ws] Removed chat connection user=${userId} remaining=${userConns.size}`) } catch (e) {}
        try { console.info(new Error('stack:').stack) } catch (e) {}
        if (userConns.size === 0) {
          console.log(`[WS] User ${userId} went OFFLINE`);
          connections.delete(userId);
          // Last connection, set status OFFLINE
          await fastify.prisma.user.update({
            where: { id: userId },
            data: { status: 'OFFLINE' }
          }).catch(console.error);
          broadcastStatusChange(userId, 'OFFLINE');
        } else {
          console.log(`[WS] User ${userId} still has ${userConns.size} connections`);
        }
      }
    });
  });
}
