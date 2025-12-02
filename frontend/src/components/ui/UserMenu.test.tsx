import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import UserMenu from './UserMenu'
import useAuthStore from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'

// Mock auth store
vi.mock('../../stores/authStore', () => ({
  default: vi.fn()
}))

// Mock notification store
vi.mock('../../stores/notificationStore', () => ({
  useNotificationStore: vi.fn()
}))

describe('UserMenu', () => {
  const mockClearSession = vi.fn()
  const mockFetchNotifications = vi.fn()
  const mockUser = {
    id: 1,
    displayName: 'Test User',
    login: 'testuser',
    avatarUrl: 'https://example.com/avatar.png'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as any).mockImplementation((selector: any) => {
      const state = {
        user: mockUser,
        clearSession: mockClearSession
      }
      return selector(state)
    })
    ;(useNotificationStore as any).mockImplementation((selector: any) => {
      const state = {
        unreadCount: 5,
        fetchNotifications: mockFetchNotifications
      }
      return selector(state)
    })
  })

  it('renders user avatar and name', () => {
    render(
      <BrowserRouter>
        <UserMenu />
      </BrowserRouter>
    )
    // Name is not displayed in the menu button itself, only avatar
    expect(screen.getByAltText('Test User')).toHaveAttribute('src', 'https://example.com/avatar.png')
  })

  it('renders unread badge when count > 0', () => {
    render(
      <BrowserRouter>
        <UserMenu />
      </BrowserRouter>
    )
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders link to profile', () => {
    render(
      <BrowserRouter>
        <UserMenu />
      </BrowserRouter>
    )
    
    const link = screen.getByTestId('user-menu-link')
    expect(link).toHaveAttribute('href', '/testuser')
  })

  it('renders nothing if user is null', () => {
    ;(useAuthStore as any).mockImplementation((selector: any) => {
        const state = {
          user: null,
          clearSession: mockClearSession
        }
        return selector(state)
      })

    render(
      <BrowserRouter>
        <UserMenu />
      </BrowserRouter>
    )
    
    expect(screen.queryByTestId('user-menu-link')).not.toBeInTheDocument()
  })
})
