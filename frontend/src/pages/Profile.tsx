import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

// Mock types
interface UserProfile {
  id: string
  displayName: string
  tag: string
  avatarUrl: string
  status: 'online' | 'offline' | 'in-game'
  bio: string
}

interface UserStats {
  wins: number
  losses: number
  totalMatches: number
  winRate: number
  mvpCount: number
  currentStreak: number
}

interface MatchHistory {
  id: string
  opponentName: string
  result: 'win' | 'loss'
  score: string
  date: string
  mode: 'standard' | 'party'
}

interface Friend {
  id: string
  displayName: string
  status: 'online' | 'offline' | 'in-game'
  avatarUrl: string
}

const ProfilePage = () => {
  const { id } = useParams<{ id: string }>()
  const currentUser = useAuthStore((state) => state.user)
  const isOwnProfile = currentUser?.id === id

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [history, setHistory] = useState<MatchHistory[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Simulate API fetch
    const fetchProfileData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 500))

        // Mock data
        if (id === 'not-found') {
          throw new Error('User not found')
        }

        setProfile({
          id: id || 'unknown',
          displayName: `User ${id}`,
          tag: `#${id?.substring(0, 4)}`,
          avatarUrl: 'https://via.placeholder.com/150',
          status: 'online',
          bio: 'Pong enthusiast. Love to play standard mode.',
        })

        setStats({
          wins: 42,
          losses: 10,
          totalMatches: 52,
          winRate: 80.7,
          mvpCount: 5,
          currentStreak: 3,
        })

        setHistory([
          {
            id: 'm1',
            opponentName: 'Rival 1',
            result: 'win',
            score: '11 - 9',
            date: '2025-11-26',
            mode: 'standard',
          },
          {
            id: 'm2',
            opponentName: 'Rival 2',
            result: 'loss',
            score: '5 - 11',
            date: '2025-11-25',
            mode: 'party',
          },
        ])

        setFriends([
          {
            id: 'f1',
            displayName: 'Friend 1',
            status: 'online',
            avatarUrl: 'https://via.placeholder.com/40',
          },
          {
            id: 'f2',
            displayName: 'Friend 2',
            status: 'offline',
            avatarUrl: 'https://via.placeholder.com/40',
          },
        ])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile')
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfileData()
  }, [id])

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-slate-500">Loading profile...</div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12 text-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          {error || 'Profile not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Hero Section */}
      <div className="mb-8 flex flex-col items-center gap-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm sm:flex-row sm:items-start">
        <div className="relative">
          <img
            src={profile.avatarUrl}
            alt={profile.displayName}
            className="h-32 w-32 rounded-full border-4 border-white shadow-md"
          />
          <span
            className={`absolute bottom-2 right-2 h-4 w-4 rounded-full border-2 border-white ${
              profile.status === 'online'
                ? 'bg-green-500'
                : profile.status === 'in-game'
                  ? 'bg-yellow-500'
                  : 'bg-slate-400'
            }`}
            title={profile.status}
          />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-baseline">
            <h1 className="text-3xl font-bold text-slate-900">{profile.displayName}</h1>
            <span className="text-sm text-slate-500">{profile.tag}</span>
          </div>
          <p className="mt-2 text-slate-600">{profile.bio}</p>
          
          {isOwnProfile && (
            <button className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Edit Profile
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column: Stats & Friends */}
        <div className="space-y-8 lg:col-span-1">
          {/* Stats Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Statistics</h2>
            {stats ? (
              <div className="space-y-4">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Win Rate</span>
                  <span className="font-medium text-slate-900">{stats.winRate}%</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Matches</span>
                  <span className="font-medium text-slate-900">{stats.totalMatches}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Wins / Losses</span>
                  <span className="font-medium text-slate-900">
                    {stats.wins} / {stats.losses}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Current Streak</span>
                  <span className="font-medium text-slate-900">{stats.currentStreak}</span>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-500">No stats available</div>
            )}
          </div>

          {/* Friends Panel */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Friends</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {friends.length}
              </span>
            </div>
            <div className="space-y-3">
              {friends.length > 0 ? (
                friends.map((friend) => (
                  <div key={friend.id} className="flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={friend.avatarUrl}
                        alt={friend.displayName}
                        className="h-10 w-10 rounded-full"
                      />
                      <span
                        className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${
                          friend.status === 'online' ? 'bg-green-500' : 'bg-slate-400'
                        }`}
                      />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate font-medium text-slate-900">
                        {friend.displayName}
                      </div>
                      <div className="text-xs text-slate-500 capitalize">{friend.status}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-sm text-slate-500">No friends yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Match History */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Match History</h2>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Opponent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Mode
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {history.length > 0 ? (
                    history.map((match) => (
                      <tr key={match.id}>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                          {match.date}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                          {match.opponentName}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 capitalize">
                          {match.mode}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <span
                            className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              match.result === 'win'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {match.result.toUpperCase()} ({match.score})
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">
                        No matches played yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage

/*
解説:

1) モックデータ構造
  - `UserProfile`, `UserStats`, `MatchHistory`, `Friend` インターフェースを定義し、将来の API レスポンス型に合わせている。

2) データ取得シミュレーション
  - `useEffect` 内で非同期処理を模倣し、ローディング状態とエラーハンドリングを実装。`id === 'not-found'` の場合はエラーを表示する。

3) レイアウト構成
  - **Hero Section**: アバター、名前、ステータス、自己紹介を表示。`isOwnProfile` が true の場合のみ「Edit Profile」ボタンを表示。
  - **Grid Layout**: PC (lg) では 2 カラム構成（左: Stats/Friends, 右: History）、モバイルでは縦積み。

4) コンポーネント詳細
  - **Stats Card**: 勝率や試合数をリスト表示。
  - **Friends Panel**: フレンドリストをアバター付きで表示し、オンライン状態をインジケータで示す。
  - **Match History**: テーブル形式で対戦履歴を表示し、勝敗に応じたバッジ色分けを行う。

5) 状態管理
  - `isLoading`, `error` ステートにより、データ取得中の UI とエラー時のフォールバックを制御している。
*/
