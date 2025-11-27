import { useState, useEffect, useRef } from 'react'

type Message = {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: Date
  type: 'text' | 'system' | 'invite'
}

type Thread = {
  id: string
  name: string
  unreadCount: number
  lastMessage?: string
  status: 'online' | 'offline'
}

const ChatDrawer = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'dm' | 'system'>('dm')
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Mock Data
  const [threads, setThreads] = useState<Thread[]>([
    { id: 't1', name: 'Alice', unreadCount: 2, lastMessage: 'Ready for a match?', status: 'online' },
    { id: 't2', name: 'Bob', unreadCount: 0, lastMessage: 'GG!', status: 'offline' },
  ])

  const [messages, setMessages] = useState<Message[]>(() => [
    { id: 'm1', senderId: 'other', senderName: 'Alice', content: 'Hi there!', timestamp: new Date(Date.now() - 3600000), type: 'text' },
    { id: 'm2', senderId: 'me', senderName: 'Me', content: 'Hello!', timestamp: new Date(Date.now() - 3500000), type: 'text' },
    { id: 'm3', senderId: 'other', senderName: 'Alice', content: 'Ready for a match?', timestamp: new Date(Date.now() - 60000), type: 'text' },
    { id: 'm4', senderId: 'system', senderName: 'System', content: 'Alice invited you to play Pong', timestamp: new Date(Date.now() - 50000), type: 'invite' },
  ])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isOpen && selectedThreadId) {
      scrollToBottom()
    }
  }, [isOpen, selectedThreadId, messages])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageInput.trim()) return

    const newMessage: Message = {
      id: `m${Date.now()}`,
      senderId: 'me',
      senderName: 'Me',
      content: messageInput,
      timestamp: new Date(),
      type: 'text',
    }

    setMessages([...messages, newMessage])
    setMessageInput('')
  }

  const toggleDrawer = () => setIsOpen(!isOpen)

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
          {threads.reduce((acc, t) => acc + t.unreadCount, 0) > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold">
              {threads.reduce((acc, t) => acc + t.unreadCount, 0)}
            </span>
          )}
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
                  <div key={msg.id} className={`flex ${msg.type === 'system' ? 'justify-center' : msg.senderId === 'me' ? 'justify-end' : 'justify-start'}`}>
                    {msg.type === 'system' ? (
                      <div className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-600">
                        {msg.content}
                      </div>
                    ) : msg.type === 'invite' ? (
                      <div className="w-64 rounded-lg border border-indigo-100 bg-white p-3 shadow-sm">
                        <p className="mb-2 text-sm text-slate-700">{msg.content}</p>
                        <div className="flex gap-2">
                          <button className="flex-1 rounded bg-indigo-600 py-1 text-xs font-medium text-white hover:bg-indigo-700">Accept</button>
                          <button className="flex-1 rounded bg-slate-100 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">Decline</button>
                        </div>
                      </div>
                    ) : (
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        msg.senderId === 'me' 
                          ? 'bg-indigo-600 text-white rounded-br-none' 
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                      }`}>
                        {msg.content}
                      </div>
                    )}
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
                          thread.status === 'online' ? 'bg-green-500' : 'bg-slate-400'
                        }`} />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex justify-between">
                          <span className="font-medium text-slate-900">{thread.name}</span>
                          {thread.unreadCount > 0 && (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-600">
                              {thread.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-slate-500">{thread.lastMessage}</div>
                      </div>
                    </div>
                  ))
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
