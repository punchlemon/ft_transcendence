import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchUsers, fetchUserFriends, fetchSentFriendRequests, fetchBlockedUsers, type UserSearchResponse, type UserSearchParams } from '../lib/api'
import { onChatWsEvent } from '../lib/chatWs'
import Button from '../components/ui/Button'
import useAuthStore from '../stores/authStore'

const UsersPage = () => {
  const [users, setUsers] = useState<UserSearchResponse['data']>([])
  const [meta, setMeta] = useState<UserSearchResponse['meta']>({ page: 1, limit: 20, total: 0 })
  const [loading, setLoading] = useState(false)
  const [params, setParams] = useState<UserSearchParams>({
    page: 1,
    limit: 20,
    sortBy: 'displayName',
    order: 'asc',
    query: undefined
  })
  const { user: currentUser } = useAuthStore()
  const [myFriends, setMyFriends] = useState<number[]>([])
  const [sentRequests, setSentRequests] = useState<number[]>([])
  const [blockedUsers, setBlockedUsers] = useState<number[]>([])

  useEffect(() => {
    const unsubscribeFriend = onChatWsEvent('friend_update', (data) => {
      if (data.status === 'FRIEND') {
        setMyFriends(prev => {
          if (prev.includes(data.friendId)) return prev
          return [...prev, data.friendId]
        })
        setSentRequests(prev => prev.filter(id => id !== data.friendId))
      } else if (data.status === 'PENDING_SENT') {
        setSentRequests(prev => {
          if (prev.includes(data.friendId)) return prev
          return [...prev, data.friendId]
        })
      } else if (data.status === 'NONE') {
        setMyFriends(prev => prev.filter(id => id !== data.friendId))
        setSentRequests(prev => prev.filter(id => id !== data.friendId))
      }
    })

    const unsubscribeRelationship = onChatWsEvent('relationship_update', (data) => {
      if (data.status === 'BLOCKING') {
        setBlockedUsers(prev => {
          if (prev.includes(data.userId)) return prev
          return [...prev, data.userId]
        })
      } else if (data.status === 'NONE') {
        setBlockedUsers(prev => prev.filter(id => id !== data.userId))
      }
    })

    return () => {
      unsubscribeFriend()
      unsubscribeRelationship()
    }
  }, [])

  useEffect(() => {
    if (currentUser) {
      fetchUserFriends(currentUser.id.toString()).then(res => {
        setMyFriends(res.data?.map(f => f.id) || [])
      }).catch(console.error)

      fetchSentFriendRequests().then(res => {
        setSentRequests(res.data?.map(r => r.receiver?.id).filter((id): id is number => !!id) || [])
      }).catch(console.error)

      fetchBlockedUsers().then(res => {
        setBlockedUsers(res.data?.map(u => u.id) || [])
      }).catch(console.error)
    }
  }, [currentUser])

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true)
      try {
        const response = await fetchUsers(params)
        setUsers(response.data || [])
        setMeta(response.meta || { page: 1, limit: 20, total: 0 })
      } catch (error) {
        console.error('Failed to fetch users:', error)
      } finally {
        setLoading(false)
      }
    }
    loadUsers()
  }, [params])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // Search is triggered by useEffect when params.query changes
  }

  const handleSortChange = (sortBy: UserSearchParams['sortBy']) => {
    setParams((prev) => ({
      ...prev,
      sortBy,
      // Toggle order if clicking the same sort field, otherwise default to asc (or desc for createdAt)
      order: prev.sortBy === sortBy ? (prev.order === 'asc' ? 'desc' : 'asc') : (sortBy === 'createdAt' ? 'desc' : 'asc')
    }))
  }

  const handlePageChange = (newPage: number) => {
    setParams((prev) => ({ ...prev, page: newPage }))
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">User Search</h1>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Search by name..."
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={params.query ?? ''}
            onChange={(e) => setParams((prev) => ({ ...prev, query: e.target.value || undefined, page: 1 }))}
          />
        </form>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <span className="text-sm font-medium text-slate-700 self-center mr-2">Sort by:</span>
        <Button
          variant={params.sortBy === 'displayName' ? 'primary' : 'secondary'}
          onClick={() => handleSortChange('displayName')}
          className="text-xs"
        >
          Name {params.sortBy === 'displayName' && (params.order === 'asc' ? '↑' : '↓')}
        </Button>
        <Button
          variant={params.sortBy === 'createdAt' ? 'primary' : 'secondary'}
          onClick={() => handleSortChange('createdAt')}
          className="text-xs"
        >
          Joined {params.sortBy === 'createdAt' && (params.order === 'asc' ? '↑' : '↓')}
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading...</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {users?.map((user) => (
            <Link
              key={user.id}
              to={`/${user.login}`}
              className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
            >
              <div className="relative h-12 w-12 flex-shrink-0">
                <div className="h-full w-full overflow-hidden rounded-full bg-slate-100">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
                <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white ${
                  user.status === 'ONLINE' ? 'bg-green-500' : 
                  user.status === 'IN_MATCH' ? 'bg-yellow-500' : 'bg-slate-300'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="truncate font-medium text-slate-900">{user.displayName}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {currentUser?.id === user.id && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 font-medium">
                      You
                    </span>
                  )}
                  {myFriends.includes(user.id) && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700 font-medium">
                      Friend
                    </span>
                  )}
                  {sentRequests.includes(user.id) && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 font-medium">
                      Request Sent
                    </span>
                  )}
                  {blockedUsers.includes(user.id) && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700 font-medium">
                      Blocked
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {users.length === 0 && !loading && (
        <div className="py-12 text-center text-slate-500">No users found</div>
      )}

      <div className="mt-8 flex justify-center gap-2">
        <Button
          variant="secondary"
          disabled={params.page === 1 || loading}
          onClick={() => handlePageChange((params.page || 1) - 1)}
        >
          Previous
        </Button>
        <span className="flex items-center px-4 text-sm text-slate-600">
          {meta.page} / {Math.ceil(meta.total / meta.limit)}
        </span>
        <Button
          variant="secondary"
          disabled={meta.page * meta.limit >= meta.total || loading}
          onClick={() => handlePageChange((params.page || 1) + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export default UsersPage
