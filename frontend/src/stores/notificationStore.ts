import { create } from 'zustand';
import { api } from '../lib/api';
import logger from '../lib/logger';

export interface Notification {
  id: number;
  type: 'FRIEND_REQUEST' | 'FRIEND_RESPONSE' | 'MATCH_INVITE' | 'TOURNAMENT_INVITE' | 'CHAT_MENTION' | 'SYSTEM';
  message: string;
  read: boolean;
  createdAt: string;
  data?: any; // JSON data for specific actions (e.g., friendRequestId, gameId)
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;

  fetchNotifications: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: number) => void;
  deleteNotification: (id: number) => Promise<void>;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  reset: () => {
    set({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
    });
  },

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get('/notifications');
      const rawList = res.data.data || [];
      
      const list = rawList.map((n: any) => ({
        ...n,
        message: n.body || n.title,
        read: !!n.readAt,
        data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data
      }));

      const unreadCount = list.filter((n: Notification) => !n.read).length;
      set({ notifications: list, unreadCount });
    } catch (error) {
      logger.error('Failed to fetch notifications', error);
    } finally {
      set({ isLoading: false });
    }
  },

  markAsRead: async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      set((state) => {
        const notifications = state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        );
        const unreadCount = notifications.filter((n) => !n.read).length;
        return { notifications, unreadCount };
      });
    } catch (error) {
      logger.error('Failed to mark notification as read', error);
    }
  },

  markAllAsRead: async () => {
    try {
      await api.patch('/notifications/read-all');
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (error) {
      logger.error('Failed to mark all notifications as read', error);
    }
  },

  addNotification: (notification) => {
    const n = notification as any;
    const processed: Notification = {
      id: n.id,
      type: n.type,
      createdAt: n.createdAt,
      message: n.body || n.title || n.message,
      read: !!n.readAt || !!n.read,
      data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data
    };
    set((state) => {
      const exists = state.notifications.some((item) => item.id === processed.id);
      if (exists) {
        return {
          notifications: state.notifications.map((item) =>
            item.id === processed.id ? processed : item
          ),
        };
      }
      return {
        notifications: [processed, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      };
    });
  },

  removeNotification: (id) => {
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      const unreadCount = notifications.filter((n) => !n.read).length;
      return { notifications, unreadCount };
    });
  },

  deleteNotification: async (id) => {
    // Optimistic update
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      const unreadCount = notifications.filter((n) => !n.read).length;
      return { notifications, unreadCount };
    });

    try {
      await api.delete(`/notifications/${id}`);
    } catch (error) {
      logger.error('Failed to delete notification', error);
    }
  },
}));
