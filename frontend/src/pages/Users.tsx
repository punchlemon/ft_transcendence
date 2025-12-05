import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchUsers, fetchUserFriends, fetchSentFriendRequests, fetchReceivedFriendRequests, fetchBlockedUsers, type UserSearchResponse, type UserSearchParams } from '../lib/api'
import { onChatWsEvent } from '../lib/chatWs'
import Button from '../components/ui/Button'
import UserAvatar from '../components/ui/UserAvatar'
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
    query: undefined,
    statuses: 'ONLINE,OFFLINE,IN_MATCH',
    relationships: 'friends,blocked,pending_sent,pending_received,none'
  })
  const { user: currentUser } = useAuthStore()
  const [myFriends, setMyFriends] = useState<number[]>([])
  const [sentRequests, setSentRequests] = useState<number[]>([])
  const [receivedRequests, setReceivedRequests] = useState<number[]>([])
  const [blockedUsers, setBlockedUsers] = useState<number[]>([])

  const toggleStatus = (status: string) => {
    const current = params.statuses ? params.statuses.split(',') : []
    let next: string[]
    if (current.includes(status)) {
      next = current.filter(s => s !== status)
    } else {
      next = [...current, status]
    }
    setParams(prev => ({ ...prev, statuses: next.join(','), page: 1 }))
  }

  const toggleRelationship = (rel: string) => {
    const current = params.relationships ? params.relationships.split(',') : []
    let next: string[]
    if (current.includes(rel)) {
      next = current.filter(r => r !== rel)
    } else {
      next = [...current, rel]
    }
    setParams(prev => ({ ...prev, relationships: next.join(','), page: 1 }))
  }

  useEffect(() => {
    const unsubscribeFriend = onChatWsEvent('friend_update', (data) => {
      if (data.status === 'FRIEND') {
        setMyFriends(prev => {
          if (prev.includes(data.friendId)) return prev
          return [...prev, data.friendId]
        })
        setSentRequests(prev => prev.filter(id => id !== data.friendId))
        setReceivedRequests(prev => prev.filter(id => id !== data.friendId))
      } else if (data.status === 'PENDING_SENT') {
        setSentRequests(prev => {
          if (prev.includes(data.friendId)) return prev
          return [...prev, data.friendId]
        })
      } else if (data.status === 'PENDING_RECEIVED') {
        setReceivedRequests(prev => {
          if (prev.includes(data.friendId)) return prev
          return [...prev, data.friendId]
        })
      } else if (data.status === 'NONE') {
        setMyFriends(prev => prev.filter(id => id !== data.friendId))
        setSentRequests(prev => prev.filter(id => id !== data.friendId))
        setReceivedRequests(prev => prev.filter(id => id !== data.friendId))
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

    const unsubscribeUserUpdate = onChatWsEvent('user_update', (data) => {
      setUsers(prev => prev.map(u => {
        if (u.id === data.id) {
          return { ...u, ...data }
        }
        return u
      }))
    })

    return () => {
      unsubscribeFriend()
      unsubscribeRelationship()
      unsubscribeUserUpdate()
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

      fetchReceivedFriendRequests().then(res => {
        setReceivedRequests(res.data?.map(r => r.sender?.id).filter((id): id is number => !!id) || [])
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
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900">User Search</h1>
          <form onSubmit={handleSearch} className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search by name..."
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-64"
              value={params.query ?? ''}
              onChange={(e) => setParams((prev) => ({ ...prev, query: e.target.value || undefined, page: 1 }))}
            />
          </form>
        </div>

        <div className="flex flex-col gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          {/* Filters Row */}
          <div className="flex flex-wrap gap-y-2 gap-x-6 items-center">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status:</span>
              {['ONLINE', 'OFFLINE', 'IN_MATCH'].map(status => (
                <Button
                  key={status}
                  type="button"
                  variant={params.statuses?.split(',').includes(status) ? 'primary' : 'secondary'}
                  onClick={() => toggleStatus(status)}
                  className="text-xs py-1 px-2 h-auto"
                >
                  {status.replace('_', ' ')}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Relationship:</span>
              {[
                { id: 'friends', label: 'Friends' },
                { id: 'pending_sent', label: 'Sent' },
                { id: 'pending_received', label: 'Received' },
                { id: 'blocked', label: 'Blocked' },
                { id: 'none', label: 'Others' }
              ].map(rel => (
                <Button
                  key={rel.id}
                  type="button"
                  variant={params.relationships?.split(',').includes(rel.id) ? 'primary' : 'secondary'}
                  onClick={() => toggleRelationship(rel.id)}
                  className="text-xs py-1 px-2 h-auto"
                >
                  {rel.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Sort Row */}
          <div className="flex flex-wrap gap-2 items-center border-t border-slate-100 pt-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sort by:</span>
            <Button
              variant={params.sortBy === 'displayName' ? 'primary' : 'secondary'}
              onClick={() => handleSortChange('displayName')}
              className="text-xs py-1 px-2 h-auto"
            >
              Name {params.sortBy === 'displayName' && (params.order === 'asc' ? '↑' : '↓')}
            </Button>
            <Button
              variant={params.sortBy === 'createdAt' ? 'primary' : 'secondary'}
              onClick={() => handleSortChange('createdAt')}
              className="text-xs py-1 px-2 h-auto"
            >
              Joined {params.sortBy === 'createdAt' && (params.order === 'asc' ? '↑' : '↓')}
            </Button>
          </div>
        </div>
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
              <UserAvatar 
                user={user}
                size="md"
                className="flex-shrink-0"
                linkToProfile={false}
              />
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
                  {receivedRequests.includes(user.id) && (
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-yellow-700 font-medium">
                      Request Received
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
