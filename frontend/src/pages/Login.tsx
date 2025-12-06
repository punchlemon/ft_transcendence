import { FormEvent, useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { login, fetchOAuthAuthorizationUrl, type OAuthProvider } from '../lib/api'
import { resolveOAuthRedirectUri, saveOAuthRequestContext } from '../lib/oauth'
import useAuthStore from '../stores/authStore'

const OAUTH_PROVIDERS: Array<{ id: OAuthProvider; label: string }> = [
  { id: 'google', label: 'Login with Google' }
]

const LoginPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [mfaMessage, setMfaMessage] = useState<string | null>(null)
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<OAuthProvider | null>(null)
  const setSession = useAuthStore((state) => state.setSession)
  const setMfaChallenge = useAuthStore((state) => state.setMfaChallenge)
  const user = useAuthStore((state) => state.user)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    // If the store is hydrated and we already have a user, redirect to home
    if (isHydrated && user) {
      navigate('/', { replace: true })
    }
  }, [isHydrated, user, navigate])

  const oauthRedirectUri = useMemo(() => resolveOAuthRedirectUri(), [])

  const resetAlerts = () => {
    setErrorMessage(null)
    setStatusMessage(null)
    setMfaMessage(null)
    setMfaChallengeId(null)
  }

  const validateInput = (): string | null => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setErrorMessage('Please enter your email address.')
      return null
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(normalizedEmail)) {
      setErrorMessage('Please enter a valid email address.')
      return null
    }
    if (!password || password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.')
      return null
    }
    return normalizedEmail
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resetAlerts()

    const normalizedEmail = validateInput()
    if (!normalizedEmail) {
      return
    }

    setIsSubmitting(true)
    try {
      const response = await login({ email: normalizedEmail, password })
      setSession({ user: response.user, tokens: response.tokens })
      setStatusMessage(`Logged in successfully as ${response.user.displayName}.`)
      setPassword('')

      const redirectParam = searchParams.get('redirect')
      const target = redirectParam ?? '/'
      navigate(target, { replace: true })
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 423) {
        const challengeId = (error.response.data as { challengeId?: string }).challengeId ?? null
        const redirectParam = searchParams.get('redirect')
        const challengePayload = challengeId
          ? { id: challengeId, redirectTo: redirectParam ?? '/', emailOrName: normalizedEmail }
          : null
        setMfaChallenge(challengePayload)
        setMfaChallengeId(challengeId)
        setMfaMessage('Two-factor authentication required.')
      } else if (isAxiosError(error) && error.response?.data && 'error' in error.response.data) {
        const message = (error.response.data as { error?: { message?: string } }).error?.message
        setErrorMessage(message ?? 'Login failed.')
      } else {
        setErrorMessage('Login failed. Please try again later.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    resetAlerts()
    setOauthLoadingProvider(provider)
    try {
      const result = await fetchOAuthAuthorizationUrl(provider, oauthRedirectUri)
      saveOAuthRequestContext({
        state: result.state,
        provider,
        codeChallenge: result.codeChallenge ?? null
      })
      window.open(result.authorizationUrl, '_self')
    } catch (error) {
      if (isAxiosError(error) && error.response?.data && 'error' in error.response.data) {
        const message = (error.response.data as { error?: { message?: string } }).error?.message
        setErrorMessage(message ?? 'Failed to start OAuth authentication.')
      } else {
        setErrorMessage('Failed to start OAuth authentication.')
      }
    } finally {
      setOauthLoadingProvider(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Login</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          You can login with email and password or OAuth providers.
        </p>

        {errorMessage ? (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">
            {errorMessage}
          </div>
        ) : null}

        {statusMessage ? (
          <div role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-300">
            {statusMessage}
          </div>
        ) : null}

        {mfaMessage ? (
          <div role="alert" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300">
            <p>{mfaMessage}</p>
            {mfaChallengeId ? <p className="mt-2 text-xs">Challenge ID: {mfaChallengeId}</p> : null}
            <p className="mt-2 text-xs">Please open the 2FA code entry screen from the link below.</p>
            <a href="/auth/2fa" className="mt-2 inline-flex text-xs text-indigo-600 underline hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
              Open 2FA Code Entry Page
            </a>
          </div>
        ) : null}

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Email Address
            <input
              type="email"
              className="rounded-lg border border-slate-300 px-4 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={isSubmitting}
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Password
            <input
              type="password"
              className="rounded-lg border border-slate-300 px-4 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8+ characters"
              disabled={isSubmitting}
              required
            />
          </label>

          <button
            type="submit"
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:hover:bg-indigo-500 dark:disabled:bg-slate-600"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Login with Email'}
          </button>
        </form>

        <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Login with OAuth</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {OAUTH_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:disabled:bg-slate-700"
                onClick={() => handleOAuthLogin(provider.id)}
                disabled={Boolean(oauthLoadingProvider)}
              >
                {oauthLoadingProvider === provider.id ? 'Redirecting...' : provider.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Please allow popups if the browser does not automatically redirect.</p>
        </div>

        <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
            Register here
          </Link>
        </div>
      </section>
    </div>
  )
}

export default LoginPage
