import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { connectChatWs, disconnectChatWs, onChatWsEvent } from '../../lib/chatWs'
import { inviteToGame, fetchBlockedUsers, api } from '../../lib/api'
import NotificationItem from './NotificationItem'
import UserAvatar from '../ui/UserAvatar'
import { MessageInput } from './MessageInput'
import PropTypes from 'prop-types'

// Cache and pending maps for invite availability checks.
// Once a sessionId is discovered to be unavailable, we store `false` and never allow join again.
const inviteAvailabilityCache: Map<string, boolean> = new Map()
const invitePending: Map<string, Promise<boolean>> = new Map()

const ChatDrawer = () => {
  const [activeTab, setActiveTab] = useState<'dm' | 'system'>('dm')
  const [showMenu, setShowMenu] = useState(false)
  const [blockedUsers, setBlockedUsers] = useState<number[]>([])
  const [blockedByUsers, setBlockedByUsers] = useState<number[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  
  const { user } = useAuthStore()
  const { 
    threads,
    activeThreadId, 
    messages, 
    fetchThreads, 
    selectThread, 
    sendMessage,
    initialLastReadAt,
    isDrawerOpen,
    setDrawerOpen,
    handleUserUpdate
  } = useChatStore()
  const { notifications, fetchNotifications, unreadCount } = useNotificationStore()

  // Ensure threads is always an array to avoid test/runtime errors when store is uninitialized
  const threadsArr = useMemo(() => threads ?? [], [threads])

  const totalUnreadMessages = useMemo(() => {
    return threadsArr.reduce((acc, t) => acc + (t.unreadCount || 0), 0);
  }, [threadsArr]);

  // Connect WS on mount if user is logged in
  useEffect(() => {
    if (user) {
      connectChatWs()
      fetchThreads()
      fetchNotifications()
      fetchBlockedUsers().then(res => {
        setBlockedUsers(res.data?.map(u => u.id) || [])
      }).catch(console.error)
    }
    return () => {
      disconnectChatWs()
    }
  }, [user, fetchThreads, fetchNotifications])

  useEffect(() => {
    const unsubscribeRelationship = onChatWsEvent('relationship_update', (data) => {
      if (data.status === 'BLOCKING') {
        setBlockedUsers(prev => {
          if (prev.includes(data.userId)) return prev
          return [...prev, data.userId]
        })
      } else if (data.status === 'BLOCKED_BY') {
        setBlockedByUsers(prev => {
          if (prev.includes(data.userId)) return prev
          return [...prev, data.userId]
        })
      } else if (data.status === 'NONE') {
        setBlockedUsers(prev => prev.filter(id => id !== data.userId))
        setBlockedByUsers(prev => prev.filter(id => id !== data.userId))
      }
    })

    const unsubscribeUserUpdate = onChatWsEvent('user_update', (data) => {
      handleUserUpdate(data)
      const currentUser = useAuthStore.getState().user
      if (currentUser && currentUser.id === data.id) {
        useAuthStore.getState().updateUser(data)
      }
    })

    return () => {
      unsubscribeRelationship()
      unsubscribeUserUpdate()
    }
  }, [handleUserUpdate])

  const activeMessages = useMemo(() => {
    return activeThreadId ? (messages?.[activeThreadId] || []) : []
  }, [activeThreadId, messages])

  // In-memory cache to avoid re-checking invite availability repeatedly.
  // Once a sessionId is known to be unavailable, we permanently treat it as unavailable.
  // Use module-level Maps so multiple renders/components share the cache during app lifetime.
  // Note: we intentionally only persist the 'unavailable' state here (false). If a session is
  // available we may still check again later; but once unavailable we never allow join.
  

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isDrawerOpen && activeThreadId) {
      scrollToBottom()
    }
  }, [isDrawerOpen, activeThreadId, activeMessages])

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || !activeThreadId) return

    try {
      await sendMessage(message)
    } catch (err: any) {
      console.error('Failed to send message', err)
      if (err.message?.includes('blocked')) {
        alert('Failed to send message: You are blocked or have blocked this user.')
      }
      throw err
    }
  }

  const toggleDrawer = () => setDrawerOpen(!isDrawerOpen)

  const activeThread = threadsArr.find(t => t.id === activeThreadId)
  const activeThreadOtherMember = activeThread?.type === 'DM' 
    ? activeThread.members.find((m: any) => m.id !== user?.id) 
    : null
  
  const isBlockedContext = useMemo(() => {
    if (!activeThread || activeThread.type !== 'DM') return false;
    const other = activeThread.members.find((m: any) => m.id !== user?.id);
    if (!other) return false;
    // Only disable if WE blocked THEM. If they blocked us, we shouldn't know (stealth).
    return blockedUsers.includes(other.id);
  }, [activeThread, blockedUsers, user]);

  useEffect(() => {
    // Auto-scroll when drawer opens or thread changes
  }, [isDrawerOpen, activeThreadId, isBlockedContext])

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const isMessageRead = (msg: any) => {
    if (!activeThread || !activeThread.members) return false
    // Filter out self
    const otherMembers = activeThread.members.filter((m: any) => m.id !== user?.id)
    if (otherMembers.length === 0) return false

    const msgTime = new Date(msg.sentAt).getTime()
    // Considered read if ALL other members have read it (or just one for DM)
    return otherMembers.every((m: any) => {
      if (!m.lastReadAt) return false
      return new Date(m.lastReadAt).getTime() >= msgTime
    })
  }

  const handleInvite = async () => {
    if (!activeThread || activeThread.type !== 'DM') return
    
    const otherMember = activeThread.members.find((m: any) => m.id !== user?.id)
    if (!otherMember) return

    try {
      const { sessionId } = await inviteToGame(otherMember.id)
      navigate(`/game/${sessionId}`)
      setDrawerOpen(false)
    } catch (err) {
      console.error('Failed to invite user', err)
    }
  }

  const InviteMessage: React.FC<{ parsed: any; senderId?: number; currentUserId?: number }> = ({ parsed, senderId, currentUserId }) => {
    // Initialize availability from cache synchronously to avoid flicker.
    const sessionId = parsed?.sessionId
    const cached = sessionId ? inviteAvailabilityCache.get(sessionId) : undefined
    const [available, setAvailable] = useState<boolean | null>(typeof cached === 'boolean' ? cached : null)
    const isSender = typeof senderId === 'number' && typeof currentUserId === 'number' && senderId === currentUserId

    useEffect(() => {
      let mounted = true
      if (!sessionId) {
        setAvailable(false)
        return () => { mounted = false }
      }

      // If a pending check exists, attach to its result so we update state
      if (invitePending.has(sessionId)) {
        invitePending.get(sessionId)!.then((av) => {
          if (mounted) setAvailable(av)
        }).catch(() => {
          if (mounted) setAvailable(false)
        })
      } else {
        // Only fetch from server if we don't already have a cached answer
        if (!inviteAvailabilityCache.has(sessionId)) {
          const p = (async () => {
            try {
              const res = await api.get(`/game/${encodeURIComponent(sessionId)}/status`)
              const data = res.data ?? res
              const av = Boolean(data.available)
              // Cache both available and unavailable states; unavailable is permanent per UX requirement
              inviteAvailabilityCache.set(sessionId, av)
              if (mounted) setAvailable(av)
              return av
            } catch (err) {
              inviteAvailabilityCache.set(sessionId, false)
              if (mounted) setAvailable(false)
              return false
            } finally {
              invitePending.delete(sessionId)
            }
          })()

          invitePending.set(sessionId, p)
        }
      }

      // Also listen for session_expired from chat WS and update availability
      const unsubscribeExpired = onChatWsEvent('session_expired', (data: any) => {
        try {
          if (!sessionId) return
          if (data?.sessionId === sessionId || data?.data?.sessionId === sessionId) {
            // Mark unavailable in cache and update local state
            inviteAvailabilityCache.set(sessionId, false)
            if (mounted) setAvailable(false)
          }
        } catch (e) {
          // ignore
        }
      })

      return () => {
        mounted = false
        unsubscribeExpired()
      }
    }, [sessionId])

    const disabled = available === false || isSender || available === null
    const title = isSender ? 'You cannot join an invite you sent' : (available === false ? 'This private room is no longer available' : (available === null ? 'Checking availability...' : undefined))

    return (
      <div className="flex items-center gap-2">
        <div className="text-sm mr-2">{parsed.label ?? 'Join Game'}</div>
        <button
          onClick={async () => {
            if (disabled) return
            // Re-check availability immediately before navigating to avoid
            // races where the inviteAvailabilityCache was stale (missed
            // session_expired events). This ensures the server final say
            // prevents joining an expired room.
            try {
              const res = await api.get(`/game/${encodeURIComponent(sessionId)}/status`)
              const data = res.data ?? res
              const freshAvailable = Boolean(data.available)
              // Update cache with latest result; if unavailable, block navigation
              inviteAvailabilityCache.set(sessionId!, freshAvailable)
              setAvailable(freshAvailable)
              if (freshAvailable) navigate(parsed.url)
            } catch (e) {
              inviteAvailabilityCache.set(sessionId!, false)
              setAvailable(false)
            }
          }}
          disabled={disabled}
          title={title}
          className={`rounded-md px-3 py-1 text-sm text-white ${disabled ? 'bg-slate-400 cursor-not-allowed opacity-70' : 'bg-amber-600 hover:bg-amber-700'}`}
        >
          {isSender ? 'You' : (available === null ? 'Checking...' : (available === false ? 'Unavailable' : 'Join'))}
        </button>
      </div>
    )
  }

  // Add propTypes to satisfy ESLint (CI lint enforces react/prop-types)
  // @ts-ignore
  InviteMessage.propTypes = {
    parsed: PropTypes.object.isRequired,
    senderId: PropTypes.number,
    currentUserId: PropTypes.number
  }

  const renderMessageContent = (msg: any) => {
    // Render structured invite messages (server stores them as type/metadata)
      try {
        const type = msg.type
        if (type && (type === 'INVITE' || (typeof type === 'string' && type.toUpperCase() === 'INVITE'))) {
          const parsed = msg.metadata ? JSON.parse(msg.metadata) : null
          if (parsed && parsed.url) {
            return <InviteMessage parsed={parsed} senderId={msg.userId} currentUserId={user?.id} />
          }
        }
      } catch (e) {
        // parsing failed — fall back to content
      }

      return msg.content
  }

  return (
    <div className={`fixed bottom-0 right-0 z-50 flex flex-col bg-white shadow-2xl transition-all duration-300 ease-in-out dark:bg-slate-800 ${
      isDrawerOpen ? 'h-[500px] w-full sm:w-96' : 'h-12 w-72'
    } rounded-t-xl border border-slate-200 dark:border-slate-700`}>
      
      {/* Header */}
      <div 
        className="flex cursor-pointer items-center justify-between bg-slate-900 px-4 py-3 text-white rounded-t-xl"
        onClick={toggleDrawer}
        data-testid="chat-header"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold">Chat</span>
          {(unreadCount > 0 || totalUnreadMessages > 0) && !isDrawerOpen && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold">
              {(unreadCount + totalUnreadMessages) > 9 ? '9+' : (unreadCount + totalUnreadMessages)}
            </span>
          )}
        </div>
        <button className="text-slate-300 hover:text-white">
          {isDrawerOpen ? '▼' : '▲'}
        </button>
      </div>

      {/* Content */}
      {isDrawerOpen && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 flex-shrink-0 dark:border-slate-700 dark:bg-slate-800">
            <button
              className={`flex-1 py-2 text-sm font-medium relative ${
                activeTab === 'dm'
                  ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
              onClick={() => setActiveTab('dm')}
            >
              Messages
              {totalUnreadMessages > 0 && (
                <span className="absolute top-1 right-4 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {totalUnreadMessages > 9 ? '9+' : totalUnreadMessages}
                </span>
              )}
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium relative ${
                activeTab === 'system'
                  ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
              onClick={() => setActiveTab('system')}
            >
              System
              {unreadCount > 0 && (
                <span className="absolute top-1 right-4 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeTab === 'dm' ? (
              activeThreadId ? (
                // Chat Room View
                <>
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 flex-shrink-0 dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center">
                      <button 
                        onClick={() => selectThread(null)}
                        className="mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        ←
                      </button>
                      {activeThread?.type === 'DM' && activeThreadOtherMember && (
                         <UserAvatar 
                           key={activeThreadOtherMember.avatarUrl}
                           user={{
                             id: activeThreadOtherMember.id,
                             displayName: activeThread.name,
                             avatarUrl: activeThreadOtherMember.avatarUrl,
                             status: activeThreadOtherMember.status || 'ONLINE',
                             login: activeThreadOtherMember.login
                           }}
                           size="sm"
                           className="mr-2"
                           linkToProfile={true}
                         />
                      )}
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {activeThread?.name}
                      </span>
                    </div>

                    {activeThread?.type === 'DM' && (
                      <div className="relative">
                        <button 
                          onClick={() => setShowMenu(!showMenu)}
                          className="text-slate-400 hover:text-slate-600 px-2"
                        >
                          ⋮
                        </button>
                        {showMenu && (
                          <div className="absolute right-0 top-full mt-1 w-48 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 z-50 dark:bg-slate-700">
                            <button
                              onClick={() => {
                                handleInvite()
                                setShowMenu(false)
                              }}
                              className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-600"
                            >
                              Invite to Game
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-900">
                    {activeMessages.map((msg, index) => {
                      const isMe = msg.userId === user?.id;
                      const isSameUser = index > 0 && activeMessages[index - 1].userId === msg.userId;
                      const showDisplayName = !isMe && !isSameUser && activeThread?.type !== 'DM';

                      let showUnreadDivider = false;
                      if (initialLastReadAt && !isMe) {
                        const msgTime = new Date(msg.sentAt).getTime();
                        const readTime = new Date(initialLastReadAt).getTime();
                        
                        if (msgTime > readTime) {
                            if (index === 0) {
                                showUnreadDivider = true;
                            } else {
                                const prevMsg = activeMessages[index - 1];
                                const prevMsgTime = new Date(prevMsg.sentAt).getTime();
                                if (prevMsgTime <= readTime) {
                                    showUnreadDivider = true;
                                }
                            }
                        }
                      }

                      return (
                        <div key={msg.id}>
                          {showUnreadDivider && (
                            <div className="flex items-center my-4">
                                <div className="flex-grow border-t border-red-300"></div>
                                <span className="flex-shrink-0 mx-4 text-xs font-bold text-red-500">Unread Messages</span>
                                <div className="flex-grow border-t border-red-300"></div>
                            </div>
                          )}
                          <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2 ${isSameUser ? 'mt-1' : 'mt-4'}`}>
                            {isMe ? (
                              <>
                                <div className="flex flex-col items-end text-[10px] text-slate-500 mb-1">
                                  {isMessageRead(msg) && <span className="font-bold text-indigo-600">Read</span>}
                                  <span>{formatTime(msg.sentAt)}</span>
                                </div>
                                <div className="max-w-[70%] rounded-lg px-3 py-2 text-sm bg-indigo-600 text-white rounded-br-none">
                                  {renderMessageContent(msg)}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="max-w-[70%] rounded-lg px-3 py-2 text-sm bg-white border border-slate-200 text-slate-800 rounded-bl-none dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100">
                                  {showDisplayName && (
                                    <div className="mb-1 text-xs font-bold opacity-75">{msg.user.displayName}</div>
                                  )}
                                  {renderMessageContent(msg)}
                                </div>
                                <span className="text-[10px] text-slate-500 mb-1 dark:text-slate-400">{formatTime(msg.sentAt)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="border-t border-slate-200 p-3 flex-shrink-0 dark:border-slate-700 dark:bg-slate-800">
                    <MessageInput
                      onSend={handleSendMessage}
                      placeholder={isBlockedContext ? "You cannot send messages to this user" : "Type a message..."}
                      disabled={isBlockedContext}
                      autoFocus={true}
                    />
                  </div>
                </>
              ) : (
                // Thread List View
                <div className="flex-1 overflow-y-auto dark:bg-slate-900">
                  {threadsArr.length > 0 ? (
                    threadsArr.map((thread) => {
                      const otherMember = thread.type === 'DM' ? thread.members.find((m: any) => m.id !== user?.id) : null
                      return (
                        <div
                          key={thread.id}
                          onClick={() => selectThread(thread.id)}
                          className="flex cursor-pointer items-center gap-3 border-b border-slate-50 p-3 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
                        >
                          <UserAvatar 
                            key={otherMember?.avatarUrl}
                            user={{
                              id: otherMember?.id,
                              displayName: thread.name,
                              avatarUrl: otherMember?.avatarUrl,
                              status: otherMember?.status || 'ONLINE',
                              login: otherMember?.login
                            }}
                            size="md"
                            linkToProfile={true}
                          />
                          <div className="flex-1 overflow-hidden">
                            <div className="flex justify-between items-center">
                              <span className="font-medium text-slate-900 dark:text-slate-100">{thread.name}</span>
                              {thread.unreadCount > 0 && (
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                                      {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
                                  </span>
                              )}
                            </div>
                            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {thread.lastMessage?.content || 'No messages yet'}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                      No conversations yet
                    </div>
                  )}
                </div>
              )
            ) : (
              // System Notifications
              <div className="flex-1 overflow-y-auto dark:bg-slate-900">
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                      No system notifications
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatDrawer
