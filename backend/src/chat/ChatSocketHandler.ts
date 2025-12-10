import { FastifyInstance } from 'fastify';
import { chatService } from '../services/chat';
import { notificationService } from '../services/notification';
import { friendService } from '../services/friend';
import { userService } from '../services/user';
import { presenceService } from '../services/presence';
import { WebSocket } from 'ws';
import { sendToSockets } from './socketUtils';
import connectionIndex, { SocketWithSessionId } from './connectionIndex';
import { ChatMessagePayload } from '../types/protocol';
import { enqueueUserStatusUpdate } from '../utils/prismaQueue';

type UserSummary = {
  id: number;
  displayName?: string | null;
  login?: string;
  status?: string;
  avatarUrl?: string | null;
};

export default class ChatSocketHandler {
  fastify: FastifyInstance;
  // No longer expose `connections`/`sessionSockets` maps directly —
  // use `connectionIndex` module instead. Compatibility accessors
  // previously existed here and have been removed.

  // bound handlers so we can remove them on close
  private onStatusChange = (event: { userId: number; status: string }) => this.broadcastStatusChange(event.userId, event.status);
  private onUserCreated = (user: unknown) => this.broadcastUserCreated(user as any);
  private onUserUpdated = (user: unknown) => this.broadcastUserUpdated(user as any);
  private onMatchHistory = (event: { userId?: number; match?: unknown }) => this.handleMatchHistory(event as any);
  private onChatMessage = async (message: ChatMessagePayload) => this.handleChatMessage(message as any);
  private onChatRead = async (event: { channelId?: string } & Record<string, any>) => this.handleChatRead(event as any);
  private onChannelCreated = (channel: { id?: string; members?: Array<{ userId: number }> } & Record<string, any>) => this.handleChannelCreated(channel as any);
  private onNotification = (notification: { userId: number; [k: string]: any }) => this.handleNotification(notification);
  private onNotificationDeleted = (event: { userId: number; id: number }) => this.handleNotificationDeleted(event);

  private onFriendAccepted = async (event: { requesterId: number; addresseeId: number }) => this.handleFriendAccepted(event);
  private onFriendRemoved = (event: { requesterId: number; addresseeId: number }) => this.handleFriendRemoved(event);
  private onUserBlocked = (event: { blockerId: number; blockedId: number }) => this.handleUserBlocked(event);
  private onUserUnblocked = (event: { blockerId: number; blockedId: number }) => this.handleUserUnblocked(event);
  private onFriendRequestSent = (event: { senderId: number; receiverId: number; requestId?: number }) => this.handleFriendRequestSent(event);
  private onFriendRequestCancelled = (event: { senderId: number; receiverId: number }) => this.handleFriendRequestCancelled(event);
  private onFriendRequestDeclined = (event: { senderId: number; receiverId: number }) => this.handleFriendRequestDeclined(event);

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;

    userService.on('status_change', this.onStatusChange);
    userService.on('user_created', this.onUserCreated);
    userService.on('user_updated', this.onUserUpdated);

    notificationService.on('match_history', this.onMatchHistory);
    notificationService.on('match_history_public', this.onMatchHistory);

    chatService.on('message', this.onChatMessage);
    chatService.on('read', this.onChatRead);
    chatService.on('channel_created', this.onChannelCreated);
    notificationService.on('notification', this.onNotification);
    notificationService.on('notification_deleted', this.onNotificationDeleted);

    friendService.on('friend_accepted', this.onFriendAccepted);
    friendService.on('friend_removed', this.onFriendRemoved);
    friendService.on('user_blocked', this.onUserBlocked);
    friendService.on('user_unblocked', this.onUserUnblocked);
    friendService.on('friend_request_sent', this.onFriendRequestSent);
    friendService.on('friend_request_cancelled', this.onFriendRequestCancelled);
    friendService.on('friend_request_declined', this.onFriendRequestDeclined);

    // Register presence hooks so other services can close sockets by session
    // and query connection counts. These mirror the previous behavior
    // that existed in the inline `chatWs.ts` implementation.
    presenceService.setCloseSocketsBySession(async (sessionId: number) => {
      return connectionIndex.closeSocketsBySession(sessionId)
    });

