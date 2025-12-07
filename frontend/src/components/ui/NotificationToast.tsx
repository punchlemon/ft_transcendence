import { useEffect, useState } from 'react'
import { useNotificationStore, Notification } from '../../stores/notificationStore'
import { respondTournamentParticipant } from '../../lib/api'

type ToastState = {
  notification: Notification
} | null

const AUTO_DISMISS_MS = Number(import.meta.env.VITE_TOURNAMENT_INVITE_TTL_MS ?? 20000)

export default function NotificationToast() {
  const notifications = useNotificationStore((s) => s.notifications)
  const markAsRead = useNotificationStore((s) => s.markAsRead)
  const [toast, setToast] = useState<ToastState>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!notifications || notifications.length === 0) return

    const invite = notifications.find((n) => !n.read && n.type === 'TOURNAMENT_INVITE')
    if (invite) setToast({ notification: invite })
  }, [notifications])

  // Auto-dismiss after TTL to avoid lingering stale invites in UI
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => {
      // mark as read locally; server-side TTL will handle state
      markAsRead(toast.notification.id).catch(() => undefined)
      setToast(null)
    }, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast, markAsRead])

  if (!toast) return null

  const n = toast.notification
  const data = n.data || {}

  const handleAction = async (action: 'ACCEPT' | 'DECLINE') => {
    if (!data.tournamentId || !data.participantId) return
    setLoading(true)
    try {
      await respondTournamentParticipant(data.tournamentId, data.participantId, action)
      await markAsRead(n.id)
      setToast(null)
    } catch (e) {
      console.error('Failed to respond to invite', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
      <div className="max-w-lg rounded-lg border bg-white p-4 shadow-lg dark:bg-slate-800">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="font-medium text-slate-900 dark:text-slate-100">{n.message || 'Tournament Invite'}</p>
            {data.tournamentId ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Tournament: #{data.tournamentId}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAction('ACCEPT')}
              disabled={loading}
              className="rounded-md bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              Accept
            </button>
            <button
              onClick={() => handleAction('DECLINE')}
              disabled={loading}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
