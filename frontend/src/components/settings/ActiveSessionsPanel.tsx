import { useEffect, useState } from 'react'
import { fetchSessions, revokeSession, type Session } from '../../lib/api'
import logger from '../../lib/logger'

export const ActiveSessionsPanel = () => {
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<number | null>(null)

  const loadSessions = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { sessions } = await fetchSessions()
      setSessions(sessions)
    } catch (err) {
      logger.error('Failed to load active sessions', err)
      setError('Failed to load active sessions')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const handleRevoke = async (sessionId: number) => {
    if (!window.confirm('Are you sure you want to revoke this session?')) return

    setRevokingId(sessionId)
    try {
      await revokeSession(sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch (err) {
      logger.error('Failed to revoke session', err)
      alert('Failed to revoke session')
    } finally {
      setRevokingId(null)
    }
  }

  if (isLoading) {
    return <div className="text-sm text-slate-500">Loading sessions...</div>
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
        {error}
        <button
          onClick={loadSessions}
          className="ml-2 font-medium underline hover:text-red-800"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Active Sessions</h2>
      <div className="space-y-4">
        {sessions.length === 0 ? (
          <div className="text-center text-sm text-slate-500">
            No active sessions found.
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className="flex flex-col justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {session.userAgent || 'Unknown Device'}
                  </span>
                  {session.current && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Current
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  <div>IP: {session.ipAddress || 'Unknown'}</div>
                  <div>Last active: {new Date(session.lastUsedAt).toLocaleString()}</div>
                </div>
              </div>
              {!session.current && (
                <button
                  onClick={() => handleRevoke(session.id)}
                  disabled={revokingId === session.id}
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {revokingId === session.id ? 'Revoking...' : 'Revoke'}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
