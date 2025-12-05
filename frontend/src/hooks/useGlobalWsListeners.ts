import { useEffect } from 'react'
import { onChatWsEvent } from '../lib/chatWs'
import useAuthStore from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'

export const useGlobalWsListeners = () => {
  const { updateUser } = useAuthStore()
  const { fetchThreads, handleUserUpdate } = useChatStore()
  const currentUser = useAuthStore((state) => state.user)

  useEffect(() => {
    if (!currentUser) {
      console.log('[useGlobalWsListeners] ℹ️ No current user, skipping listener registration');
      return;
    }

    console.log('[useGlobalWsListeners] 🔗 Registering listeners for user', currentUser.id);

    // Listen for user updates (avatar, status, etc.)
    const unsubscribeUserUpdate = onChatWsEvent('user_update', (data) => {
      console.log('[useGlobalWsListeners] 👤 user_update event received:', data);
      handleUserUpdate(data);
      if (currentUser.id === data.id) {
        console.log('[useGlobalWsListeners] 📝 Updating current user snapshot');
        updateUser(data);
      }
    });

    // Listen for friend updates (new friend -> maybe new DM)
    const unsubscribeFriendUpdate = onChatWsEvent('friend_update', (data) => {
      console.log('[useGlobalWsListeners] 👥 friend_update event received:', data);
      // If we became friends, we might have a new DM channel
      if (data.status === 'FRIEND') {
        console.log('[useGlobalWsListeners] 🔄 New friend detected, refreshing threads');
        fetchThreads();
      }
    });

    return () => {
      console.log('[useGlobalWsListeners] 🧹 Cleaning up listeners for user', currentUser.id);
      unsubscribeUserUpdate();
      unsubscribeFriendUpdate();
    };
  }, [currentUser?.id, updateUser, fetchThreads, currentUser]);
};
