import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../../lib/api'
import useAuthStore from '../../stores/authStore'

type Message = {
  id: number
  channelId: number
  userId: number
  content: string
  sentAt: string
  user: {
    id: number
    displayName: string
    avatarUrl: string | null
  }
}

type Thread = {
  id: number
  name: string
  type: string
  updatedAt: string
  lastMessage: Message | null
  members: {
    id: number
    displayName: string
    status: string
    avatarUrl: string | null
  }[]
}

const ChatDrawer = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'dm' | 'system'>('dm')
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const { user } = useAuthStore()
  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<Message[]>([])

  const fetchThreads = useCallback(async () => {
    try {
      const res = await api.get<{ data: Thread[] }>('/chat/threads')
      setThreads(res.data.data)
    } catch (err) {
      console.error('Failed to fetch threads', err)
    }
  }, [])

  const fetchMessages = useCallback(async (threadId: number) => {
    try {
      const res = await api.get<{ data: Message[] }>(`/chat/threads/${threadId}/messages`)
      setMessages(res.data.data)
    } catch (err) {
      console.error('Failed to fetch messages', err)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(fetchThreads, 0)
      // Poll for threads every 10s
      const interval = setInterval(fetchThreads, 10000)
      return () => {
        clearTimeout(t)
        clearInterval(interval)
      }
    }
  }, [isOpen, fetchThreads])

  useEffect(() => {
    if (selectedThreadId) {
      const t = setTimeout(() => fetchMessages(selectedThreadId), 0)
      // Poll for messages every 3s
      const interval = setInterval(() => fetchMessages(selectedThreadId), 3000)
      return () => {
        clearTimeout(t)
        clearInterval(interval)
      }
    }
  }, [selectedThreadId, fetchMessages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isOpen && selectedThreadId) {
      scrollToBottom()
    }
  }, [isOpen, selectedThreadId, messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageInput.trim() || !selectedThreadId) return

    try {
      await api.post(`/chat/threads/${selectedThreadId}/messages`, {
        content: messageInput
      })
      setMessageInput('')
      fetchMessages(selectedThreadId)
      fetchThreads() // Update last message in list
    } catch (err) {
      console.error('Failed to send message', err)
    }
  }

  const toggleDrawer = () => setIsOpen(!isOpen)

  const getThreadStatus = (thread: Thread) => {
    if (thread.type === 'DM') {
      const other = thread.members.find(m => m.id !== user?.id)
      return other?.status === 'ONLINE' ? 'online' : 'offline'
    }
    return 'online' // Groups always online?
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
          {/* Unread count logic would go here */}
        </div>
        <button className="text-slate-300 hover:text-white">
          {isOpen ? '▼' : '▲'}
        </button>
      </div>

      {/* Content */}
      {isOpen && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedThreadId ? (
            // Chat Room View
            <>
              <div className="flex items-center border-b border-slate-100 px-4 py-2">
                <button 
                  onClick={() => setSelectedThreadId(null)}
                  className="mr-2 text-slate-400 hover:text-slate-600"
                >
                  ←
                </button>
                <span className="font-medium text-slate-900">
                  {threads.find(t => t.id === selectedThreadId)?.name}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-4">
                {messages.map((msg) => (
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
                  threads.length > 0 ? (
                    threads.map((thread) => (
                      <div
                        key={thread.id}
                        onClick={() => setSelectedThreadId(thread.id)}
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
