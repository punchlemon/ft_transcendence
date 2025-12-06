/**
 * Why this test is needed:
 * - To ensure OAuth callback processing works correctly, preventing login failures.
 * - To cover state verification, MFA flows, and API errors, preventing regressions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, type AxiosResponse } from 'axios'
import OAuthCallbackPage from './OAuthCallback'
import { completeOAuthCallback } from '../lib/api'
import {
  clearOAuthRequestContext,
  resolveOAuthRedirectUri,
  saveOAuthRequestContext
} from '../lib/oauth'
import { resetAuthStoreForTesting } from '../stores/authStore'

type CallbackResponse = Awaited<ReturnType<typeof completeOAuthCallback>>

vi.mock('../lib/api', () => ({
  completeOAuthCallback: vi.fn()
}))
const mockedComplete = vi.mocked(completeOAuthCallback)

const renderWithRouter = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      </Routes>
    </MemoryRouter>
  )

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

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    resetAuthStoreForTesting()
    sessionStorage.clear()
    clearOAuthRequestContext()
    mockedComplete.mockReset()
  })

  it('completes OAuth login and stores tokens', async () => {
    saveOAuthRequestContext({ state: 'state-1', provider: 'google', codeChallenge: null })
    const apiResponse: CallbackResponse = {
      user: { id: 1, displayName: 'Alice', login: 'alice', status: 'ONLINE' },
      tokens: { access: 'access-token', refresh: 'refresh-token' },
      mfaRequired: false,
      challengeId: null,
      oauthProvider: 'google'
    }
    mockedComplete.mockResolvedValue(apiResponse)

    const expectedRedirectUri = resolveOAuthRedirectUri()

    renderWithRouter('/oauth/callback?code=abc&state=state-1')

    await waitFor(() => {
      expect(mockedComplete).toHaveBeenCalledWith('google', {
        code: 'abc',
        state: 'state-1',
        redirectUri: expectedRedirectUri
      })
    })

    expect(await screen.findByText('Logged in as Alice.')).toBeInTheDocument()
    expect(sessionStorage.getItem('ft_access_token')).toBe('access-token')
    expect(sessionStorage.getItem('ft_refresh_token')).toBe('refresh-token')
    expect(sessionStorage.getItem('ft_user')).toBe(
      JSON.stringify({ id: 1, displayName: 'Alice', login: 'alice', status: 'ONLINE' })
    )
  })

  it('prompts MFA when backend requires additional verification', async () => {
    saveOAuthRequestContext({ state: 'state-2', provider: 'google', codeChallenge: null })
    mockedComplete.mockResolvedValue({
      user: null,
      tokens: null,
      mfaRequired: true,
      challengeId: 'challenge-xyz',
      oauthProvider: 'google'
    })

    renderWithRouter('/oauth/callback?code=zzz&state=state-2')

    expect(await screen.findByText('Please complete two-factor authentication.')).toBeInTheDocument()
    const stored = sessionStorage.getItem('ft_mfa_challenge')
    expect(stored ? JSON.parse(stored) : null).toEqual({ id: 'challenge-xyz', redirectTo: '/', emailOrName: null })
    expect(screen.getByRole('button', { name: 'Go to 2FA Code Entry' })).toBeInTheDocument()
  })

  it('shows error when state does not match storage', async () => {
    saveOAuthRequestContext({ state: 'state-original', provider: 'google', codeChallenge: null })

    renderWithRouter('/oauth/callback?code=abc&state=other-state')

    expect(
      await screen.findByText('State verification failed.', { selector: 'p' })
    ).toBeInTheDocument()
    expect(mockedComplete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Return to Login' })).toBeInTheDocument()
  })

  it('surfaced API error message when backend returns failure', async () => {
    saveOAuthRequestContext({ state: 'state-3', provider: 'google', codeChallenge: null })
    mockedComplete.mockRejectedValue(
      createAxiosError(410, {
        error: { code: 'OAUTH_STATE_EXPIRED', message: 'state expired' }
      })
    )

    renderWithRouter('/oauth/callback?code=abc&state=state-3')

    expect(await screen.findByText('OAuth callback processing failed.')).toBeInTheDocument()
    expect(screen.getByText('state expired')).toBeInTheDocument()
  })
})
