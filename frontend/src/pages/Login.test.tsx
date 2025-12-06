/**
 * Why this test is needed:
 * - To ensure login form validation/submission flow works correctly.
 * - To cover MFA requirements and OAuth redirects, preventing regressions during UI updates.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import LoginPage from './Login'
import { login, fetchOAuthAuthorizationUrl } from '../lib/api'
import { getOAuthStorageKeys } from '../lib/oauth'
import useAuthStore, { resetAuthStoreForTesting } from '../stores/authStore'

type LoginResponse = Awaited<ReturnType<typeof login>>

type OAuthUrlResponse = Awaited<ReturnType<typeof fetchOAuthAuthorizationUrl>>

vi.mock('../lib/api', () => ({
  login: vi.fn(),
  fetchOAuthAuthorizationUrl: vi.fn()
}))
const mockedLogin = vi.mocked(login)
const mockedFetchOAuthUrl = vi.mocked(fetchOAuthAuthorizationUrl)

const createAxiosError = <T,>(status: number, data: T) => {
  const response = {
    status,
    statusText: 'Error',
    config: {} as never,
    headers: {},
    data
  } as AxiosResponse<T>
  const error = new AxiosError<T>('Request failed')
  error.response = response
  return error
}



describe('LoginPage', () => {
  const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

  beforeEach(() => {
    mockedLogin.mockReset()
    mockedFetchOAuthUrl.mockReset()
    resetAuthStoreForTesting()
    sessionStorage.clear()
    openSpy.mockClear()
  })

  afterAll(() => {
    openSpy.mockRestore()
  })

  it('submits login form and stores tokens on success', async () => {
    const user = userEvent.setup()
    const apiResponse: LoginResponse = {
      user: { id: 1, displayName: 'Alice', login: 'alice', status: 'ONLINE' },
      tokens: { access: 'access-token', refresh: 'refresh-token' },
      mfaRequired: false
    }
    mockedLogin.mockResolvedValue(apiResponse)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText('Email Address'), 'Alice@example.com ')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Login with Email' }))

    expect(mockedLogin).toHaveBeenCalledWith({ email: 'alice@example.com', password: 'password123' })
    expect(await screen.findByText('Logged in successfully as Alice.')).toBeInTheDocument()
    expect(sessionStorage.getItem('ft_access_token')).toBe('access-token')
    expect(sessionStorage.getItem('ft_refresh_token')).toBe('refresh-token')
    expect(sessionStorage.getItem('ft_user')).toBe(
      JSON.stringify({ id: 1, displayName: 'Alice', login: 'alice', status: 'ONLINE' })
    )
    expect(useAuthStore.getState().user?.displayName).toBe('Alice')
  })

  it('shows validation error when input is empty and does not call API', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Login with Email' }))

    expect(screen.getByText('Please enter your email address.')).toBeInTheDocument()
    expect(mockedLogin).not.toHaveBeenCalled()
  })

  it('surfaces MFA required message when API returns 423', async () => {
    const user = userEvent.setup()
    mockedLogin.mockRejectedValue(
      createAxiosError(423, {
        error: { code: 'MFA_REQUIRED', message: 'Two-factor required' },
        mfaRequired: true,
        challengeId: 'challenge-123'
      })
    )

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText('Email Address'), 'user@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Login with Email' }))

    expect(await screen.findByText('Two-factor authentication required.')).toBeInTheDocument()
    const stored = sessionStorage.getItem('ft_mfa_challenge')
    expect(stored ? JSON.parse(stored) : null).toEqual({ id: 'challenge-123', redirectTo: '/', emailOrName: 'user@example.com' })
    expect(screen.getByRole('link', { name: 'Open 2FA Code Entry Page' })).toHaveAttribute('href', '/auth/2fa')
  })

  it('redirects to OAuth provider when button is clicked', async () => {
    const user = userEvent.setup()
    mockedFetchOAuthUrl.mockResolvedValue({
      authorizationUrl: 'https://oauth.example/authorize',
      state: 'state-1',
      codeChallenge: 'challenge-abc',
      expiresIn: 600
    } as OAuthUrlResponse)
    const { stateKey, providerKey, codeChallengeKey } = getOAuthStorageKeys()

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Login with Google' }))

    await waitFor(() => {
      expect(mockedFetchOAuthUrl).toHaveBeenCalled()
    })
    expect(sessionStorage.getItem(stateKey)).toBe('state-1')
    expect(sessionStorage.getItem(providerKey)).toBe('google')
    expect(sessionStorage.getItem(codeChallengeKey)).toBe('challenge-abc')
    expect(openSpy).toHaveBeenCalledWith('https://oauth.example/authorize', '_self')
  })
})
