import { useState } from 'react'
import UserAvatar from '../ui/UserAvatar'

interface SendMessageModalProps {
  user: {
    id: number
    displayName: string
    login: string
    avatarUrl: string
    status: string
  }
  existingDMThread?: { id: number } | null
  onClose: () => void
  onSend: (message: string) => Promise<void>
  onOpenChat: () => void
}

export const SendMessageModal = ({ user, existingDMThread, onClose, onSend, onOpenChat }: SendMessageModalProps) => {
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showAvatarPreview, setShowAvatarPreview] = useState(false)

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    
    setIsSending(true)
    try {
      await onSend(message)
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setIsSending(false)
    }
  }

  const handleOpenChatClick = () => {
    onOpenChat()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200 dark:bg-slate-800">
          {/* Header with Avatar */}
          <div className="flex flex-col items-center mb-6">
            <div onClick={() => setShowAvatarPreview(true)} className="cursor-pointer">
              <UserAvatar 
                user={user}
                size="2xl"
                linkToProfile={false}
                className="mb-3"
              />
            </div>
          </div>

        {existingDMThread ? (
          // Show "Open Chat" button if DM already exists
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleOpenChatClick}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Open Chat
            </button>
          </div>
        ) : (
          // Show message input if no DM exists
          <>
            <form onSubmit={handleSendMessage}>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage(e as any)
                  }
                }}
                placeholder="Type your message..."
                rows={1}
                autoFocus
                className="w-full min-h-[38px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400"
              />

              <div className="mt-4 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSending}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!message.trim() || isSending}
                  className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </>
        )}
        </div>
      </div>

      {/* Avatar Preview Modal */}
      {showAvatarPreview && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4"
          onClick={() => setShowAvatarPreview(false)}
        >
          <div 
            className="relative w-full max-w-[90vw] max-h-[90vh] aspect-square md:max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl">
              <img
                src={user.avatarUrl || '/default-avatar.png'}
                alt={user.displayName}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setShowAvatarPreview(false)}
                className="absolute top-3 right-3 rounded-full bg-slate-900/80 p-2 text-white shadow-lg hover:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-white/60"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
