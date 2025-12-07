import React, { useEffect, useState } from 'react'
import Button from '../ui/Button'
import { fetchUserFriends } from '../../lib/api'
import { inviteTournamentParticipant } from '../../lib/api'
import useAuthStore from '../../stores/authStore'

type Props = {
  open: boolean
  onClose: () => void
  tournamentId: number
}

const FriendSelectorModal = ({ open, onClose, tournamentId }: Props) => {
  const user = useAuthStore((s) => s.user)
  const [friends, setFriends] = useState<Array<any>>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviting, setInviting] = useState<number | null>(null)

  useEffect(() => {
    if (!open || !user) return
    setLoading(true)
    fetchUserFriends(String(user.id))
      .then((res) => setFriends(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [open, user])

  const filtered = friends.filter((f) => f.displayName.toLowerCase().includes(query.toLowerCase()))

  const handleInvite = async (friendId: number) => {
    setInviting(friendId)
    try {
      await inviteTournamentParticipant(tournamentId, friendId)
      // optimistic - close modal
      onClose()
    } catch (e) {
      console.error(e)
      alert('招待に失敗しました')
    } finally {
      setInviting(null)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold">フレンドを招待</h3>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="検索..."
          className="mb-4 w-full rounded border px-3 py-2"
        />
        <div className="max-h-64 overflow-auto">
          {loading ? (
            <div>Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-500">一致するフレンドがいません</div>
          ) : (
            filtered.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 border-b py-2">
                <div>
                  <div className="font-medium">{f.displayName}</div>
                  <div className="text-xs text-slate-500">{f.login}</div>
                </div>
                <div>
                  <Button disabled={inviting === f.id} onClick={() => handleInvite(f.id)}>
                    {inviting === f.id ? '招待中...' : '招待'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 text-right">
          <Button onClick={onClose}>閉じる</Button>
        </div>
      </div>
    </div>
  )
}

export default FriendSelectorModal

/*
解説:

1) 目的
  - トーナメント作成者がフレンド一覧からオンラインフレンドを検索して招待できるモーダルUIの最小実装。

2) 実装
  - `fetchUserFriends` でフレンド一覧を取得し、検索フィルタを適用して表示。
  - `inviteTournamentParticipant` を呼び出してサーバに招待を作成する（成功時にモーダルを閉じる）。

3) 注意点
  - 招待の成否や詳細なエラーハンドリングは簡易実装。実運用では toast/ローカル state の更新を追加すること。
*/
