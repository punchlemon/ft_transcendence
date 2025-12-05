import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchUsers, fetchUserFriends, fetchSentFriendRequests, fetchReceivedFriendRequests, fetchBlockedUsers, type UserSearchResponse, type UserSearchParams } from '../lib/api'
import { onChatWsEvent } from '../lib/chatWs'
import Button from '../components/ui/Button'
import UserAvatar from '../components/ui/UserAvatar'
import useAuthStore from '../stores/authStore'
import { calculateWinRate, formatWinRate, formatGamesCount } from '../utils/stats'

type FilterState = {
  query: string
  excludeOffline: boolean
  friendsOnly: boolean
  excludeBlocked: boolean
  winRateSort: 'off' | 'asc' | 'desc'
  gamesSort: 'off' | 'asc' | 'desc'
  sortOrder: ('winRate' | 'games')[]
  page: number
  limit: number
}

const DEFAULT_FILTERS: FilterState = {
  query: '',
  excludeOffline: false,
  friendsOnly: false,
  excludeBlocked: true,
  winRateSort: 'off',
  gamesSort: 'off',
  sortOrder: ['winRate', 'games'],
  page: 1,
  limit: 20
}

const STORAGE_KEY = 'ft_users_filters_v1'
const ONLINE_ONLY_STATUSES = ['ONLINE', 'IN_MATCH', 'AWAY', 'DO_NOT_DISTURB'].join(',')

const sanitizeFilters = (raw: Partial<FilterState> | null | undefined): FilterState => {
  const next = { ...DEFAULT_FILTERS }
  if (!raw || typeof raw !== 'object') return next

  if (typeof raw.query === 'string') next.query = raw.query
  if (typeof raw.excludeOffline === 'boolean') next.excludeOffline = raw.excludeOffline
  if (typeof raw.friendsOnly === 'boolean') next.friendsOnly = raw.friendsOnly
  if (typeof raw.excludeBlocked === 'boolean') next.excludeBlocked = raw.excludeBlocked
  if (raw.winRateSort === 'off' || raw.winRateSort === 'asc' || raw.winRateSort === 'desc') next.winRateSort = raw.winRateSort
  if (raw.gamesSort === 'off' || raw.gamesSort === 'asc' || raw.gamesSort === 'desc') next.gamesSort = raw.gamesSort
  if (Array.isArray(raw.sortOrder) && raw.sortOrder.every(s => s === 'winRate' || s === 'games')) next.sortOrder = raw.sortOrder

  const page = Number(raw.page)
  if (Number.isInteger(page) && page > 0) next.page = page

  const limit = Number(raw.limit)
  if (Number.isInteger(limit) && limit > 0 && limit <= 50) next.limit = limit

  return next
}

const buildSearchParams = (state: FilterState): UserSearchParams => {
  const trimmedQuery = state.query.trim()
  
  // Build relationships filter: AND logic
  // Always respect both friendsOnly and excludeBlocked simultaneously
  const rels: string[] = []
  
  if (state.friendsOnly) {
    // Friends only: include only friends
    rels.push('friends')
  } else {
    // Include all relationship types except blocked (if excludeBlocked is ON)
    rels.push('friends')
    rels.push('pending_sent')
    rels.push('pending_received')
    rels.push('none')
  }
  
  // If Exclude Blocked is OFF, add blocked to the list
  if (!state.excludeBlocked) {
    rels.push('blocked')
  }
  
  const relationships = rels.join(',')

  return {
    page: state.page,
    limit: state.limit,
    query: trimmedQuery.length > 0 ? trimmedQuery : undefined,
    statuses: state.excludeOffline ? ONLINE_ONLY_STATUSES : undefined,
    relationships,
    sortBy: 'displayName',
    order: 'asc',
    winRateSort: state.winRateSort,
    gamesSort: state.gamesSort,
    sortOrder: state.sortOrder.join(',')
  }
}

