import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useNotificationStore } from '../stores/notificationStore'
import { onChatWsEvent } from '../lib/chatWs'
import { 
  fetchUserProfile, 
  fetchUserMatches, 
  fetchUserFriends,
  sendFriendRequest,
  removeFriend,
  cancelFriendRequest,
  acceptFriendRequest,
  blockUser,
  unblockUser,
  inviteToGame
} from '../lib/api'
import { EditProfileModal } from '../components/profile/EditProfileModal'
import Avatar from '../components/ui/Avatar'

// Mock types
interface UserProfile {
  id: string
  displayName: string
  tag: string
  avatarUrl: string
  status: 'online' | 'offline' | 'in-game'
  bio: string
  friendshipStatus: 'NONE' | 'FRIEND' | 'PENDING_SENT' | 'PENDING_RECEIVED'
  friendRequestId?: number
  isBlockedByViewer: boolean
  isBlockingViewer: boolean
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
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)
  const resetChat = useChatStore((state) => state.reset)
  const createThread = useChatStore((state) => state.createThread)
  const resetNotifications = useNotificationStore((state) => state.reset)
  const isOwnProfile = currentUser?.login === username

  const handleLogout = () => {
    clearSession()
    resetChat()
    resetNotifications()
  }

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [history, setHistory] = useState<MatchHistory[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  const fetchProfileData = useCallback(async () => {
    if (!username) return
    // Don't set loading true on refresh to avoid flicker
    setError(null)
    try {
      const [profileData, matchesData, friendsData] = await Promise.all([
        fetchUserProfile(username),
        fetchUserMatches(username),
        fetchUserFriends(username)
      ])

      setProfile({
        id: String(profileData.id),
        displayName: profileData.displayName,
        tag: `#${profileData.login}`,
        avatarUrl: profileData.avatarUrl || '',
        status: (profileData.status?.toLowerCase() as 'online' | 'offline' | 'in-game') || 'offline',
        bio: profileData.bio || 'No bio available',
        friendshipStatus: profileData.friendshipStatus,
        friendRequestId: profileData.friendRequestId,
        isBlockedByViewer: profileData.isBlockedByViewer,
        isBlockingViewer: profileData.isBlockingViewer
      })

      if (profileData.stats) {
        const totalMatches = profileData.stats.matchesPlayed
        const winRate = totalMatches > 0 ? Math.round((profileData.stats.wins / totalMatches) * 100) : 0

        setStats({
          wins: profileData.stats.wins,
          losses: profileData.stats.losses,
          totalMatches: totalMatches,
          winRate: winRate,
          mvpCount: 0, // Not available in API yet
          currentStreak: 0, // Not available in API yet
        })
      } else {
        setStats(null)
      }

      setHistory(
        matchesData.data.map((m) => ({
          id: String(m.id),
          opponentName: m.opponent.displayName,
          result: m.result.toLowerCase() as 'win' | 'loss',
          score: m.score,
          date: new Date(m.date).toLocaleDateString(),
          mode: m.mode.toLowerCase() as 'standard' | 'party',
        }))
      )

      setFriends(
        friendsData.data.map((f) => ({
          id: String(f.id),
          displayName: f.displayName,
          status: (f.status.toLowerCase() as 'online' | 'offline' | 'in-game') || 'offline',
          avatarUrl: f.avatarUrl || '',
        }))
      )
    } catch (err) {
      console.error(err)
      setError('Failed to load profile')
    } finally {
      setIsLoading(false)
    }
  }, [username]);

  useEffect(() => {
    setIsLoading(true)
    fetchProfileData()
  }, [fetchProfileData])

  useEffect(() => {
    const unsubscribeFriend = onChatWsEvent('friend_update', (data) => {
      if (data.status === 'FRIEND') {
        // If we are viewing the profile of the person we just became friends with
        if (profile && Number(profile.id) === data.friendId) {
           setProfile(prev => prev ? { ...prev, friendshipStatus: 'FRIEND' } : null)
        }
        // If we are viewing our own profile, refresh to show new friend in list
        if (isOwnProfile) {
           fetchProfileData()
        }
      } else if (data.status === 'PENDING_SENT') {
        if (profile && Number(profile.id) === data.friendId) {
           setProfile(prev => prev ? { ...prev, friendshipStatus: 'PENDING_SENT' } : null)
        }
      } else if (data.status === 'PENDING_RECEIVED') {
        if (profile && Number(profile.id) === data.friendId) {
           setProfile(prev => prev ? { ...prev, friendshipStatus: 'PENDING_RECEIVED', friendRequestId: data.requestId } : null)
        }
      } else if (data.status === 'NONE') {
        if (profile && Number(profile.id) === data.friendId) {
           setProfile(prev => prev ? { ...prev, friendshipStatus: 'NONE' } : null)
        }
        if (isOwnProfile) {
           fetchProfileData()
        }
      }
    })

    const unsubscribeRelationship = onChatWsEvent('relationship_update', (data) => {
      if (!profile) return
      const targetId = Number(profile.id)
      
      if (data.userId === targetId) {
        if (data.status === 'BLOCKING') {
          setProfile(prev => prev ? { ...prev, isBlockedByViewer: true } : null)
        } else if (data.status === 'BLOCKED_BY') {
          setProfile(prev => prev ? { ...prev, isBlockingViewer: true } : null)
        } else if (data.status === 'NONE') {
          setProfile(prev => prev ? { 
            ...prev, 
            isBlockedByViewer: false, 
            isBlockingViewer: false
          } : null)
        }
      }
    })

    return () => {
      unsubscribeFriend()
      unsubscribeRelationship()
    }
  }, [profile, isOwnProfile, fetchProfileData])

  const handleFriendAction = async (action: 'add' | 'remove' | 'cancel' | 'accept' | 'block' | 'unblock') => {
    if (!profile) return
    setIsActionLoading(true)
    try {
      const userId = Number(profile.id)
      if (action === 'add') await sendFriendRequest(userId)
      if (action === 'remove') await removeFriend(userId)
      if (action === 'cancel') await cancelFriendRequest(userId)
      if (action === 'accept' && profile.friendRequestId) await acceptFriendRequest(profile.friendRequestId)
      if (action === 'block') await blockUser(userId)
      if (action === 'unblock') await unblockUser(userId)
      
      await fetchProfileData()
    } catch (err) {
      console.error(err)
      // Ideally show a toast here
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleInvite = async () => {
    if (!profile) return
    setIsActionLoading(true)
    try {
      const { sessionId } = await inviteToGame(Number(profile.id))
      navigate(`/game/${sessionId}`)
    } catch (err) {
      console.error(err)
      setError('Failed to invite user')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!profile) return
    setIsActionLoading(true)
    try {
      await createThread('DM', Number(profile.id))
    } catch (err) {
      console.error(err)
      setError('Failed to create chat')
    } finally {
      setIsActionLoading(false)
    }
  }

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
          <Avatar
            src={profile.avatarUrl}
            alt={profile.displayName}
            size="2xl"
            className="border-4 border-white shadow-md"
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
          
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            {isOwnProfile ? (
              <>
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Edit Profile
                </button>
                <button
                  onClick={handleLogout}
                  className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSendMessage}
                  disabled={isActionLoading}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Send Message
                </button>
                {profile.friendshipStatus === 'NONE' && (
                  <button
                    onClick={() => handleFriendAction('add')}
                    disabled={isActionLoading}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    Add Friend
                  </button>
                )}
                {profile.friendshipStatus === 'PENDING_SENT' && (
                  <button
                    onClick={() => handleFriendAction('cancel')}
                    disabled={isActionLoading}
                    className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 hover:text-red-600 disabled:opacity-50"
                  >
                    Cancel Request
                  </button>
                )}
                {profile.friendshipStatus === 'PENDING_RECEIVED' && (
                  <button
                    onClick={() => handleFriendAction('accept')}
                    disabled={isActionLoading}
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
                  >
                    Accept Request
                  </button>
                )}
                {profile.friendshipStatus === 'FRIEND' && (
                  <button
                    onClick={() => handleFriendAction('remove')}
                    disabled={isActionLoading}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Unfriend
                  </button>
                )}
                
                {profile.isBlockedByViewer ? (
                  <button
                    onClick={() => handleFriendAction('unblock')}
                    disabled={isActionLoading}
                    className="rounded-md bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50"
                  >
                    Unblock
                  </button>
                ) : (
                  <button
                    onClick={() => handleFriendAction('block')}
                    disabled={isActionLoading}
                    className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                  >
                    Block
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-12">
        {/* Overview Section */}
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
                        <Avatar
                          src={friend.avatarUrl}
                          alt={friend.displayName}
                          size="md"
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

      {profile && (
        <EditProfileModal
          userId={profile.id}
          initialData={{
            displayName: profile.displayName,
            bio: profile.bio,
            avatarUrl: profile.avatarUrl
          }}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={(updated) => {
            setProfile((prev) =>
              prev
                ? {
                    ...prev,
                    displayName: updated.displayName,
                    bio: updated.bio || '',
                    avatarUrl: updated.avatarUrl || 'https://via.placeholder.com/150'
                  }
                : null
            )
          }}
        />
      )}
    </div>
  )
}

export default ProfilePage
