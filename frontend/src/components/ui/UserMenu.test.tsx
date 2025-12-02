import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import UserMenu from './UserMenu'
import useAuthStore from '../../stores/authStore'

// Mock auth store
vi.mock('../../stores/authStore', () => ({
  default: vi.fn()
}))

describe('UserMenu', () => {
  const mockClearSession = vi.fn()
  const mockUser = {
    id: 1,
    displayName: 'Test User',
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
  })

  it('renders user avatar and name', () => {
    render(
      <BrowserRouter>
        <UserMenu />
      </BrowserRouter>
    )
    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByAltText('Test User')).toHaveAttribute('src', 'https://example.com/avatar.png')
  })

  it('toggles dropdown on click', () => {
    render(
      <BrowserRouter>
        <UserMenu />
      </BrowserRouter>
    )
    
    const button = screen.getByTestId('user-menu-button')
    
    // Initially closed
    expect(screen.queryByText('マイプロフィール')).not.toBeInTheDocument()
    
    // Open
    fireEvent.click(button)
    expect(screen.getByText('マイプロフィール')).toBeInTheDocument()
    expect(screen.getByText('設定')).toBeInTheDocument()
    expect(screen.getByText('ログアウト')).toBeInTheDocument()
    
    // Close
    fireEvent.click(button)
    expect(screen.queryByText('マイプロフィール')).not.toBeInTheDocument()
  })

  it('calls clearSession on logout click', () => {
    render(
      <BrowserRouter>
        <UserMenu />
      </BrowserRouter>
    )
    
    fireEvent.click(screen.getByTestId('user-menu-button'))
    fireEvent.click(screen.getByText('ログアウト'))
    
    expect(mockClearSession).toHaveBeenCalled()
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
    
    expect(screen.queryByTestId('user-menu-button')).not.toBeInTheDocument()
  })
})
