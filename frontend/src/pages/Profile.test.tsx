import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProfilePage from './Profile'
import useAuthStore from '../stores/authStore'

// Mock auth store
vi.mock('../stores/authStore', () => ({
  default: vi.fn(),
}))

describe('ProfilePage', () => {
  const mockUser = {
    id: 'user-123',
    displayName: 'Test User',
    email: 'test@example.com',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementation for auth store
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({
        user: mockUser,
      })
    )
  })

  it('renders loading state initially', () => {
    render(
      <MemoryRouter initialEntries={['/profile/user-123']}>
        <Routes>
          <Route path="/profile/:id" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Loading profile...')).toBeInTheDocument()
  })

  it('renders profile data after loading', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/user-123']}>
        <Routes>
          <Route path="/profile/:id" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('User user-123')).toBeInTheDocument()
    })
    expect(screen.getByText('#user')).toBeInTheDocument()
    expect(screen.getByText('Pong enthusiast. Love to play standard mode.')).toBeInTheDocument()
  })

  it('shows edit button for own profile', async () => {
    // Mock auth store to return the same ID as the URL
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({
        user: { ...mockUser, id: 'user-123' },
      })
    )

    render(
      <MemoryRouter initialEntries={['/profile/user-123']}>
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
        user: { ...mockUser, id: 'other-user' },
      })
    )

    render(
      <MemoryRouter initialEntries={['/profile/user-123']}>
        <Routes>
          <Route path="/profile/:id" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.queryByText('Edit Profile')).not.toBeInTheDocument()
    })
  })

  it('renders stats and match history', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/user-123']}>
        <Routes>
          <Route path="/profile/:id" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Statistics')).toBeInTheDocument()
    })
    expect(screen.getByText('80.7%')).toBeInTheDocument() // Win Rate
    expect(screen.getByText('Match History')).toBeInTheDocument()
    expect(screen.getByText('Rival 1')).toBeInTheDocument()
    expect(screen.getByText('WIN (11 - 9)')).toBeInTheDocument()
  })

  it('renders error state for invalid user', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/not-found']}>
        <Routes>
          <Route path="/profile/:id" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('User not found')).toBeInTheDocument()
    })
  })
})
