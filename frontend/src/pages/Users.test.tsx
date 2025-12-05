// このテストはユーザー検索ページの3種類のフィルタと永続化が正しくAPIパラメータへ反映されることを保証するために必要。
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import UsersPage from './Users'
import useAuthStore from '../stores/authStore'

const ONLINE_ONLY_STATUSES = 'ONLINE,IN_MATCH,AWAY,DO_NOT_DISTURB'
const STORAGE_KEY = 'ft_users_filters_v1'

const fetchUsersMock = vi.fn()
const fetchUserFriendsMock = vi.fn()
const fetchSentFriendRequestsMock = vi.fn()
const fetchReceivedFriendRequestsMock = vi.fn()
const fetchBlockedUsersMock = vi.fn()

vi.mock('../stores/authStore', () => ({
  default: vi.fn()
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  },
  fetchUsers: (...args: unknown[]) => fetchUsersMock(...args),
  fetchUserFriends: (...args: unknown[]) => fetchUserFriendsMock(...args),
  fetchSentFriendRequests: (...args: unknown[]) => fetchSentFriendRequestsMock(...args),
  fetchReceivedFriendRequests: (...args: unknown[]) => fetchReceivedFriendRequestsMock(...args),
  fetchBlockedUsers: (...args: unknown[]) => fetchBlockedUsersMock(...args)
}))

vi.mock('../lib/chatWs', () => ({
  onChatWsEvent: vi.fn().mockImplementation(() => vi.fn())
}))

describe('UsersPage フィルタと永続化', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    fetchUsersMock.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } })
    fetchUserFriendsMock.mockResolvedValue({ data: [] })
    fetchSentFriendRequestsMock.mockResolvedValue({ data: [] })
    fetchReceivedFriendRequestsMock.mockResolvedValue({ data: [] })
    fetchBlockedUsersMock.mockResolvedValue({ data: [] })
    ;(useAuthStore as unknown as Mock).mockReturnValue({ user: { id: 1, displayName: 'Viewer' } })
    localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  const renderPage = () => render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>
  )

  it('initial state includes offline and blocks are excluded', async () => {
    renderPage()

    await waitFor(() => expect(fetchUsersMock).toHaveBeenCalled())
    const firstCall = fetchUsersMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(firstCall.statuses).toBeUndefined()
    expect(firstCall.relationships).toBe('friends,pending_sent,pending_received,none')
  })

  it('toggle updates API parameters with AND logic', async () => {
    renderPage()
    await waitFor(() => expect(fetchUsersMock).toHaveBeenCalledTimes(1))

    // Initial state: excludeBlocked ON, friendsOnly OFF, excludeOffline OFF
    let lastCall = fetchUsersMock.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.relationships).not.toContain('blocked')
    expect(lastCall.statuses).toBeUndefined()

    // Toggle: Exclude Offline ON
    await user.click(screen.getByRole('button', { name: 'Exclude Offline' }))
    await waitFor(() => expect(fetchUsersMock).toHaveBeenCalledTimes(2))
    lastCall = fetchUsersMock.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.statuses).toBe(ONLINE_ONLY_STATUSES)

    // Toggle: Friends Only ON (excludeBlocked still ON - AND logic)
    await user.click(screen.getByRole('button', { name: 'Friends Only' }))
    await waitFor(() => expect(fetchUsersMock).toHaveBeenCalledTimes(3))
    lastCall = fetchUsersMock.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.relationships).toBe('friends') // Only friends, NOT blocked

    // Toggle: Exclude Blocked OFF (friendsOnly still ON - AND logic)
    await user.click(screen.getByRole('button', { name: 'Exclude Blocked' }))
    await waitFor(() => expect(fetchUsersMock).toHaveBeenCalledTimes(4))
    lastCall = fetchUsersMock.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.relationships).toBe('friends,blocked') // Friends AND blocked users

    // Toggle: Exclude Blocked back ON
    await user.click(screen.getByRole('button', { name: 'Exclude Blocked' }))
    await waitFor(() => expect(fetchUsersMock).toHaveBeenCalledTimes(5))
    lastCall = fetchUsersMock.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.relationships).toBe('friends') // Back to just friends
  })

  it('restores filters from localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      query: 'alice',
      excludeOffline: true,
      friendsOnly: false,
      excludeBlocked: false,
      winRateSort: 'asc',
      page: 2,
      limit: 20
    }))

    renderPage()

    expect(screen.getByPlaceholderText('Search by name...')).toHaveValue('alice')
    await waitFor(() => expect(fetchUsersMock).toHaveBeenCalled())

    const call = fetchUsersMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.query).toBe('alice')
    expect(call.statuses).toBe(ONLINE_ONLY_STATUSES)
    expect(call.relationships).toContain('blocked')
    expect(call.relationships).toContain('friends')
    expect(call.sortBy).toBe('displayName')
    expect(call.order).toBe('asc')
    expect(call.winRateSort).toBe('asc')
    expect(call.page).toBe(2)
  })
})
