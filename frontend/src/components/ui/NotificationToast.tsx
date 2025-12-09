import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore, Notification } from '../../stores/notificationStore'
import { respondTournamentParticipant, fetchTournament } from '../../lib/api'

type ToastState = {
  notification: Notification
} | null

const AUTO_DISMISS_MS = Number(import.meta.env.VITE_TOURNAMENT_INVITE_TTL_MS ?? 20000)

export default function NotificationToast() {
  const notifications = useNotificationStore((s) => s.notifications)
  const markAsRead = useNotificationStore((s) => s.markAsRead)
  const deleteNotification = useNotificationStore((s) => s.deleteNotification)
  const [toast, setToast] = useState<ToastState>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!notifications || notifications.length === 0) return

    const priorityTypes: Notification['type'][] = ['TOURNAMENT_INVITE', 'TOURNAMENT_MATCH_READY']
    const next = notifications.find((n) => !n.read && priorityTypes.includes(n.type))
    if (next) setToast({ notification: next })
  }, [notifications])

  useEffect(() => {
    if (!toast) return
    const stillExists = notifications?.some((n) => n.id === toast.notification.id)
    if (!stillExists) {
      setToast(null)
    }
  }, [notifications, toast])

  // Auto-dismiss after TTL to avoid lingering stale invites in UI
  useEffect(() => {
    if (!toast) return
    if (toast.notification.type === 'TOURNAMENT_MATCH_READY' || (toast.notification.data as any)?.sessionId) return
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
  const isInvite = n.type === 'TOURNAMENT_INVITE'
  const isMatchReady = n.type === 'TOURNAMENT_MATCH_READY'
  const hasSessionLink = !!data.sessionId

  const handleJoinMatch = async () => {
    if (!data.sessionId) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (data.tournamentId) params.set('tournamentId', String(data.tournamentId))
      if (data.p1Id) params.set('p1Id', String(data.p1Id))
      if (data.p2Id) params.set('p2Id', String(data.p2Id))
      if (data.p1Name) params.set('p1Name', String(data.p1Name))
      if (data.p2Name) params.set('p2Name', String(data.p2Name))
      const desiredMode = data.mode || ((data.p1Name === 'AI' || data.p2Name === 'AI') ? 'ai' : 'remote')
      if (desiredMode) params.set('mode', String(desiredMode))
      navigate(`/game/${data.sessionId}?${params.toString()}`)
      await markAsRead(n.id)
      try {
        await deleteNotification(n.id)
      } catch (err) {
        console.error('Failed to delete notification after join', err)
      }
      setToast(null)
    } catch (e) {
      console.error('Failed to navigate to match', e)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (action: 'ACCEPT' | 'DECLINE') => {
    if (!data.tournamentId || !data.participantId) return
    setLoading(true)
    try {
      await respondTournamentParticipant(data.tournamentId, data.participantId, action)
      // If accepted and tournament already running, send the player straight to their match.
      if (action === 'ACCEPT') {
        try {
          const detail = await fetchTournament(data.tournamentId)
          const participantId = data.participantId
          const match = detail.data.matches.find((m) =>
            (m.playerA?.participantId === participantId || m.playerB?.participantId === participantId) && !m.winnerId
          )
          if (match) {
            const p1Name = match.playerA?.alias ?? 'Player 1'
            const p2Name = match.playerB?.alias ?? 'Player 2'
            const params = new URLSearchParams()
            params.set('tournamentId', String(data.tournamentId))
            if (match.playerA?.participantId) params.set('p1Id', String(match.playerA.participantId))
            if (match.playerB?.participantId) params.set('p2Id', String(match.playerB.participantId))
            params.set('p1Name', p1Name)
            params.set('p2Name', p2Name)
            params.set('mode', 'remote')
            navigate(`/game/local-match-${match.id}?${params.toString()}`)
          }
        } catch (err) {
          console.error('Failed to auto-join tournament match after accept', err)
        }
      }
      await markAsRead(n.id)
      try {
        await deleteNotification(n.id)
      } catch (err) {
        console.error('Failed to delete notification after response', err)
      }
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
            {(isMatchReady || hasSessionLink) ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">{`${data.p1Name || 'Player 1'} vs ${data.p2Name || 'Player 2'}`}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {isInvite ? (
              <>
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
              </>
            ) : null}
            {(isMatchReady || hasSessionLink) ? (
              <button
                onClick={handleJoinMatch}
                disabled={loading}
                className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                Join match
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
