/**
 * Why this test is needed:
 * - To ensure the root routing element renders correctly and to detect regressions when adding pages.
 * - To guarantee that Vitest + Testing Library setup is correct.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { resetAuthStoreForTesting } from './stores/authStore'

// Mock the API to prevent network errors during tests
vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      get: vi.fn().mockImplementation((url) => {
        if (url === '/notifications') {
          return Promise.resolve({ data: { data: [] } })
        }
        if (url === '/chat/threads') {
          return Promise.resolve({ data: { data: [] } })
        }
        return Promise.resolve({ data: {} })
      }),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    }
  }
})

describe('App', () => {
  beforeEach(() => {
    resetAuthStoreForTesting()
    sessionStorage.clear()
    window.history.pushState({}, '', '/')
    vi.clearAllMocks()
  })

  it('renders site title', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'ft_transcendence' })).toBeInTheDocument()
  })

  it('shows login link when user is not authenticated', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument()
  })

  it('restores navbar state from sessionStorage snapshot', async () => {
    sessionStorage.setItem('ft_access_token', 'sample-access')
    sessionStorage.setItem('ft_refresh_token', 'sample-refresh')
    sessionStorage.setItem('ft_user', JSON.stringify({ id: 9, login: 'daisy', displayName: 'Daisy', status: 'ONLINE' }))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('navbar-auth-state')).toBeInTheDocument()
    })
    expect(screen.getByText(/Daisy/)).toBeInTheDocument()
  })

  it('renders 2FA route content', () => {
    window.history.pushState({}, '', '/auth/2fa')
    render(<App />)
    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument()
  })

  it('renders OAuth callback route content', () => {
    window.history.pushState({}, '', '/oauth/callback')
    render(<App />)
    expect(screen.getByText('OAuth Callback')).toBeInTheDocument()
  })
})
