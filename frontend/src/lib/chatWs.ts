import useAuthStore from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useNotificationStore } from '../stores/notificationStore';
import { baseURL } from './api';

let socket: WebSocket | null = null;

export const connectChatWs = () => {
  const token = useAuthStore.getState().accessToken;
  if (!token || socket) return;

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
  console.log('Connecting to Chat WS:', finalUrl);

  socket = new WebSocket(finalUrl);

  socket.onopen = () => {
    console.log('Chat WS connected');
  };

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'message') {
        useChatStore.getState().addMessage(payload.data);
      } else if (payload.type === 'notification') {
        useNotificationStore.getState().addNotification(payload.data);
      }
    } catch (e) {
      console.error('Failed to parse WS message', e);
    }
  };

  socket.onclose = () => {
    console.log('Chat WS disconnected');
    socket = null;
  };
};

export const disconnectChatWs = () => {
  if (socket) {
    socket.close();
    socket = null;
  }
};
