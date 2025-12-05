import { create } from 'zustand';
import { api } from '../lib/api';
import useAuthStore from './authStore';

export interface ChatUser {
  id: number;
  displayName: string;
  avatarUrl?: string;
  status: string;
  lastReadAt?: string;
}

export interface ChatMessage {
  id: number;
  channelId: number;
  userId: number;
  content: string;
  sentAt: string;
  user: ChatUser;
}

export interface ChatThread {
  id: number;
  name: string;
  type: 'DM' | 'PUBLIC' | 'PRIVATE' | 'PROTECTED';
  updatedAt: string;
  lastMessage?: ChatMessage;
  members: ChatUser[];
  unreadCount: number;
}

interface ChatState {
  threads: ChatThread[];
  activeThreadId: number | null;
  messages: Record<number, ChatMessage[]>; // channelId -> messages
  isLoading: boolean;
  initialLastReadAt: string | null;
  isDrawerOpen: boolean;
  
  setDrawerOpen: (isOpen: boolean) => void;
  fetchThreads: () => Promise<void>;
  selectThread: (threadId: number | null) => Promise<void>;
  createThread: (type: 'DM' | 'PUBLIC', targetIdOrName: string | number) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  markAsRead: (threadId: number) => Promise<void>;
  handleReadReceipt: (data: { channelId: number, userId: number, lastReadAt: string }) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  threads: [],
  activeThreadId: null,
  messages: {},
  isLoading: false,
  initialLastReadAt: null,
  isDrawerOpen: false,

  setDrawerOpen: (isOpen) => {
    set({ isDrawerOpen: isOpen });
    if (!isOpen) {
      get().selectThread(null);
    }
  },

  reset: () => {
    set({
      threads: [],
      activeThreadId: null,
      messages: {},
      isLoading: false,
      initialLastReadAt: null,
      isDrawerOpen: false,
    });
  },

  fetchThreads: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get('/chat/threads');
      // Support both axios response shapes and mocked shapes in tests
      // Some tests/mock return { data: threads } while axios returns { data: { data: threads } }
      const threads = (res.data && (res.data.data ?? res.data)) ?? []
      set({ threads });
    } finally {
      set({ isLoading: false });
    }
  },

  selectThread: async (threadId) => {
    set({ activeThreadId: threadId });
    if (!threadId) {
      set({ initialLastReadAt: null });
      return;
    }
    
    // Capture lastReadAt before marking as read
    const state = get();
    const thread = state.threads.find(t => t.id === threadId);
    const userId = useAuthStore.getState().user?.id;
    
    let lastReadAt = null;
    if (thread && userId) {
        const member = thread.members.find(m => m.id === userId);
        if (member && member.lastReadAt) {
            lastReadAt = member.lastReadAt;
        }
    }
    set({ initialLastReadAt: lastReadAt });
    
    // Mark as read
    get().markAsRead(threadId);

    // Fetch messages
    try {
        const res = await api.get(`/chat/threads/${threadId}/messages`);
        const messages = (res.data && (res.data.data ?? res.data)) ?? []
        set((state) => ({
        messages: {
          ...state.messages,
          [threadId]: messages,
        },
        }));
    } catch (error) {
        console.error("Failed to fetch messages", error);
    }
  },

  createThread: async (type, targetIdOrName) => {
    const payload = type === 'DM' 
      ? { type, targetUserId: targetIdOrName }
      : { type, name: targetIdOrName };
      
    const res = await api.post('/chat/threads', payload);
    const created = (res.data && (res.data.data ?? res.data)) ?? null
    const newThreadId = created?.id ?? null;
    await get().fetchThreads();
    await get().selectThread(newThreadId);
    set({ isDrawerOpen: true });
  },

  sendMessage: async (content) => {
    const { activeThreadId } = get();
    if (!activeThreadId) return;

    const res = await api.post(`/chat/threads/${activeThreadId}/messages`, { content });
    const created = (res.data && (res.data.data ?? res.data)) ?? null
    if (created) get().addMessage(created as ChatMessage);
  },

  markAsRead: async (threadId) => {
    // Optimistic update
    set((state) => ({
      threads: state.threads.map(t => 
        t.id === threadId ? { ...t, unreadCount: 0 } : t
      )
    }));

    try {
      await api.post(`/chat/threads/${threadId}/read`);
    } catch (error) {
      console.error("Failed to mark as read", error);
    }
  },

  addMessage: (message) => {
    set((state) => {
      const channelMessages = state.messages[message.channelId] || [];
      // Avoid duplicates
      if (channelMessages.find(m => m.id === message.id)) return state;
      
      const isUnread = state.activeThreadId !== message.channelId;

      return {
        messages: {
          ...state.messages,
          [message.channelId]: [...channelMessages, message], // Append (oldest first)
        },
        // Update last message in thread list
        threads: state.threads.map(t => 
          t.id === message.channelId 
            ? { 
                ...t, 
                lastMessage: message, 
                updatedAt: message.sentAt,
                unreadCount: isUnread ? (t.unreadCount || 0) + 1 : 0
              } 
            : t
        ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      };
    });

    // If we are in the thread, mark as read on server so it doesn't show as unread on refresh
    const { activeThreadId } = get();
    if (activeThreadId === message.channelId) {
        api.post(`/chat/threads/${message.channelId}/read`).catch(console.error);
    }
  },

  handleReadReceipt: (data) => {
    set((state) => ({
      threads: state.threads.map(t => {
        if (t.id !== data.channelId) return t;
        return {
          ...t,
          members: t.members.map(m => 
            m.id === data.userId 
              ? { ...m, lastReadAt: data.lastReadAt } 
              : m
          )
        };
      })
    }));
  },
  // Update a member's presence status across all threads
  updateMemberStatus: (userId: number, status: string) => {
    set((state) => ({
      threads: state.threads.map(t => ({
        ...t,
        members: t.members.map(m => m.id === userId ? { ...m, status } : m)
      }))
    }));
  },
}));
