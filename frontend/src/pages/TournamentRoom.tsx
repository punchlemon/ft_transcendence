import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { onChatWsEvent } from '../lib/chatWs'
import { fetchTournamentRoom } from '../lib/api'
import useAuthStore from '../stores/authStore'

export default function TournamentRoomPage() {
  const params = useParams()
  const tournamentId = Number(params.tournamentId)
  const roomId = Number(params.roomId)
  const [joinedUsers, setJoinedUsers] = useState<Array<{ id: number; displayName: string; avatarUrl?: string }>>([])
  const [room, setRoom] = useState<any>(null)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  useEffect(() => {
    if (!tournamentId || !roomId) return
    fetchTournamentRoom(tournamentId, roomId)
      .then((r) => {
        setRoom(r)
        const joined = [] as Array<{ id: number; displayName: string; avatarUrl?: string }>
        if (r.owner) joined.push({ id: r.owner.id, displayName: r.owner.displayName, avatarUrl: r.owner.avatarUrl })
        if (Array.isArray(r.invites)) {
          r.invites.forEach((inv: any) => {
            if (inv.state === 'ACCEPTED' || inv.state === 'JOINED') {
              if (inv.user) joined.push({ id: inv.user.id, displayName: inv.user.displayName, avatarUrl: inv.user.avatarUrl })
            }
          })
        }
        setJoinedUsers(joined)
      })
      .catch(() => {})
  }, [tournamentId, roomId])

  useEffect(() => {
    const offJoin = onChatWsEvent('TOURNAMENT_ROOM_JOINED', (payload: any) => {
      if (!payload || Number(payload.roomId) !== roomId) return
      const u = payload.user
      if (!u) return
      setJoinedUsers((prev) => {
        if (prev.find((p) => p.id === u.id)) return prev
        return [...prev, { id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl }]
      })
    })

    const offLeft = onChatWsEvent('TOURNAMENT_ROOM_LEFT', (payload: any) => {
      if (!payload || Number(payload.roomId) !== roomId) return
      const u = payload.user
      if (!u) return
      setJoinedUsers((prev) => prev.filter((p) => p.id !== u.id))
    })

    return () => {
      try { offJoin(); offLeft(); } catch (e) {}
    }
  }, [roomId])

  const handleStartGame = () => {
    alert('Start game not implemented yet')
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h2 className="mb-4 text-xl font-semibold">Tournament Room</h2>
      <div className="mb-4">
        <div>Room ID: <strong>{roomId}</strong></div>
        <div>Tournament ID: <strong>{tournamentId}</strong></div>
        <div>Owner: <strong>{room?.owner?.displayName ?? 'Unknown'}</strong></div>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 font-medium">Joined Players</h3>
        {joinedUsers.length === 0 ? (
          <div className="text-sm text-slate-500">No players have joined yet.</div>
        ) : (
          <ul>
            {joinedUsers.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                {u.avatarUrl && <img src={u.avatarUrl} alt="avatar" className="w-6 h-6 rounded-full" />}
                <span>{u.displayName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {user && (
        <div className="flex gap-3">
          <button onClick={handleStartGame} className="rounded-md bg-indigo-600 px-4 py-2 text-white">Start Game</button>
          <button onClick={() => navigate(-1)} className="rounded-md border px-4 py-2">Back</button>
        </div>
      )}
    </div>
  )
}
