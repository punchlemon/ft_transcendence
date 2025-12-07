import React, { useState } from 'react'
import { useChatStore } from '../../stores/chatStore'

type Props = {
  sessionId: string
  onClose: () => void
}

const PrivateRoomInviteModal: React.FC<Props> = ({ sessionId, onClose }) => {
  const [copied, setCopied] = useState(false)
  const setDrawerOpen = useChatStore((s) => s.setDrawerOpen)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const activeThreadId = useChatStore((s) => s.activeThreadId)

  const inviteUrl = `${window.location.origin}/game/${encodeURIComponent(sessionId)}?mode=remote&private=true`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy invite link', err)
      alert('Failed to copy link to clipboard')
    }
  }

  const handleSendToChat = async () => {
    // Open chat drawer so user can pick a thread if needed
    setDrawerOpen(true)
    const message = `Join my private room: ${inviteUrl}`
    try {
      if (activeThreadId) {
        await sendMessage(message)
        onClose()
      } else {
        // No active thread selected; inform user to choose one
        alert('Please open the chat, select the thread you want to send to, then press "Send to chat" again.')
      }
    } catch (err) {
      console.error('Failed to send invite to chat', err)
      alert('Failed to send invite to chat')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-slate-800">
        <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">Invite Players</h3>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Share this link so others can join your private room.</p>
        <div className="flex items-center gap-2">
          <input readOnly value={inviteUrl} className="flex-1 rounded-md border px-3 py-2 text-sm dark:bg-slate-900 dark:text-slate-100" />
          <button onClick={handleCopy} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-2 text-sm">Close</button>
          <button onClick={handleSendToChat} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white">Send to chat</button>
        </div>
      </div>
    </div>
  )
}

export default PrivateRoomInviteModal
