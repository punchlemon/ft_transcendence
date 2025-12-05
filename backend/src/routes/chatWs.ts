import { FastifyInstance } from 'fastify';
import { chatService } from '../services/chat';
import { notificationService } from '../services/notification';
import { friendService } from '../services/friend';
import { presenceService } from '../services/presence';
import { WebSocket } from 'ws';

type SocketEntry = { ws: WebSocket; sessionId?: number }

interface SocketStream {
  socket: WebSocket;
}

export default async function chatWsRoutes(fastify: FastifyInstance) {
  const connections = new Map<number, Set<SocketEntry>>();
  // Map socket -> userId to reliably find owner when 'close' fires
  const socketToUser = new WeakMap<WebSocket, number>();
  // Map socket -> sessionId for per-session close
  const socketToSession = new WeakMap<WebSocket, number>();

  // Cleanup helper moved to outer scope so it can be reused by the forced-close helper.
  const cleanupSocket = async (s: WebSocket) => {
    try {
      const ownerId = socketToUser.get(s);
      if (ownerId === undefined) {
        // If no owner mapping, attempt best-effort removal across all sets
        for (const [uid, setOfSockets] of connections.entries()) {
          const entry = Array.from(setOfSockets).find(e => e.ws === s);
          if (entry) {
            setOfSockets.delete(entry);
            socketToUser.delete(s as WebSocket);
            socketToSession.delete(s as WebSocket);
            if (setOfSockets.size === 0) {
              connections.delete(uid);
              await fastify.prisma.user.update({ where: { id: uid }, data: { status: 'OFFLINE' } }).catch(console.error);
              broadcastPresenceToFriends(uid, 'OFFLINE').catch(() => {});
              fastify.log && fastify.log.info && fastify.log.info({ uid }, 'user presence: OFFLINE (cleaned up)')
            }
            break;
          }
        }
        return;
      }

      const userConns = connections.get(ownerId);
      if (userConns) {
        const entry = Array.from(userConns).find(e => e.ws === s);
        if (entry) {
          userConns.delete(entry);
          socketToUser.delete(s as WebSocket);
          socketToSession.delete(s as WebSocket);
          if (userConns.size === 0) {
            connections.delete(ownerId);
            await fastify.prisma.user.update({ where: { id: ownerId }, data: { status: 'OFFLINE' } }).catch(console.error);
            broadcastPresenceToFriends(ownerId, 'OFFLINE').catch(() => {});
            fastify.log && fastify.log.info && fastify.log.info({ ownerId }, 'user presence: OFFLINE (last connection closed)')
          }
        }
      }
    } catch (err) {
      fastify.log && fastify.log.warn && fastify.log.warn({ err }, 'Error during socket cleanup')
    }
  }

  // Force-close all sockets for a given userId. Returns number of sockets attempted.
  const closeUserSockets = async (userId: number) => {
    const setOfSockets = connections.get(userId);
    if (!setOfSockets || setOfSockets.size === 0) return 0;

    // Copy socket entries so we can iterate while cleanup mutates the set
    const sockets = Array.from(setOfSockets);
    for (const entry of sockets) {
      const ws = entry.ws;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // 4000+ are application-defined close codes; use 4000 to indicate server-forced logout
          ws.close(4000, 'server logout');
        }
      } catch (err) {
        // ignore
      }

      // Ensure cleanup runs (if 'close' event doesn't fire synchronously)
      try {
        // cleanupSocket is idempotent and safe to call
        // eslint-disable-next-line no-await-in-loop
        await cleanupSocket(ws);
      } catch (err) {
        fastify.log && fastify.log.warn && fastify.log.warn({ err }, 'Error during forced socket cleanup')
      }
    }

    return sockets.length;
  }

  // Force-close sockets belonging to a specific sessionId. Returns number of sockets attempted.
  const closeSocketsBySession = async (sessionId: number) => {
    let attempted = 0;
    for (const [userId, setOfSockets] of connections.entries()) {
      const entries = Array.from(setOfSockets).filter(e => e.sessionId === sessionId);
      if (!entries.length) continue;
      for (const entry of entries) {
        const ws = entry.ws;
        try {
          if (ws.readyState === WebSocket.OPEN) ws.close(4000, 'server logout-session');
        } catch (err) {
          // ignore
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          await cleanupSocket(ws);
        } catch (err) {
          fastify.log && fastify.log.warn && fastify.log.warn({ err }, 'Error during session forced socket cleanup')
        }
        attempted++;
      }
    }
    return attempted;
  }

  // Return number of active socket connections for a given userId
  const getConnectionCount = async (userId: number) => {
    const setOfSockets = connections.get(userId)
    return setOfSockets ? setOfSockets.size : 0
  }


  // Broadcast presence changes to connected friends of a user
  const broadcastPresenceToFriends = async (userId: number, status: 'ONLINE' | 'OFFLINE') => {
    try {
      fastify.log && fastify.log.info && fastify.log.info({ userId, status }, 'broadcastPresenceToFriends called')
      const friendships = await fastify.prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            { requesterId: userId },
            { addresseeId: userId }
          ]
        },
        select: { requesterId: true, addresseeId: true }
      });

      const friendIds = friendships.map(f => (f.requesterId === userId ? f.addresseeId : f.requesterId));

      fastify.log && fastify.log.info && fastify.log.info({ userId, friendCount: friendIds.length, friendIds }, 'presence friends resolved')

      const payload = JSON.stringify({ type: 'friend_status', data: { userId, status } });

      for (const fid of friendIds) {
        const conns = connections.get(fid);
        if (!conns) {
          fastify.log && fastify.log.debug && fastify.log.debug({ userId, fid }, 'no connections for friend')
          continue;
        }
        let sent = 0
        for (const entry of conns) {
          const ws = entry.ws
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(payload);
              sent++
            }
          } catch (err) {
            fastify.log && fastify.log.warn && fastify.log.warn({ err, userId, fid }, 'error sending presence payload')
          }
        }
        fastify.log && fastify.log.info && fastify.log.info({ userId, fid, conns: conns.size, sent }, 'presence payload send summary')
      }
    } catch (err) {
      fastify.log && fastify.log.warn && fastify.log.warn({ err }, 'Failed to broadcast presence to friends')
    }
  }

  presenceService.setBroadcast(broadcastPresenceToFriends)

    // Register helpers in the shared presenceService so other parts of the app can call them.
    presenceService.setCloseSockets(closeUserSockets)
    presenceService.setCloseSocketsBySession(closeSocketsBySession)
    presenceService.setGetConnectionCount(getConnectionCount)

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
        for (const entry of userConns) {
          const ws = entry.ws
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
        for (const entry of userConns) {
          const ws = entry.ws
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
          for (const entry of userConns) {
            const ws = entry.ws
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
      for (const entry of userConns) {
        const ws = entry.ws
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
      for (const entry of userConns) {
        const ws = entry.ws
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
      for (const entry of requesterConns) {
        const ws = entry.ws
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
      for (const entry of addresseeConns) {
        const ws = entry.ws
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
      for (const entry of requesterConns) {
        const ws = entry.ws
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
      for (const entry of addresseeConns) {
        const ws = entry.ws
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
      for (const entry of blockerConns) {
        const ws = entry.ws
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
      for (const entry of blockerConns) {
        const ws = entry.ws
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
      for (const entry of senderConns) {
        const ws = entry.ws
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
      for (const entry of receiverConns) {
        const ws = entry.ws
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
      for (const entry of senderConns) {
        const ws = entry.ws
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
      for (const entry of receiverConns) {
        const ws = entry.ws
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
      for (const entry of senderConns) {
        const ws = entry.ws
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
      for (const entry of receiverConns) {
        const ws = entry.ws
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
    let sessionId: number | undefined;
    try {
      const user = fastify.jwt.verify(token) as any;
      userId = user.userId;
      sessionId = typeof user.sessionId === 'number' ? user.sessionId : (user.sessionId ? Number(user.sessionId) : undefined);
    } catch (err) {
      socket.close(1008, 'Invalid token');
      return;
    }

    // Ensure we always register the same socket instance and a reverse mapping
    if (!connections.has(userId)) {
      connections.set(userId, new Set());
      // First connection, set status ONLINE
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { status: 'ONLINE' }
      }).catch(console.error);
      // Notify connected friends about presence change
      broadcastPresenceToFriends(userId, 'ONLINE').catch(() => {});
      fastify.log && fastify.log.info && fastify.log.info({ userId }, 'user presence: ONLINE (first connection)')
    }

    connections.get(userId)!.add({ ws: socket, sessionId });
    socketToUser.set(socket, userId);
    if (sessionId) socketToSession.set(socket, sessionId);

    const cleanupSocket = async (s: WebSocket) => {
      try {
        const ownerId = socketToUser.get(s);
        if (ownerId === undefined) {
          // If no owner mapping, attempt best-effort removal across all sets
          for (const [uid, setOfSockets] of connections.entries()) {
            const entry = Array.from(setOfSockets).find(e => e.ws === s);
            if (entry) {
              setOfSockets.delete(entry);
              socketToUser.delete(s as WebSocket);
              socketToSession.delete(s as WebSocket);
              if (setOfSockets.size === 0) {
                connections.delete(uid);
                await fastify.prisma.user.update({ where: { id: uid }, data: { status: 'OFFLINE' } }).catch(console.error);
                broadcastPresenceToFriends(uid, 'OFFLINE').catch(() => {});
                fastify.log && fastify.log.info && fastify.log.info({ uid }, 'user presence: OFFLINE (cleaned up)')
              }
              break;
            }
          }
          return;
        }

        const userConns = connections.get(ownerId);
        if (userConns) {
          const entry = Array.from(userConns).find(e => e.ws === s);
          if (entry) {
            userConns.delete(entry);
            socketToUser.delete(s as WebSocket);
            socketToSession.delete(s as WebSocket);
            if (userConns.size === 0) {
              connections.delete(ownerId);
              // Last connection, set status OFFLINE
              await fastify.prisma.user.update({ where: { id: ownerId }, data: { status: 'OFFLINE' } }).catch(console.error);
              // Notify connected friends about presence change
              broadcastPresenceToFriends(ownerId, 'OFFLINE').catch(() => {});
              fastify.log && fastify.log.info && fastify.log.info({ ownerId }, 'user presence: OFFLINE (last connection closed)')
            }
          }
        }
      } catch (err) {
        fastify.log && fastify.log.warn && fastify.log.warn({ err }, 'Error during socket cleanup')
      }
    };

    socket.on('close', async () => {
      await cleanupSocket(socket);
    });

    socket.on('error', async (err: unknown) => {
      fastify.log && fastify.log.warn && fastify.log.warn({ err }, 'WebSocket error for user')
      await cleanupSocket(socket);
    });
  });
}
