import React, { useEffect, useState } from 'react'
import logger from '../../lib/logger'
import Button from '../ui/Button'
import { fetchUserFriends, createTournamentRoom } from '../../lib/api'
import useAuthStore from '../../stores/authStore'

type Props = {
  open: boolean
  onClose: () => void
  tournamentId: number
}

const InviteToTournamentRoomModal = ({ open, onClose, tournamentId }: Props) => {
  const user = useAuthStore((s) => s.user)
  const [friends, setFriends] = useState<Array<any>>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Record<number, boolean>>({})

  useEffect(() => {
    if (!open || !user) return
    setLoading(true)
    fetchUserFriends(String(user.id))
      .then((res) => setFriends(res.data))
      .catch((err) => logger.error('Failed to fetch user friends for selector', err))
      .finally(() => setLoading(false))
  }, [open, user])

  // Only show friends who are currently ONLINE
  const filtered = friends
    .filter((f) => f.status === 'ONLINE')
    .filter((f) => f.displayName.toLowerCase().includes(query.toLowerCase()))

  const toggle = (id: number) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }))
  }

  const handleCreateRoom = async () => {
    const invited = Object.keys(selected).filter((k) => selected[Number(k)]).map((k) => Number(k))
    if (invited.length === 0) {
      alert('少なくとも1人を選択してください')
      return
    }
    setCreating(true)
    try {
      await createTournamentRoom(tournamentId, invited)
      // Backend will send notifications/invites to invited users via WS/notifications
      onClose()
    } catch (e) {
      logger.error('Failed to create tournament room', e)
      alert('ルーム作成に失敗しました')
    } finally {
      setCreating(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold">Invite Friends to Room</h3>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="mb-4 w-full rounded border px-3 py-2"
        />
        <div className="max-h-64 overflow-auto">
          {loading ? (
            <div>Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-500">No matching friends</div>
          ) : (
            filtered.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 border-b py-2">
                <div>
                  <div className="font-medium">{f.displayName} <span className="ml-2 inline-block rounded-full bg-green-400 px-2 py-0.5 text-xs font-medium text-white">ONLINE</span></div>
                  <div className="text-xs text-slate-500">{f.login}</div>
                </div>
                <div>
                  <input type="checkbox" checked={!!selected[f.id]} onChange={() => toggle(f.id)} />
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">Cancel</Button>
          <Button onClick={handleCreateRoom} disabled={creating}>{creating ? 'Creating...' : 'Create Room & Invite'}</Button>
        </div>
      </div>
    </div>
  )
}

export default InviteToTournamentRoomModal
