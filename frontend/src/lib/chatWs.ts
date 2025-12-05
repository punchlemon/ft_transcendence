import useAuthStore from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useNotificationStore } from '../stores/notificationStore';
import { baseURL } from './api';

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
  console.log('[ChatWS] Connecting to:', finalUrl);

  socket = new WebSocket(finalUrl);

  socket.onopen = () => {
    console.log('[ChatWS] ✅ Connected successfully');
  };

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      console.log('[ChatWS] 📨 Received message type:', payload.type, payload.data);
      
      if (payload.type === 'message') {
        console.log('[ChatWS] → Handling message in channel', payload.data.channelId);
        useChatStore.getState().addMessage(payload.data);
      } else if (payload.type === 'read') {
        console.log('[ChatWS] → Handling read receipt for channel', payload.data.channelId);
        useChatStore.getState().handleReadReceipt(payload.data);
      } else if (payload.type === 'channel_created') {
        console.log('[ChatWS] → Refreshing threads due to new channel');
        useChatStore.getState().fetchThreads();
      } else if (payload.type === 'notification') {
        console.log('[ChatWS] → Adding notification:', payload.data.type);
        useNotificationStore.getState().addNotification(payload.data);
      } else if (payload.type === 'notification_deleted') {
        console.log('[ChatWS] → Removing notification:', payload.data.id);
        useNotificationStore.getState().removeNotification(payload.data.id);
      } else if (payload.type === 'friend_update') {
        console.log('[ChatWS] → Broadcasting friend_update event:', payload.data);
        if (listeners['friend_update']) {
          listeners['friend_update'].forEach(cb => cb(payload.data));
        }
      } else if (payload.type === 'relationship_update') {
        console.log('[ChatWS] → Broadcasting relationship_update event:', payload.data);
        if (listeners['relationship_update']) {
          listeners['relationship_update'].forEach(cb => cb(payload.data));
        }
      } else if (payload.type === 'user_update') {
        console.log('[ChatWS] → Broadcasting user_update event:', payload.data);
        if (listeners['user_update']) {
          listeners['user_update'].forEach(cb => cb(payload.data));
        }
      } else if (payload.type === 'user_created') {
        console.log('[ChatWS] → Broadcasting user_created event:', payload.data);
        if (listeners['user_created']) {
          listeners['user_created'].forEach(cb => cb(payload.data));
        }
      } else if (payload.type === 'public_friend_update') {
        console.log('[ChatWS] → Broadcasting public_friend_update event:', payload.data);
        if (listeners['public_friend_update']) {
          listeners['public_friend_update'].forEach(cb => cb(payload.data));
        }
      } else {
        console.warn('[ChatWS] ⚠️ Unknown message type:', payload.type);
      }
    } catch (e) {
      console.error('[ChatWS] ❌ Failed to parse WS message', e);
    }
  };

  socket.onclose = (event) => {
    console.log('[ChatWS] ❌ Disconnected - Code:', event.code, 'Reason:', event.reason);
    socket = null;
    
    // Attempt reconnect unless explicitly disconnected or auth failed (1008)
    if (!isExplicitDisconnect && event.code !== 1008) {
      console.log('[ChatWS] ⏰ Attempting to reconnect in 3s...');
      reconnectTimer = setTimeout(() => {
        connectChatWs();
      }, 3000);
    } else {
      console.log('[ChatWS] 🛑 No reconnect (explicit:', isExplicitDisconnect, ', auth error:', event.code === 1008, ')');
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
