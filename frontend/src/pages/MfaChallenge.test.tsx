/**
 * Why this test is needed:
 * - To ensure 2FA challenge screen works correctly, preventing lockout for MFA users.
 * - To cover TOTP/backup code flows and challenge expiration, preventing regressions.
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
    expect(screen.getByText('Valid challenge ID not found. Please log in again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit Code' })).toBeDisabled()
  })

  it('submits totp code successfully and stores tokens', async () => {
    sessionStorage.setItem('ft_mfa_challenge_id', 'challenge-123')
    const apiResponse: MfaResponse = {
      user: { id: 1, displayName: 'Alice', login: 'alice', status: 'ONLINE' },
      tokens: { access: 'access-token', refresh: 'refresh-token' },
      mfaRequired: false
    }
    mockedSubmit.mockResolvedValue(apiResponse)

    const user = userEvent.setup()
    render(<MfaChallengePage />)

    await user.type(screen.getByLabelText('6-digit Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Submit Code' }))

    await waitFor(() => {
      expect(mockedSubmit).toHaveBeenCalledWith({ challengeId: 'challenge-123', code: '123456', backupCode: undefined })
    })
    expect(sessionStorage.getItem('ft_access_token')).toBe('access-token')
    expect(sessionStorage.getItem('ft_refresh_token')).toBe('refresh-token')
    expect(sessionStorage.getItem('ft_user')).toBe(JSON.stringify({ id: 1, displayName: 'Alice', login: 'alice', status: 'ONLINE' }))
    expect(sessionStorage.getItem('ft_mfa_challenge_id')).toBeNull()
  })

  it('allows switching to backup code mode', async () => {
    sessionStorage.setItem('ft_mfa_challenge_id', 'challenge-456')
    const user = userEvent.setup()

    render(<MfaChallengePage />)

    await user.click(screen.getByLabelText('Use backup code'))
    await user.type(screen.getByLabelText('Backup Code'), 'abcd-efgh')
    expect(screen.getByLabelText('Backup Code')).toHaveValue('ABCD-EFGH')
  })

  it('shows validation error when API reports invalid code', async () => {
    sessionStorage.setItem('ft_mfa_challenge_id', 'challenge-789')
    mockedSubmit.mockRejectedValue(
      createAxiosError(400, {
        error: { code: 'INVALID_MFA_CODE', message: 'Invalid code' }
      })
    )

    const user = userEvent.setup()
    render(<MfaChallengePage />)

    await user.type(screen.getByLabelText('6-digit Code'), '654321')
    await user.click(screen.getByRole('button', { name: 'Submit Code' }))

    expect(await screen.findByText('Invalid code')).toBeInTheDocument()
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

    await user.type(screen.getByLabelText('6-digit Code'), '111111')
    await user.click(screen.getByRole('button', { name: 'Submit Code' }))

    expect(await screen.findByText('Challenge expired. Please log in again.')).toBeInTheDocument()
    expect(sessionStorage.getItem('ft_mfa_challenge_id')).toBeNull()
  })
})
