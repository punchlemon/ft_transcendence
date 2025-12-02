import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProfilePage from './Profile'
import useAuthStore from '../stores/authStore'
import { fetchUserProfile, fetchUserMatches, fetchUserFriends } from '../lib/api'

// Mock auth store
vi.mock('../stores/authStore', () => ({
  default: vi.fn(),
}))

// Mock api
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
  fetchUserProfile: vi.fn(),
  fetchUserMatches: vi.fn(),
  fetchUserFriends: vi.fn(),
  acceptFriendRequest: vi.fn(),
  sendFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  inviteToGame: vi.fn(),
}))

describe('ProfilePage', () => {
  const mockUser = {
    id: 123,
    displayName: 'Test User',
    login: 'user123',
    email: 'test@example.com',
  }

  const mockProfileResponse = {
    id: 123,
    displayName: 'User 123',
    login: 'user123',
    status: 'ONLINE',
    avatarUrl: 'https://via.placeholder.com/150',
    bio: 'Pong enthusiast. Love to play standard mode.',
    createdAt: '2025-01-01',
    stats: {
      wins: 42,
      losses: 10,
      matchesPlayed: 52,
      pointsScored: 500,
      pointsAgainst: 400
    },
    ladder: {
      tier: 'GOLD',
      division: 1,
      mmr: 1500
    },
    friendshipStatus: 'NONE',
    mutualFriends: 0
  }

  const mockMatchesResponse = {
    data: [
      {
        id: 1,
        date: '2025-01-02T10:00:00Z',
        mode: 'STANDARD',
        result: 'WIN',
        score: '11-5',
        opponent: {
          id: 456,
          displayName: 'Opponent 1',
          avatarUrl: null
        }
      },
      {
        id: 2,
        date: '2025-01-01T15:00:00Z',
        mode: 'PARTY',
        result: 'LOSS',
        score: '9-11',
        opponent: {
          id: 789,
          displayName: 'Opponent 2',
          avatarUrl: null
        }
      }
    ],
    pagination: {
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1
    }
  }

  const mockFriendsResponse = {
    data: [
      {
        id: 999,
        displayName: 'Best Friend',
        status: 'ONLINE',
        avatarUrl: 'https://via.placeholder.com/40'
      }
    ],
    pagination: {
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementation for auth store
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({
        user: mockUser,
      })
    )
    // Default mock implementation for api
    ;(fetchUserProfile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockProfileResponse)
    ;(fetchUserMatches as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockMatchesResponse)
    ;(fetchUserFriends as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockFriendsResponse)
  })

  it('renders loading state initially', () => {
    // Mock promise that never resolves to keep loading state
    ;(fetchUserProfile as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}))

    render(
      <MemoryRouter initialEntries={['/user123']}>
        <Routes>
          <Route path="/:username" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Loading profile...')).toBeInTheDocument()
  })

  it('renders profile data after loading', async () => {
    render(
      <MemoryRouter initialEntries={['/user123']}>
        <Routes>
          <Route path="/:username" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('User 123')).toBeInTheDocument()
    })
    expect(screen.getByText('#user123')).toBeInTheDocument()
    expect(screen.getByText('Pong enthusiast. Love to play standard mode.')).toBeInTheDocument()
  })

  it('shows edit button for own profile', async () => {
    // Mock auth store to return the same login as the URL
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({
        user: { ...mockUser, login: 'user123' },
      })
    )

    render(
      <MemoryRouter initialEntries={['/user123']}>
        <Routes>
          <Route path="/:username" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Edit Profile')).toBeInTheDocument()
    })
  })

  it('hides edit button for other profile', async () => {
    // Mock auth store to return a different login
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({
        user: { ...mockUser, login: 'otheruser' },
      })
    )

    render(
      <MemoryRouter initialEntries={['/user123']}>
        <Routes>
          <Route path="/:username" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.queryByText('Edit Profile')).not.toBeInTheDocument()
    })
  })

  it('renders stats', async () => {
    render(
      <MemoryRouter initialEntries={['/user123']}>
        <Routes>
          <Route path="/:username" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Statistics')).toBeInTheDocument()
    })
    // 42 / 52 * 100 = 80.76 -> 81%
    expect(screen.getByText('81%')).toBeInTheDocument() // Win Rate
  })

  it('renders match history', async () => {
    render(
      <MemoryRouter initialEntries={['/user123']}>
        <Routes>
          <Route path="/:username" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Match History')).toBeInTheDocument()
    })
    expect(screen.getByText('Opponent 1')).toBeInTheDocument()
    expect(screen.getByText('WIN (11-5)')).toBeInTheDocument()
    expect(screen.getByText('Opponent 2')).toBeInTheDocument()
    expect(screen.getByText('LOSS (9-11)')).toBeInTheDocument()
  })

  it('renders friends list', async () => {
    render(
      <MemoryRouter initialEntries={['/user123']}>
        <Routes>
          <Route path="/:username" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Friends')).toBeInTheDocument()
    })
    expect(screen.getByText('Best Friend')).toBeInTheDocument()
  })

  it('renders error state for invalid user', async () => {
    ;(fetchUserProfile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('User not found'))

    render(
      <MemoryRouter initialEntries={['/nonexistent']}>
        <Routes>
          <Route path="/:username" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load profile')).toBeInTheDocument()
    })
  })

  it('shows logout button for own profile', async () => {
    // Mock auth store to return the same login as the URL
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({
        user: { ...mockUser, login: 'user123' },
        clearSession: vi.fn()
      })
    )

    render(
      <MemoryRouter initialEntries={['/user123']}>
        <Routes>
          <Route path="/:username" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument()
    })
  })
})