const UsersPage = () => {
  const [users, setUsers] = useState<UserSearchResponse['data']>([])
  const [draggedSort, setDraggedSort] = useState<'winRate' | 'games' | null>(null)
  const [filters, setFilters] = useState<FilterState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return DEFAULT_FILTERS
      const parsed = JSON.parse(raw) as Partial<FilterState>
      return sanitizeFilters(parsed)
    } catch (error) {
      console.error('Failed to parse users filters from storage', error)
      return DEFAULT_FILTERS
    }
  })
  const [meta, setMeta] = useState<UserSearchResponse['meta']>({ page: filters.page, limit: filters.limit, total: 0 })
  const [loading, setLoading] = useState(false)
  const { user: currentUser } = useAuthStore()
  const [myFriends, setMyFriends] = useState<number[]>([])
  const [sentRequests, setSentRequests] = useState<number[]>([])
  const [receivedRequests, setReceivedRequests] = useState<number[]>([])
  const [blockedUsers, setBlockedUsers] = useState<number[]>([])

  const toggleExcludeOffline = () => {
    setFilters((prev) => ({ ...prev, excludeOffline: !prev.excludeOffline, page: 1 }))
  }

  const toggleFriendsOnly = () => {
    setFilters((prev) => ({ ...prev, friendsOnly: !prev.friendsOnly, page: 1 }))
  }

  const toggleExcludeBlocked = () => {
    setFilters((prev) => ({ ...prev, excludeBlocked: !prev.excludeBlocked, page: 1 }))
  }

  const toggleWinRateSort = () => {
    setFilters((prev) => {
      const nextSort = prev.winRateSort === 'off' ? 'asc' : prev.winRateSort === 'asc' ? 'desc' : 'off'
      return { ...prev, winRateSort: nextSort, page: 1 }
    })
  }

  const toggleGamesSort = () => {
    setFilters((prev) => {
      const nextSort = prev.gamesSort === 'off' ? 'asc' : prev.gamesSort === 'asc' ? 'desc' : 'off'
      return { ...prev, gamesSort: nextSort, page: 1 }
    })
  }

  const handleSortOrderDragStart = (e: React.DragEvent, sortType: 'winRate' | 'games') => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', sortType)
    setDraggedSort(sortType)
    // Make drag image invisible (we'll use CSS for visual feedback)
    const img = new Image()
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    e.dataTransfer.setDragImage(img, 0, 0)
  }

  const handleSortOrderDragEnd = () => {
    setDraggedSort(null)
  }

  const handleSortOrderDragEnter = (e: React.DragEvent, targetType: 'winRate' | 'games') => {
    e.preventDefault()
    if (!draggedSort || draggedSort === targetType) return

    // Swap positions dynamically when dragging over another button
    setFilters((prev) => {
      const newOrder = [...prev.sortOrder]
      const sourceIndex = newOrder.indexOf(draggedSort)
      const targetIndex = newOrder.indexOf(targetType)
      
      if (sourceIndex !== -1 && targetIndex !== -1) {
        newOrder[sourceIndex] = targetType
        newOrder[targetIndex] = draggedSort
      }
      
      return { ...prev, sortOrder: newOrder }
    })
  }

  const handleSortOrderDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDraggedSort(null)
  }

  const handleSortOrderDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
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
        const searchParams = buildSearchParams(filters)
        const response = await fetchUsers(searchParams)
        setUsers(response.data || [])
        setMeta(response.meta || { page: filters.page, limit: filters.limit, total: 0 })
      } catch (error) {
        console.error('Failed to fetch users:', error)
      } finally {
        setLoading(false)
      }
    }
    loadUsers()
  }, [filters])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
    } catch (error) {
      console.error('Failed to persist users filters', error)
    }
  }, [filters])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // Input changes update filter state, so form submission is just prevented
  }

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }))
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
              value={filters.query}
              onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value, page: 1 }))}
            />
          </form>
        </div>

        <div className="flex flex-col gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filters:</span>
            <Button
              type="button"
              variant={filters.friendsOnly ? 'primary' : 'secondary'}
              onClick={toggleFriendsOnly}
              className="text-xs py-1 px-2 h-auto"
            >
              Friends Only
            </Button>
            <Button
              type="button"
              variant={filters.excludeOffline ? 'primary' : 'secondary'}
              onClick={toggleExcludeOffline}
              className="text-xs py-1 px-2 h-auto"
            >
              Exclude Offline
            </Button>
            <Button
              type="button"
              variant={filters.excludeBlocked ? 'primary' : 'secondary'}
              onClick={toggleExcludeBlocked}
              className="text-xs py-1 px-2 h-auto"
            >
              Exclude Blocked
            </Button>
          </div>

          {/* Sort Row */}
          <div className="flex flex-wrap gap-2 items-center border-t border-slate-100 pt-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sort By:</span>
            <div className="flex gap-2 items-center">
              {filters.sortOrder.map((sortType) => {
                const isWinRate = sortType === 'winRate'
                const sortValue = isWinRate ? filters.winRateSort : filters.gamesSort
                const toggleFn = isWinRate ? toggleWinRateSort : toggleGamesSort
                const label = isWinRate ? 'Win Rate' : 'Games'
                const isDragging = draggedSort === sortType
                
                return (
                  <div
                    key={sortType}
                    className={`relative transition-all duration-200 ${
                      isDragging ? 'opacity-50 scale-105' : 'opacity-100 scale-100'
                    }`}
                  >
                    <Button
                      variant={sortValue !== 'off' ? 'primary' : 'secondary'}
                      onClick={toggleFn}
                      draggable
                      onDragStart={(e) => handleSortOrderDragStart(e, sortType)}
                      onDragEnd={handleSortOrderDragEnd}
                      onDragEnter={(e) => handleSortOrderDragEnter(e, sortType)}
                      onDragOver={handleSortOrderDragOver}
                      onDrop={handleSortOrderDrop}
                      className="text-xs py-1 px-3 h-auto cursor-grab active:cursor-grabbing select-none flex items-center gap-1"
                    >
                      <span className="text-slate-400">⋮⋮</span>
                      {label} {sortValue === 'asc' ? '↑' : sortValue === 'desc' ? '↓' : ''}
                    </Button>
                  </div>
                )
              })}
            </div>
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
              <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="truncate font-medium text-slate-900">{user.displayName}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
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
                <div className="flex flex-col items-end text-xs text-slate-600 flex-shrink-0">
                  <div className="font-medium">{formatWinRate(calculateWinRate(user.wins, user.gamesPlayed))}</div>
                  <div className="text-slate-500">{formatGamesCount(user.gamesPlayed)}</div>
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
          disabled={filters.page === 1 || loading}
          onClick={() => handlePageChange((filters.page || 1) - 1)}
        >
          Previous
        </Button>
        <span className="flex items-center px-4 text-sm text-slate-600">
          {meta.page} / {Math.max(1, Math.ceil(meta.total / meta.limit))}
        </span>
        <Button
          variant="secondary"
          disabled={meta.page * meta.limit >= meta.total || loading}
          onClick={() => handlePageChange((filters.page || 1) + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export default UsersPage
/*
Explanation:

1) FilterState / DEFAULT_FILTERS / sanitizeFilters
  - Combines 3 toggles (Exclude Offline / Friends Only / Exclude Blocked) with search/sort conditions.
  - Initializes with "Exclude Offline" OFF (shows both online and offline) and "Exclude Blocked" ON by default.
  - `sanitizeFilters` validates persisted `localStorage` values and falls back to safe defaults.

2) buildSearchParams & AND Logic
  - Converts FilterState into API parameters using AND logic:
    * If "Friends Only" is ON, only 'friends' relationship is sent (overrides other settings).
    * Otherwise, builds relationship list from other toggles (blocked only included if "Exclude Blocked" is OFF).
    * If "Exclude Offline" is ON, sends only online statuses; if OFF, omits statuses (backend returns all).
  - All active filters must be satisfied simultaneously.

3) localStorage Persistence
  - Stores filter state in `ft_users_filters_v1`.
  - Restored on page reload via `useState` initializer, preserving user's last filter selection.

4) Filter Button UI
  - 3 buttons only, refined from unnecessary relationship/status options.
  - Toggle resets page to 1 for fresh results.

5) Data Fetching & Pagination
  - Watches filter changes and re-fetches users.
  - Falls back to current page/limit if meta is missing, ensuring stable pagination display.
*/
