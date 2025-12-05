import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
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
  inviteToGame,
  updateUserProfile
} from '../lib/api'
import { EditProfileModal } from '../components/profile/EditProfileModal'
import UserAvatar from '../components/ui/UserAvatar'

// Mock types
interface UserProfile {
  id: string
  displayName: string
  login: string
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
  login: string
  status: 'online' | 'offline' | 'in-game'
  avatarUrl: string
}

const ProfilePage = () => {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.user)
  const createThread = useChatStore((state) => state.createThread)
  const isOwnProfile = currentUser?.login === username

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [history, setHistory] = useState<MatchHistory[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editModalField, setEditModalField] = useState<'avatar' | null>(null)
  const [editingField, setEditingField] = useState<'displayName' | 'bio' | null>(null)
  const [editValue, setEditValue] = useState('')
  
  // Use ref to access latest profile in WebSocket callbacks without re-subscribing
  const profileRef = useRef(profile)
  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  const startEditing = (field: 'displayName' | 'bio', value: string) => {
    setEditingField(field)
    setEditValue(value)
  }

  const cancelEditing = () => {
    setEditingField(null)
    setEditValue('')
  }

  const saveEditing = async () => {
    if (!profile || !editingField) return
    
    try {
      const payload = { [editingField]: editValue }
      await updateUserProfile(profile.id, payload)
      
      setProfile(prev => prev ? { ...prev, [editingField]: editValue } : null)
      
      if (isOwnProfile) {
        useAuthStore.getState().updateUser({ [editingField]: editValue })
      }
      
      setEditingField(null)
    } catch (err) {
      console.error(err)
    }
  }

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
        login: profileData.login,
        tag: `#${profileData.login}`,
        avatarUrl: profileData.avatarUrl || '',
        status: (profileData.status?.toLowerCase() as 'online' | 'offline' | 'in-game') || 'offline',
        bio: profileData.bio || '',
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
          login: f.login,
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
      const currentProfile = profileRef.current
      if (data.status === 'FRIEND') {
        // If we are viewing the profile of the person we just became friends with
        if (currentProfile && Number(currentProfile.id) === data.friendId) {
           setProfile(prev => prev ? { ...prev, friendshipStatus: 'FRIEND' } : null)
        }
      } else if (data.status === 'PENDING_SENT') {
        if (currentProfile && Number(currentProfile.id) === data.friendId) {
           setProfile(prev => prev ? { ...prev, friendshipStatus: 'PENDING_SENT' } : null)
        }
      } else if (data.status === 'PENDING_RECEIVED') {
        if (currentProfile && Number(currentProfile.id) === data.friendId) {
           setProfile(prev => prev ? { ...prev, friendshipStatus: 'PENDING_RECEIVED', friendRequestId: data.requestId } : null)
        }
      } else if (data.status === 'NONE') {
        if (currentProfile && Number(currentProfile.id) === data.friendId) {
           setProfile(prev => prev ? { ...prev, friendshipStatus: 'NONE' } : null)
        }
      }
    })

    const unsubscribePublicFriend = onChatWsEvent('public_friend_update', (data) => {
      const currentProfile = profileRef.current
      if (!currentProfile) return;
      
      // If the update is about the user we are viewing
      if (Number(currentProfile.id) === data.userId) {
        if (data.type === 'ADD') {
           setFriends(prev => {
             if (prev.some(f => f.id === String(data.friend.id))) return prev;
             return [...prev, {
               id: String(data.friend.id),
               displayName: data.friend.displayName,
               login: data.friend.login,
               status: (data.friend.status?.toLowerCase() as 'online' | 'offline' | 'in-game') || 'offline',
               avatarUrl: data.friend.avatarUrl || ''
             }]
           })
        } else if (data.type === 'REMOVE') {
           setFriends(prev => prev.filter(f => f.id !== String(data.friendId)))
        }
      }
    })

    const unsubscribeRelationship = onChatWsEvent('relationship_update', (data) => {
      const currentProfile = profileRef.current
      if (!currentProfile) return
      const targetId = Number(currentProfile.id)
      
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

    const unsubscribeUserUpdate = onChatWsEvent('user_update', (data) => {
      setProfile(prev => {
        if (prev && Number(prev.id) === data.id) {
          return { ...prev, ...data }
        }
        return prev
      })
      setFriends(prev => prev.map(f => f.id === String(data.id) ? { ...f, ...data, id: String(data.id) } : f))
    })

    return () => {
      unsubscribeFriend()
      unsubscribePublicFriend()
      unsubscribeRelationship()
      unsubscribeUserUpdate()
    }
  }, [isOwnProfile, fetchProfileData])

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
        <div 
          className={`relative ${isOwnProfile ? 'cursor-pointer group' : ''}`} 
          onClick={() => isOwnProfile && setEditModalField('avatar')}
        >
          <UserAvatar
            key={profile.avatarUrl || 'default'}
            user={{
              id: Number(profile.id),
              displayName: profile.displayName,
              avatarUrl: profile.avatarUrl,
              status: profile.status.toUpperCase(),
              login: profile.login
            }}
            size="2xl"
            className=""
            linkToProfile={false}
          />
          {isOwnProfile && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
               <span className="text-white text-xs font-medium">Edit</span>
            </div>
          )}
        </div>
        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-col items-center sm:items-start">
            {editingField === 'displayName' ? (
              <div className="relative inline-grid items-center justify-items-center sm:justify-items-start">
                <span className="invisible col-start-1 row-start-1 whitespace-pre text-3xl font-bold opacity-0 pointer-events-none">
                  {editValue || ' '}
                </span>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="col-start-1 row-start-1 w-full min-w-[1ch] bg-transparent p-0 text-center text-3xl font-bold text-slate-900 focus:outline-none sm:text-left"
                  autoFocus
                  onBlur={saveEditing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEditing()
                    if (e.key === 'Escape') cancelEditing()
                  }}
                />
              </div>
            ) : (
              <h1 
                className={`text-3xl font-bold text-slate-900 ${isOwnProfile ? 'cursor-pointer hover:underline decoration-slate-400 decoration-dashed underline-offset-4' : ''}`}
                onClick={() => isOwnProfile && startEditing('displayName', profile.displayName)}
                title={isOwnProfile ? "Click to edit profile" : undefined}
              >
                {profile.displayName}
              </h1>
            )}
            <span className="text-sm text-slate-500">{profile.tag}</span>
          </div>
          {editingField === 'bio' ? (
            <div className="mt-2">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-slate-600 focus:border-indigo-500 focus:outline-none"
                rows={3}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelEditing()
                }}
              />
              <div className="mt-1 flex gap-2">
                <button onClick={saveEditing} className="rounded bg-slate-900 px-2 py-1 text-xs text-white">Save</button>
                <button onClick={cancelEditing} className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-700">Cancel</button>
              </div>
            </div>
          ) : (
            (profile.bio || isOwnProfile) && (
              <p 
                className={`mt-2 text-slate-600 ${isOwnProfile ? 'cursor-pointer hover:bg-slate-50 rounded px-2 -mx-2 transition-colors' : ''}`}
                onClick={() => isOwnProfile && startEditing('bio', profile.bio)}
                title={isOwnProfile ? "Click to edit bio" : undefined}
              >
                {profile.bio || <span className="text-slate-400 italic">Add a bio...</span>}
              </p>
            )
          )}
          
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            {!isOwnProfile && (
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
                      <UserAvatar
                        key={friend.avatarUrl || 'default'}
                        user={{
                          id: Number(friend.id),
                          displayName: friend.displayName,
                          avatarUrl: friend.avatarUrl,
                          status: friend.status.toUpperCase(),
                          login: friend.login
                        }}
                        size="md"
                        linkToProfile={true}
                      />
                      <div className="flex-1 overflow-hidden">
                        <div className="truncate font-medium text-slate-900">
                          {friend.displayName}
                        </div>
                        <div className="text-xs text-slate-500">#{friend.login}</div>
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
          isOpen={!!editModalField}
          editMode={editModalField || 'avatar'}
          onClose={() => setEditModalField(null)}
          onSuccess={(updated) => {
            setProfile((prev) =>
              prev
                ? {
                    ...prev,
                    displayName: updated.displayName,
                    bio: updated.bio || '',
                    avatarUrl: updated.avatarUrl || ''
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
