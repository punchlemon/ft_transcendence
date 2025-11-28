import { create } from 'zustand';
import { api } from '../lib/api';

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
  deleteNotification: (id: number) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get('/notifications');
      const rawList = res.data.data || [];
      
      const list = rawList.map((n: any) => ({
        ...n,
        read: !!n.readAt,
        data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data
      }));

      const unreadCount = list.filter((n: Notification) => !n.read).length;
      set({ notifications: list, unreadCount });
    } catch (error) {
      console.error('Failed to fetch notifications', error);
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
      console.error('Failed to mark notification as read', error);
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
      console.error('Failed to mark all notifications as read', error);
    }
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  deleteNotification: async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      set((state) => {
        const notifications = state.notifications.filter((n) => n.id !== id);
        const unreadCount = notifications.filter((n) => !n.read).length;
        return { notifications, unreadCount };
      });
    } catch (error) {
      console.error('Failed to delete notification', error);
    }
  },
}));
