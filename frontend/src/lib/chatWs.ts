import useAuthStore from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useNotificationStore } from '../stores/notificationStore';
import { baseURL } from './api';
import logger from './logger';

let socket: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let isExplicitDisconnect = false;

type ChatWsListener = (data: any) => void;
const listeners: Record<string, Set<ChatWsListener>> = {};

export const onChatWsEvent = (type: string, callback: ChatWsListener) => {
  if (!listeners[type]) listeners[type] = new Set();
  listeners[type].add(callback);
  return () => {
    listeners[type].delete(callback);
    if (listeners[type].size === 0) delete listeners[type];
  };
};

export const connectChatWs = () => {
  const token = useAuthStore.getState().accessToken;
  if (!token || socket) return;

  isExplicitDisconnect = false;

  // Determine WS URL
  let host = window.location.host;
  let protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

  if (baseURL) {
    if (baseURL.startsWith('http')) {
      const url = new URL(baseURL);
      host = url.host;
      protocol = url.protocol === 'https:' ? 'wss' : 'ws';
    }
  }

  const finalUrl = `${protocol}://${host}/api/ws/chat?token=${token}`;
  logger.debug('Connecting to Chat WS:', finalUrl);

  socket = new WebSocket(finalUrl);

  socket.onopen = () => {
    logger.info('Chat WS connected');
  };

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'message') {
        useChatStore.getState().addMessage(payload.data);
      } else if (payload.type === 'read') {
        useChatStore.getState().handleReadReceipt(payload.data);
      } else if (payload.type === 'channel_created') {
        useChatStore.getState().fetchThreads();
      } else if (payload.type === 'notification') {
        useNotificationStore.getState().addNotification(payload.data);
      } else if (payload.type === 'notification_deleted') {
        useNotificationStore.getState().removeNotification(payload.data.id);
      } else if (payload.type === 'friend_update') {
        if (listeners['friend_update']) {
          listeners['friend_update'].forEach(cb => cb(payload.data));
        }
      } else if (payload.type === 'relationship_update') {
        if (listeners['relationship_update']) {
          listeners['relationship_update'].forEach(cb => cb(payload.data));
        }
      } else if (payload.type === 'user_update') {
        if (listeners['user_update']) {
          listeners['user_update'].forEach(cb => cb(payload.data));
        }
      } else if (payload.type === 'session_expired') {
        if (listeners['session_expired']) {
          listeners['session_expired'].forEach(cb => cb(payload.data));
        }
      } else if (payload.type === 'match_history_update') {
        if (listeners['match_history_update']) {
          listeners['match_history_update'].forEach(cb => cb(payload.data));
        }
      } else if (payload.type === 'user_created') {
        if (listeners['user_created']) {
          listeners['user_created'].forEach(cb => cb(payload.data));
        }
      } else if (payload.type === 'public_friend_update') {
        if (listeners['public_friend_update']) {
          listeners['public_friend_update'].forEach(cb => cb(payload.data));
        }
      } else if (payload.type === 'TOURNAMENT_ROOM_JOINED' || payload.type === 'TOURNAMENT_ROOM_LEFT') {
        // payload.payload contains { roomId, userId }
        if (listeners[payload.type]) {
          listeners[payload.type].forEach(cb => cb(payload.payload));
        }
      } else if (payload.type === 'tournament_invite' || payload.type === 'TOURNAMENT_INVITE') {
        try {
          useNotificationStore.getState().addNotification(payload.data)
        } catch (e) {
          logger.error('Failed to process tournament invite WS payload', e)
        }
      }
    } catch (e) {
      logger.error('Failed to parse WS message', e);
    }
  };
  

  socket.onclose = (event) => {
    logger.info('Chat WS disconnected', event.code, event.reason);
    socket = null;
    
    // Check if server revoked the session
    if (event.code === 4000 || event.reason === 'session_revoked') {
      logger.info('Session revoked by server, clearing session and logging out');
      isExplicitDisconnect = true;
      useAuthStore.getState().clearSession();
      // Optionally navigate to login
      window.location.href = '/login';
      return;
    }
    
    // Attempt reconnect unless explicitly disconnected or auth failed (1008)
    if (!isExplicitDisconnect && event.code !== 1008) {
      logger.info('Attempting to reconnect in 3s...');
      reconnectTimer = setTimeout(() => {
        connectChatWs();
      }, 3000);
    }
  };
};

export const disconnectChatWs = () => {
  isExplicitDisconnect = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
};
