import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  completeOAuthCallback,
  type OAuthProvider,
  type OAuthCallbackResponse
} from '../lib/api'
import {
  clearOAuthRequestContext,
  readOAuthRequestContext,
  resolveOAuthRedirectUri
} from '../lib/oauth'
import useAuthStore from '../stores/authStore'

const MFA_CHALLENGE_KEY = 'ft_mfa_challenge_id'

type CallbackStatus = 'validating' | 'success' | 'needsMfa' | 'error'

const isOAuthProvider = (value: string | null): value is OAuthProvider =>
  value === 'fortytwo' || value === 'google'

const OAuthCallbackPage = () => {
  const setSession = useAuthStore((state) => state.setSession)
  const user = useAuthStore((state) => state.user)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<CallbackStatus>('validating')
  const [message, setMessage] = useState('Validating response from OAuth provider.')
  const [details, setDetails] = useState<string | null>(null)
  const [retryEnabled, setRetryEnabled] = useState(false)
  const [countdown, setCountdown] = useState(3)

  const redirectUri = useMemo(() => resolveOAuthRedirectUri(), [])

  useEffect(() => {
    let isMounted = true

    const fail = (title: string, description?: string) => {
      if (!isMounted) {
        return
      }
      setStatus('error')
      setMessage(title)
      setDetails(description ?? null)
      setRetryEnabled(true)
      clearOAuthRequestContext()
    }

    const handleMfaRequired = (response: OAuthCallbackResponse) => {
      if (!isMounted) {
        return
      }
      if (response.challengeId) {
        sessionStorage.setItem(MFA_CHALLENGE_KEY, response.challengeId)
      }
      setStatus('needsMfa')
      setMessage('Please complete two-factor authentication.')
      setDetails('OAuth connection successful. Please enter the one-time code.')
      setRetryEnabled(false)
    }

    const handleSuccess = (response: OAuthCallbackResponse) => {
      if (!isMounted) {
        return
      }
      if (!response.user || !response.tokens) {
        fail('Failed to finalize login information.', 'Please try OAuth again from the login page.')
        return
      }
      setSession({ user: response.user, tokens: response.tokens })
      setStatus('success')
      setMessage(`Logged in as ${response.user.displayName}.`)
      setDetails('Redirecting to home page in a few seconds.')
      setRetryEnabled(false)
      setCountdown(3)
    }

    const validateAndSubmit = async () => {
      const code = searchParams.get('code')
      const stateParam = searchParams.get('state')
      const providerQuery = searchParams.get('provider')
      const providerFromQuery = isOAuthProvider(providerQuery) ? providerQuery : null
      const errorParam = searchParams.get('error')
      const errorDescription = searchParams.get('error_description')
      const context = readOAuthRequestContext()

      if (errorParam) {
        fail('OAuth authentication cancelled.', errorDescription ?? `Error code: ${errorParam}`)
        return
      }

      if (!code || !stateParam) {
        fail('Missing authentication code or state.', 'Please restart login without refreshing the browser.')
        return
      }

      if (!context) {
        fail('Could not restore OAuth session information.', 'Browser storage may have been cleared. Please try logging in again.')
        return
      }

      if (context.state !== stateParam) {
        fail('State verification failed.', 'Session may have expired or request may have been tampered with.')
        return
      }

      const provider = context.provider ?? providerFromQuery
      if (!provider) {
        fail('Could not identify OAuth provider.', 'Please select the provider again from the login screen.')
        return
      }

      try {
        const response = await completeOAuthCallback(provider, {
          code,
          state: stateParam,
          redirectUri
        })
        clearOAuthRequestContext()
        if (response.mfaRequired) {
          handleMfaRequired(response)
          return
        }
        handleSuccess(response)
      } catch (error) {
        if (isAxiosError(error) && error.response?.data && 'error' in error.response.data) {
          const apiMessage = (error.response.data as { error?: { message?: string } }).error?.message
          fail('OAuth callback processing failed.', apiMessage ?? 'Please try again later.')
        } else {
          fail('OAuth callback processing failed.', 'Please check your network connection and try again.')
        }
      }
    }

    void validateAndSubmit()

    return () => {
      isMounted = false
    }
  }, [redirectUri, searchParams, setSession])

  useEffect(() => {
    if (status !== 'success') {
      return
    }
    if (countdown <= 0) {
      navigate('/', { replace: true })
      return
    }
    const timerId = window.setTimeout(() => {
      setCountdown((previous) => previous - 1)
    }, 1000)
    return () => window.clearTimeout(timerId)
  }, [status, countdown, navigate])

  useEffect(() => {
    // Only redirect away from this page when the store is hydrated and a user
    // already exists *and* we're not currently processing an OAuth callback.
    // This avoids immediately navigating away after this page itself calls
    // `setSession()` during a successful callback (which would prevent the
    // success message and countdown from being shown).
    if (isHydrated && user && status !== 'validating' && status !== 'success') {
      navigate('/', { replace: true })
    }
  }, [isHydrated, user, navigate, status])

  const renderActions = () => {
    if (status === 'success') {
      return (
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Go to Home immediately
        </button>
      )
    }
    if (status === 'needsMfa') {
      return (
        <button
          type="button"
          onClick={() => navigate('/auth/2fa')}
          className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
        >
          Go to 2FA Code Entry
        </button>
      )
    }
    if (status === 'error' && retryEnabled) {
      return (
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Return to Login
        </button>
      )
    }
    return null
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">OAuth Callback</h1>
        <p className="mt-2 text-sm text-slate-600">Validating request returned from OAuth provider.</p>

        <div
          className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
            status === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : status === 'needsMfa'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : status === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
          role={status === 'error' ? 'alert' : 'status'}
        >
          <p>{message}</p>
          {status === 'success' ? (
            <p className="mt-2 text-xs">Redirecting to home page in {countdown} seconds.</p>
          ) : null}
          {details ? <p className="mt-2 text-xs opacity-80">{details}</p> : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">{renderActions()}</div>
      </section>
    </div>
  )
}

export default OAuthCallbackPage