    presenceService.setGetConnectionCount(async (userId: number) => {
      return connectionIndex.getConnectionCount(userId)
    });

    fastify.addHook('onClose', (instance, done) => {
      userService.off('status_change', this.onStatusChange);
      userService.off('user_created', this.onUserCreated);
      userService.off('user_updated', this.onUserUpdated);

      notificationService.off('match_history', this.onMatchHistory);
      notificationService.off('match_history_public', this.onMatchHistory);

      chatService.off('message', this.onChatMessage);
      chatService.off('read', this.onChatRead);
      chatService.off('channel_created', this.onChannelCreated);
      notificationService.off('notification', this.onNotification);
      notificationService.off('notification_deleted', this.onNotificationDeleted);

      friendService.off('friend_accepted', this.onFriendAccepted);
      friendService.off('friend_removed', this.onFriendRemoved);
      friendService.off('user_blocked', this.onUserBlocked);
      friendService.off('user_unblocked', this.onUserUnblocked);
      friendService.off('friend_request_sent', this.onFriendRequestSent);
      friendService.off('friend_request_cancelled', this.onFriendRequestCancelled);
      friendService.off('friend_request_declined', this.onFriendRequestDeclined);

      // Reset presence hooks to safe defaults to avoid leaving stale
      // closures referencing this instance after shutdown.
      presenceService.setCloseSocketsBySession(async () => 0);
      presenceService.setGetConnectionCount(async () => 0);

      done();
    });
  }

  private broadcastStatusChange(userId: number, status: string) {
    const payload = JSON.stringify({ type: 'user_update', data: { id: userId, status } });
    for (const userSockets of connectionIndex.getAllUserSockets()) {
      sendToSockets(userSockets, payload)
    }
  }

  private broadcastUserCreated(user: UserSummary) {
    const payload = JSON.stringify({ type: 'user_created', data: user });
    for (const userSockets of connectionIndex.getAllUserSockets()) {
      sendToSockets(userSockets, payload)
    }
  }

  private broadcastUserUpdated(user: UserSummary) {
    const payload = JSON.stringify({ type: 'user_update', data: user });
    for (const userSockets of connectionIndex.getAllUserSockets()) {
      sendToSockets(userSockets, payload)
    }
  }

  private async handleChatMessage(message: ChatMessagePayload | { channelId?: string } & Record<string, any>) {
    const channelId = (message as any).channelId ?? (message as any).roomId;
    const members = await this.fastify.prisma.channelMember.findMany({
      where: { channelId: channelId ? Number(channelId) : undefined },
      select: { userId: true }
    });
    const payload = JSON.stringify({ type: 'message', data: message });
    for (const member of members) {
      const userConns = connectionIndex.getSocketsByUser(member.userId);
      if (userConns) for (const ws of userConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  private async handleChatRead(event: { channelId?: string } & Record<string, any>) {
    const channelId = event.channelId;
    const members = await this.fastify.prisma.channelMember.findMany({
      where: { channelId: channelId ? Number(channelId) : undefined },
      select: { userId: true }
    });
    const payload = JSON.stringify({ type: 'read', data: event });
    for (const member of members) {
      const userConns = connectionIndex.getSocketsByUser(member.userId);
      if (userConns) for (const ws of userConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  private handleChannelCreated(channel: { id?: string; members?: Array<{ userId: number }> } & Record<string, any>) {
    const payload = JSON.stringify({ type: 'channel_created', data: { id: channel.id } });
    if (channel.members) {
      for (const member of channel.members) {
        const userConns = connectionIndex.getSocketsByUser(member.userId);
        if (userConns) for (const ws of userConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  }

  private handleNotification(notification: { userId: number } & Record<string, any>) {
    const userConns = connectionIndex.getSocketsByUser(notification.userId);
    if (userConns) {
      const payload = JSON.stringify({ type: 'notification', data: notification });
      sendToSockets(userConns, payload)
    }
  }

  private handleNotificationDeleted(event: { userId: number; id: number }) {
    const userConns = connectionIndex.getSocketsByUser(event.userId);
    if (userConns) {
      const payload = JSON.stringify({ type: 'notification_deleted', data: { id: event.id } });
      sendToSockets(userConns, payload)
    }
  }

  private handleMatchHistory(event: { userId?: number; match?: unknown } & Record<string, any>) {
    const payload = JSON.stringify({ type: 'match_history_update', data: event.match });
    if (typeof event.userId === 'number') {
      const userConns = connectionIndex.getSocketsByUser(event.userId);
      if (userConns) sendToSockets(userConns, payload)
      return;
    }
    for (const userSockets of connectionIndex.getAllUserSockets()) sendToSockets(userSockets, payload)
  }

  private async handleFriendAccepted(event: { requesterId: number; addresseeId: number }) {
    const { requesterId, addresseeId } = event;
    const requesterConns = connectionIndex.getSocketsByUser(requesterId);
    if (requesterConns) {
      const payload = JSON.stringify({ type: 'friend_update', data: { friendId: addresseeId, status: 'FRIEND' } });
      for (const ws of requesterConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
    const addresseeConns = connectionIndex.getSocketsByUser(addresseeId);
    if (addresseeConns) {
      const payload = JSON.stringify({ type: 'friend_update', data: { friendId: requesterId, status: 'FRIEND' } });
      for (const ws of addresseeConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }

    const requester = await this.fastify.prisma.user.findUnique({ where: { id: requesterId } });
    const addressee = await this.fastify.prisma.user.findUnique({ where: { id: addresseeId } });
    if (requester && addressee) {
      this.broadcastPublicFriendUpdate({ userId: requesterId, type: 'ADD', friend: { id: addressee.id, displayName: addressee.displayName, login: addressee.login, status: addressee.status, avatarUrl: addressee.avatarUrl }});
      this.broadcastPublicFriendUpdate({ userId: addresseeId, type: 'ADD', friend: { id: requester.id, displayName: requester.displayName, login: requester.login, status: requester.status, avatarUrl: requester.avatarUrl }});
    }
  }

  private handleFriendRemoved(event: { requesterId: number; addresseeId: number }) {
    const { requesterId, addresseeId } = event;
    const requesterConns = connectionIndex.getSocketsByUser(requesterId);
    if (requesterConns) {
      const payload = JSON.stringify({ type: 'friend_update', data: { friendId: addresseeId, status: 'NONE' } });
      for (const ws of requesterConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
    const addresseeConns = connectionIndex.getSocketsByUser(addresseeId);
    if (addresseeConns) {
      const payload = JSON.stringify({ type: 'friend_update', data: { friendId: requesterId, status: 'NONE' } });
      for (const ws of addresseeConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
    this.broadcastPublicFriendUpdate({ userId: requesterId, type: 'REMOVE', friendId: addresseeId });
    this.broadcastPublicFriendUpdate({ userId: addresseeId, type: 'REMOVE', friendId: requesterId });
  }

  private handleUserBlocked(event: { blockerId: number; blockedId: number }) {
    const { blockerId, blockedId } = event;
    const blockerConns = connectionIndex.getSocketsByUser(blockerId);
    if (blockerConns) {
      const payload = JSON.stringify({ type: 'relationship_update', data: { userId: blockedId, status: 'BLOCKING' } });
      for (const ws of blockerConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  private handleUserUnblocked(event: { blockerId: number; blockedId: number }) {
    const { blockerId, blockedId } = event;
    const blockerConns = connectionIndex.getSocketsByUser(blockerId);
    if (blockerConns) {
      const payload = JSON.stringify({ type: 'relationship_update', data: { userId: blockedId, status: 'NONE' } });
      for (const ws of blockerConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  private handleFriendRequestSent(event: { senderId: number; receiverId: number; requestId?: number }) {
    const { senderId, receiverId, requestId } = event;
    const senderConns = connectionIndex.getSocketsByUser(senderId);
    if (senderConns) {
      const payload = JSON.stringify({ type: 'friend_update', data: { friendId: receiverId, status: 'PENDING_SENT', requestId } });
      for (const ws of senderConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
    const receiverConns = connectionIndex.getSocketsByUser(receiverId);
    if (receiverConns) {
      const payload = JSON.stringify({ type: 'friend_update', data: { friendId: senderId, status: 'PENDING_RECEIVED', requestId } });
      for (const ws of receiverConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  private handleFriendRequestCancelled(event: { senderId: number; receiverId: number }) {
    const { senderId, receiverId } = event;
    const senderConns = connectionIndex.getSocketsByUser(senderId);
    if (senderConns) {
      const payload = JSON.stringify({ type: 'friend_update', data: { friendId: receiverId, status: 'NONE' } });
      for (const ws of senderConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
    const receiverConns = connectionIndex.getSocketsByUser(receiverId);
    if (receiverConns) {
      const payload = JSON.stringify({ type: 'friend_update', data: { friendId: senderId, status: 'NONE' } });
      for (const ws of receiverConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  private handleFriendRequestDeclined(event: { senderId: number; receiverId: number }) {
    const { senderId, receiverId } = event;
    const senderConns = connectionIndex.getSocketsByUser(senderId);
    if (senderConns) {
      const payload = JSON.stringify({ type: 'friend_update', data: { friendId: receiverId, status: 'NONE' } });
      for (const ws of senderConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
    const receiverConns = connectionIndex.getSocketsByUser(receiverId);
    if (receiverConns) {
      const payload = JSON.stringify({ type: 'friend_update', data: { friendId: senderId, status: 'NONE' } });
      for (const ws of receiverConns) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  private broadcastPublicFriendUpdate(data: { userId: number; type: 'ADD' | 'REMOVE'; friend?: UserSummary; friendId?: number } & Record<string, any>) {
    const payload = JSON.stringify({ type: 'public_friend_update', data });
    for (const userSockets of connectionIndex.getAllUserSockets()) sendToSockets(userSockets, payload)
  }

  async handle(connection: any, req: any) {
    if (!connection) {
      req.log && req.log.warn && req.log.warn({ headers: req.headers }, 'WebSocket handler invoked without a connection');
      return;
    }

    let socket: SocketWithSessionId | undefined;
    if (connection && typeof connection === 'object' && 'socket' in connection) {
      // connection is the wrapper object
      socket = (connection as any).socket as SocketWithSessionId;
    } else {
      socket = connection as SocketWithSessionId;
    }
    if (!socket) {
      req.log && req.log.warn && req.log.warn({ headers: req.headers }, 'WebSocket handler invoked without a socket (connection object present)');
      return;
    }

    const token = req.query && req.query.token;
    if (!token) {
      socket.close(1008, 'Token required');
      return;
    }

    let userId: number;
    let sessionId: number;
    try {
      const user = this.fastify.jwt.verify(token) as { userId: number; sessionId: number };
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

    (socket as SocketWithSessionId).__sessionId = sessionId;
    // Use the facade to register sockets so SocketManager and connectionIndex stay in sync
    try {
      // lazy import to avoid cycles
      const { registerSocket } = await import('../lib/socketFacade');
      registerSocket(socket as SocketWithSessionId, { userId, sessionId });
    } catch (_) {
      // fallback to direct registration if dynamic import fails
      connectionIndex.addSocket(userId, sessionId, socket as SocketWithSessionId);
    }
    if (connectionIndex.getConnectionCount(userId) === 1) {
      try { enqueueUserStatusUpdate(userId, { status: 'ONLINE' }) } catch (e) { this.fastify.log.error(e as Error) }
      this.broadcastStatusChange(userId, 'ONLINE');
    }

    socket.on('close', async () => {
      try {
        const { unregisterSocket } = await import('../lib/socketFacade');
        unregisterSocket(socket as SocketWithSessionId, { userId, sessionId });
      } catch (_) {
        connectionIndex.removeSocket(userId, sessionId, socket as SocketWithSessionId);
      }
      if (connectionIndex.getConnectionCount(userId) === 0) {
        try { enqueueUserStatusUpdate(userId, { status: 'OFFLINE' }) } catch (e) { this.fastify.log.error(e as Error) }
        this.broadcastStatusChange(userId, 'OFFLINE');
      }
    });
  }
}
