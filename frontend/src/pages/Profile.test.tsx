import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProfilePage from './Profile'
import useAuthStore from '../stores/authStore'
import { fetchUserProfile } from '../lib/api'

// Mock auth store
vi.mock('../stores/authStore', () => ({
  default: vi.fn(),
}))

// Mock api
vi.mock('../lib/api', () => ({
  fetchUserProfile: vi.fn(),
}))

describe('ProfilePage', () => {
  const mockUser = {
    id: 123,
    displayName: 'Test User',
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
  })

  it('renders loading state initially', () => {
    // Mock promise that never resolves to keep loading state
    ;(fetchUserProfile as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}))

    render(
      <MemoryRouter initialEntries={['/profile/123']}>
        <Routes>
          <Route path="/profile/:id" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Loading profile...')).toBeInTheDocument()
  })

  it('renders profile data after loading', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/123']}>
        <Routes>
          <Route path="/profile/:id" element={<ProfilePage />} />
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
    // Mock auth store to return the same ID as the URL
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({
        user: { ...mockUser, id: 123 },
      })
    )

    render(
      <MemoryRouter initialEntries={['/profile/123']}>
        <Routes>
          <Route path="/profile/:id" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Edit Profile')).toBeInTheDocument()
    })
  })

  it('hides edit button for other profile', async () => {
    // Mock auth store to return a different ID
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({
        user: { ...mockUser, id: 456 },
      })
    )

    render(
      <MemoryRouter initialEntries={['/profile/123']}>
        <Routes>
          <Route path="/profile/:id" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.queryByText('Edit Profile')).not.toBeInTheDocument()
    })
  })

  it('renders stats', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/123']}>
        <Routes>
          <Route path="/profile/:id" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Statistics')).toBeInTheDocument()
    })
    // 42 / 52 * 100 = 80.76 -> 81%
    expect(screen.getByText('81%')).toBeInTheDocument() // Win Rate
  })

  it('renders error state for invalid user', async () => {
    ;(fetchUserProfile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('User not found'))

    render(
      <MemoryRouter initialEntries={['/profile/999']}>
        <Routes>
          <Route path="/profile/:id" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load profile')).toBeInTheDocument()
    })
  })
})
