import { FormEvent, useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { useNavigate } from 'react-router-dom'
import { submitMfaChallenge } from '../lib/api'
import useAuthStore from '../stores/authStore'

const MfaChallengePage = () => {
  const navigate = useNavigate()
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [backupCode, setBackupCode] = useState('')
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [challengeMissing, setChallengeMissing] = useState(false)

  const setSession = useAuthStore((state) => state.setSession)
  const user = useAuthStore((state) => state.user)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const storedChallenge = useAuthStore((state) => state.mfaChallenge)
  const clearMfaChallenge = useAuthStore((state) => state.clearMfaChallenge)
  const hydrateFromStorage = useAuthStore((state) => state.hydrateFromStorage)

  const readChallengeId = () => {
    if (storedChallenge?.id) {
      return storedChallenge.id
    }
    const raw = sessionStorage.getItem('ft_mfa_challenge')
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { id?: string }
        if (parsed.id) {
          return parsed.id
        }
      } catch {
        // Ignore malformed storage.
      }
    }
    return sessionStorage.getItem('ft_mfa_challenge_id')
  }

  const refreshChallengeId = () => {
    const candidate = readChallengeId()
    setChallengeId(candidate)
    setChallengeMissing(!candidate)
  }

  useEffect(() => {
    const candidate = readChallengeId()
    setChallengeId(candidate)
    setChallengeMissing(!candidate)
  }, [storedChallenge?.id])

  useEffect(() => {
    hydrateFromStorage()
  }, [hydrateFromStorage])

  useEffect(() => {
    if (isHydrated && user) {
      navigate('/', { replace: true })
    }
  }, [isHydrated, user, navigate])

  const resetMessages = () => {
    setErrorMessage(null)
    setStatusMessage(null)
  }

  const handleCodeChange = (value: string) => {
    const sanitized = value.replace(/[^0-9]/g, '').slice(0, 6)
    setCode(sanitized)
  }

  const handleBackupCodeChange = (value: string) => {
    const normalized = value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 12)
    setBackupCode(normalized)
  }

  const isSubmitDisabled = () => {
    if (!challengeId || isSubmitting) {
      return true
    }
    if (useBackupCode) {
      return backupCode.trim().length < 4
    }
    return code.trim().length !== 6
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resetMessages()

    if (!challengeId) {
      setChallengeMissing(true)
      setErrorMessage('Challenge ID not found. Please log in again.')
      return
    }

    const payload = {
      challengeId,
      code: useBackupCode ? undefined : code.trim(),
      backupCode: useBackupCode ? backupCode.trim() : undefined
    }

    if (!payload.code && !payload.backupCode) {
      setErrorMessage('Please enter the code.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await submitMfaChallenge(payload)
      setSession({ user: response.user, tokens: response.tokens })
      clearMfaChallenge()
      setStatusMessage(`Logged in as ${response.user.displayName}.`)
      setChallengeMissing(false)
      setCode('')
      setBackupCode('')
      navigate(storedChallenge?.redirectTo ?? '/', { replace: true })
    } catch (error) {
      if (isAxiosError(error) && error.response) {
        const status = error.response.status
        const data = error.response.data as { error?: { message?: string; code?: string } }

        if (status === 404 || status === 410) {
          clearMfaChallenge()
          setChallengeId(null)
          setChallengeMissing(true)
          setErrorMessage('Challenge expired. Please log in again.')
          setTimeout(() => navigate('/login', { replace: true }), 800)
          return
        }

        if (data?.error?.code === 'MFA_BACKUP_CODES_EXHAUSTED') {
          setErrorMessage('All backup codes have been used. Please enter TOTP.')
        } else {
          setErrorMessage(data?.error?.message ?? 'Failed to verify code.')
        }
      } else {
        setErrorMessage('Failed to verify code. Please try again later.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const disableForm = challengeMissing

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Two-Factor Authentication</h1>
        <p className="mt-2 text-sm text-slate-600">Please enter the 6-digit code from your authenticator app or a backup code.</p>

        {challengeMissing ? (
          <div role="alert" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>Valid challenge ID not found. Please log in again.</p>
            <p className="mt-2 text-xs text-amber-800">Please return to this screen after re-entering your email and password on the login page.</p>
            <a href="/login" className="mt-3 inline-flex text-xs text-indigo-600 underline">
              Open Login Page
            </a>
            <button
              type="button"
              className="mt-3 inline-flex items-center rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={refreshChallengeId}
            >
              Reload Challenge ID
            </button>
          </div>
        ) : null}

        {errorMessage ? (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        ) : null}

        {statusMessage ? (
          <div role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {statusMessage}
          </div>
        ) : null}

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={useBackupCode}
              onChange={(event) => {
                setUseBackupCode(event.target.checked)
                setErrorMessage(null)
              }}
              disabled={disableForm}
            />
            Use backup code
          </label>

          {useBackupCode ? (
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Backup Code
              <input
                type="text"
                className="rounded-lg border border-slate-300 px-4 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none"
                placeholder="ABCD-EFGH"
                value={backupCode}
                onChange={(event) => handleBackupCodeChange(event.target.value)}
                disabled={disableForm || isSubmitting}
                required
              />
            </label>
          ) : (
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              6-digit Code
              <input
                type="text"
                inputMode="numeric"
                className="rounded-lg border border-slate-300 px-4 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none"
                placeholder="123456"
                value={code}
                onChange={(event) => handleCodeChange(event.target.value)}
                disabled={disableForm || isSubmitting}
                required
              />
            </label>
          )}

          <button
            type="submit"
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={disableForm || isSubmitDisabled()}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Code'}
          </button>
        </form>
      </section>
    </div>
  )
}

export default MfaChallengePage
