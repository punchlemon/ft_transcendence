/**
 * なぜテストが必要か:
 * - OAuth コールバック処理が失敗すると、OAuth ログインユーザーがセッションを確立できなくなるため。
 * - state 検証や MFA 分岐、API エラーを網羅し再帰的な失敗を防ぐ必要がある。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
      <OAuthCallbackPage />
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
    saveOAuthRequestContext({ state: 'state-1', provider: 'fortytwo', codeChallenge: null })
    const apiResponse: CallbackResponse = {
      user: { id: 1, displayName: 'Alice', status: 'ONLINE' },
      tokens: { access: 'access-token', refresh: 'refresh-token' },
      mfaRequired: false,
      challengeId: null,
      oauthProvider: 'fortytwo'
    }
    mockedComplete.mockResolvedValue(apiResponse)

    const expectedRedirectUri = resolveOAuthRedirectUri()

    renderWithRouter('/oauth/callback?code=abc&state=state-1')

    await waitFor(() => {
      expect(mockedComplete).toHaveBeenCalledWith('fortytwo', {
        code: 'abc',
        state: 'state-1',
        redirectUri: expectedRedirectUri
      })
    })

    expect(await screen.findByText('Alice としてログインが完了しました。')).toBeInTheDocument()
    expect(sessionStorage.getItem('ft_access_token')).toBe('access-token')
    expect(sessionStorage.getItem('ft_refresh_token')).toBe('refresh-token')
    expect(sessionStorage.getItem('ft_user')).toBe(
      JSON.stringify({ id: 1, displayName: 'Alice', status: 'ONLINE' })
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

    expect(await screen.findByText('二段階認証を完了してください。')).toBeInTheDocument()
    expect(sessionStorage.getItem('ft_mfa_challenge_id')).toBe('challenge-xyz')
    expect(screen.getByRole('button', { name: '2FA コード入力ページへ' })).toBeInTheDocument()
  })

  it('shows error when state does not match storage', async () => {
    saveOAuthRequestContext({ state: 'state-original', provider: 'fortytwo', codeChallenge: null })

    renderWithRouter('/oauth/callback?code=abc&state=other-state')

    expect(
      await screen.findByText('state の検証に失敗しました。', { selector: 'p' })
    ).toBeInTheDocument()
    expect(mockedComplete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'ログイン画面に戻る' })).toBeInTheDocument()
  })

  it('surfaced API error message when backend returns failure', async () => {
    saveOAuthRequestContext({ state: 'state-3', provider: 'google', codeChallenge: null })
    mockedComplete.mockRejectedValue(
      createAxiosError(410, {
        error: { code: 'OAUTH_STATE_EXPIRED', message: 'state expired' }
      })
    )

    renderWithRouter('/oauth/callback?code=abc&state=state-3')

    expect(await screen.findByText('OAuth コールバック処理に失敗しました。')).toBeInTheDocument()
    expect(screen.getByText('state expired')).toBeInTheDocument()
  })
})
