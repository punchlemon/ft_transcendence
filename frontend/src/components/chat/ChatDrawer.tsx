import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { connectChatWs, disconnectChatWs } from '../../lib/chatWs'
import { inviteToGame } from '../../lib/api'

const ChatDrawer = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'dm' | 'system'>('dm')
  const [messageInput, setMessageInput] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  
  const { user } = useAuthStore()
  const { 
    threads,
    activeThreadId, 
    messages, 
    fetchThreads, 
    selectThread, 
    sendMessage 
  } = useChatStore()

  // Ensure threads is always an array to avoid test/runtime errors when store is uninitialized
  const threadsArr = threads ?? []

  // Connect WS on mount if user is logged in
  useEffect(() => {
    if (user) {
      connectChatWs()
      fetchThreads()
    }
    return () => {
      disconnectChatWs()
    }
  }, [user, fetchThreads])

  const activeMessages = useMemo(() => {
    return activeThreadId ? (messages?.[activeThreadId] || []) : []
  }, [activeThreadId, messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isOpen && activeThreadId) {
      scrollToBottom()
    }
  }, [isOpen, activeThreadId, activeMessages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageInput.trim() || !activeThreadId) return

    try {
      await sendMessage(messageInput)
      setMessageInput('')
    } catch (err) {
      console.error('Failed to send message', err)
    }
  }

  const toggleDrawer = () => setIsOpen(!isOpen)

  const getThreadStatus = (thread: any) => {
    if (thread.type === 'DM') {
      const other = thread.members.find((m: any) => m.id !== user?.id)
      return other?.status === 'ONLINE' ? 'online' : 'offline'
    }
    return 'online'
  }

  const activeThread = threadsArr.find(t => t.id === activeThreadId)

  const handleInvite = async () => {
    if (!activeThread || activeThread.type !== 'DM') return
    
    const otherMember = activeThread.members.find((m: any) => m.id !== user?.id)
    if (!otherMember) return

    try {
      const { sessionId } = await inviteToGame(otherMember.id)
      navigate(`/game/${sessionId}`)
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to invite user', err)
    }
  }

  return (
    <div className={`fixed bottom-0 right-0 z-50 flex flex-col bg-white shadow-2xl transition-all duration-300 ease-in-out ${
      isOpen ? 'h-[500px] w-full sm:w-96' : 'h-12 w-72'
    } rounded-t-xl border border-slate-200`}>
      
      {/* Header */}
      <div 
        className="flex cursor-pointer items-center justify-between bg-slate-900 px-4 py-3 text-white rounded-t-xl"
        onClick={toggleDrawer}
        data-testid="chat-header"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold">Chat</span>
        </div>
        <button className="text-slate-300 hover:text-white">
          {isOpen ? '▼' : '▲'}
        </button>
      </div>

      {/* Content */}
      {isOpen && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {activeThreadId ? (
            // Chat Room View
            <>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <div className="flex items-center">
                  <button 
                    onClick={() => selectThread(null)}
                    className="mr-2 text-slate-400 hover:text-slate-600"
                  >
                    ←
                  </button>
                  <span className="font-medium text-slate-900">
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
                      <div className="absolute right-0 top-full mt-1 w-48 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                        <button
                          onClick={() => {
                            handleInvite()
                            setShowMenu(false)
                          }}
                          className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        >
                          Invite to Game
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-4">
                {activeMessages.slice().reverse().map((msg) => (
                  <div key={msg.id} className={`flex ${msg.userId === user?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.userId === user?.id 
                        ? 'bg-indigo-600 text-white rounded-br-none' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                    }`}>
                      {msg.userId !== user?.id && (
                        <div className="mb-1 text-xs font-bold opacity-75">{msg.user.displayName}</div>
                      )}
                      {msg.content}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="border-t border-slate-200 p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <button 
                    type="submit"
                    disabled={!messageInput.trim()}
                    className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </form>
            </>
          ) : (
            // Thread List View
            <>
              <div className="flex border-b border-slate-200">
                <button
                  className={`flex-1 py-2 text-sm font-medium ${activeTab === 'dm' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  onClick={() => setActiveTab('dm')}
                >
                  Messages
                </button>
                <button
                  className={`flex-1 py-2 text-sm font-medium ${activeTab === 'system' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  onClick={() => setActiveTab('system')}
                >
                  System
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {activeTab === 'dm' ? (
                  threadsArr.length > 0 ? (
                    threadsArr.map((thread) => (
                      <div
                        key={thread.id}
                        onClick={() => selectThread(thread.id)}
                        className="flex cursor-pointer items-center gap-3 border-b border-slate-50 p-3 hover:bg-slate-50"
                      >
                        <div className="relative">
                          <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                            {thread.name[0]}
                          </div>
                          <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${
                            getThreadStatus(thread) === 'online' ? 'bg-green-500' : 'bg-slate-400'
                          }`} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="flex justify-between">
                            <span className="font-medium text-slate-900">{thread.name}</span>
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {thread.lastMessage?.content || 'No messages yet'}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-slate-500">
                      No conversations yet
                    </div>
                  )
                ) : (
                  <div className="p-4 text-center text-sm text-slate-500">
                    No system notifications
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default ChatDrawer
