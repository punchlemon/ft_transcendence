import React, { useState, useEffect } from 'react'
import logger from '../../lib/logger'
import { useChatStore } from '../../stores/chatStore'
import { api, sendInviteToThread } from '../../lib/api'

type Props = {
  sessionId: string
  onClose: () => void
}

const PrivateRoomInviteModal: React.FC<Props> = ({ sessionId, onClose }) => {
  const [copied, setCopied] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
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
      logger.error('Failed to copy invite link', err)
      alert('Failed to copy link to clipboard')
    }
  }

  // Keep availability info for display, but do not block sending from the modal
  useEffect(() => {
    let mounted = true
    const check = async () => {
      try {
        const res = await api.get(`/game/${encodeURIComponent(sessionId)}/status`)
        if (!mounted) return
        const data = res.data ?? res
        setAvailable(Boolean(data.available))
      } catch (err) {
        if (mounted) setAvailable(false)
      }
    }
    check()
    return () => { mounted = false }
  }, [sessionId])

  const handleSendToChat = async () => {
    // Open chat drawer so user can pick a thread if needed
    // We allow sending from the modal regardless of availability; availability will be enforced in-chat
    setDrawerOpen(true)

    // Create structured invite payload and call dedicated API to avoid embedding JSON in content
    const payload = { sessionId, url: inviteUrl, label: 'Join Game' }
    try {
      if (activeThreadId) {
        await sendInviteToThread(activeThreadId, payload)
        onClose()
      } else {
        alert('Please open the chat, select the thread you want to send to, then press "Send to chat" again.')
      }
    } catch (err) {
      logger.error('Failed to send invite to chat', err)
      alert('Failed to send invite to chat')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-slate-800">
        <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">Invite Players</h3>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Share this link so others can join your private room.</p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            disabled={copied}
            className={`rounded-md bg-indigo-600 px-3 py-2 text-sm text-white ${copied ? 'opacity-60 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={handleSendToChat}
            disabled={!activeThreadId}
            title={!activeThreadId ? 'Open a chat thread to enable' : undefined}
            className={`rounded-md px-3 py-2 text-sm text-white ${activeThreadId ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm' : 'bg-slate-400 cursor-not-allowed opacity-70'}`}
          >
            Send to chat
          </button>
        </div>
      </div>
    </div>
  )
}

export default PrivateRoomInviteModal
