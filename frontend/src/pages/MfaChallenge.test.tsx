/**
 * なぜテストが必要か:
 * - 2FA チャレンジ画面が誤動作すると、MFA 有効ユーザーがログインできなくなるため。
 * - TOTP/バックアップコードやチャレンジ失効時の分岐を網羅しておくことで回帰を防ぐ。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import MfaChallengePage from './MfaChallenge'
import { submitMfaChallenge } from '../lib/api'
import { resetAuthStoreForTesting } from '../stores/authStore'

type MfaResponse = Awaited<ReturnType<typeof submitMfaChallenge>>

vi.mock('../lib/api', () => ({
  submitMfaChallenge: vi.fn()
}))
const mockedSubmit = vi.mocked(submitMfaChallenge)

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

describe('MfaChallengePage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetAuthStoreForTesting()
    mockedSubmit.mockReset()
  })

  it('shows warning when challenge id is missing', () => {
    render(<MfaChallengePage />)
    expect(screen.getByText('有効なチャレンジ ID が見つかりません。再度ログインを実行してください。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'コードを送信' })).toBeDisabled()
  })

  it('submits totp code successfully and stores tokens', async () => {
    sessionStorage.setItem('ft_mfa_challenge_id', 'challenge-123')
    const apiResponse: MfaResponse = {
      user: { id: 1, displayName: 'Alice', status: 'ONLINE' },
      tokens: { access: 'access-token', refresh: 'refresh-token' },
      mfaRequired: false
    }
    mockedSubmit.mockResolvedValue(apiResponse)

    const user = userEvent.setup()
    render(<MfaChallengePage />)

    await user.type(screen.getByLabelText('6桁コード'), '123456')
    await user.click(screen.getByRole('button', { name: 'コードを送信' }))

    await waitFor(() => {
      expect(mockedSubmit).toHaveBeenCalledWith({ challengeId: 'challenge-123', code: '123456', backupCode: undefined })
    })
    expect(sessionStorage.getItem('ft_access_token')).toBe('access-token')
    expect(sessionStorage.getItem('ft_refresh_token')).toBe('refresh-token')
    expect(sessionStorage.getItem('ft_user')).toBe(JSON.stringify({ id: 1, displayName: 'Alice', status: 'ONLINE' }))
    expect(sessionStorage.getItem('ft_mfa_challenge_id')).toBeNull()
  })

  it('allows switching to backup code mode', async () => {
    sessionStorage.setItem('ft_mfa_challenge_id', 'challenge-456')
    const user = userEvent.setup()

    render(<MfaChallengePage />)

    await user.click(screen.getByLabelText('バックアップコードを使用する'))
    await user.type(screen.getByLabelText('バックアップコード'), 'abcd-efgh')
    expect(screen.getByLabelText('バックアップコード')).toHaveValue('ABCD-EFGH')
  })

  it('shows validation error when API reports invalid code', async () => {
    sessionStorage.setItem('ft_mfa_challenge_id', 'challenge-789')
    mockedSubmit.mockRejectedValue(
      createAxiosError(400, {
        error: { code: 'INVALID_MFA_CODE', message: 'コードが一致しません' }
      })
    )

    const user = userEvent.setup()
    render(<MfaChallengePage />)

    await user.type(screen.getByLabelText('6桁コード'), '654321')
    await user.click(screen.getByRole('button', { name: 'コードを送信' }))

    expect(await screen.findByText('コードが一致しません')).toBeInTheDocument()
    expect(sessionStorage.getItem('ft_mfa_challenge_id')).toBe('challenge-789')
  })

  it('handles expired challenge by clearing storage', async () => {
    sessionStorage.setItem('ft_mfa_challenge_id', 'challenge-expired')
    mockedSubmit.mockRejectedValue(
      createAxiosError(410, {
        error: { code: 'MFA_CHALLENGE_EXPIRED', message: 'challenge expired' }
      })
    )

    const user = userEvent.setup()
    render(<MfaChallengePage />)

    await user.type(screen.getByLabelText('6桁コード'), '111111')
    await user.click(screen.getByRole('button', { name: 'コードを送信' }))

    expect(await screen.findByText('チャレンジの有効期限が切れました。もう一度ログインしてください。')).toBeInTheDocument()
    expect(sessionStorage.getItem('ft_mfa_challenge_id')).toBeNull()
  })
})
