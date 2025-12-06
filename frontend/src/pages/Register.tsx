import { FormEvent, useState, useEffect } from 'react'
import { isAxiosError } from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../lib/api'
import useAuthStore from '../stores/authStore'

const RegisterPage = () => {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const setSession = useAuthStore((state) => state.setSession)
  const user = useAuthStore((state) => state.user)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const navigate = useNavigate()

  useEffect(() => {
    if (isHydrated && user) {
      navigate('/', { replace: true })
    }
  }, [isHydrated, user, navigate])

  const validateInput = (): boolean => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setErrorMessage('Please enter your email address.')
      return false
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(normalizedEmail)) {
      setErrorMessage('Please enter a valid email address.')
      return false
    }
    if (!username || username.length < 3) {
      setErrorMessage('Username must be at least 3 characters.')
      return false
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setErrorMessage('Username can only contain alphanumeric characters, underscores, and hyphens.')
      return false
    }
    if (!displayName || displayName.length < 3) {
      setErrorMessage('Display name must be at least 3 characters.')
      return false
    }
    if (!password || password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.')
      return false
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setErrorMessage('Password must contain both letters and numbers.')
      return false
    }
    return true
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    if (!validateInput()) {
      return
    }

    setIsSubmitting(true)
    try {
      const response = await register({
        email: email.trim().toLowerCase(),
        username: username.trim(),
        displayName: displayName.trim(),
        password
      })
      setSession({ user: response.user, tokens: response.tokens })
      navigate('/')
    } catch (error) {
      if (isAxiosError(error) && error.response?.data && 'error' in error.response.data) {
        const errorData = error.response.data as { error?: { message?: string; details?: Record<string, string[]> } }
        let message = errorData.error?.message ?? 'Registration failed.'

        if (errorData.error?.details) {
          const details = Object.values(errorData.error.details).flat().join(' ')
          if (details) {
            message += ` (${details})`
          }
        }
        setErrorMessage(message)
      } else {
        setErrorMessage('Registration failed. Please try again later.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Register</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Create an account to join the game.
        </p>

        {errorMessage ? (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">
            {errorMessage}
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
            Username (ID)
            <input
              type="text"
              className="rounded-lg border border-slate-300 px-4 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Alphanumeric"
              disabled={isSubmitting}
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Display Name
            <input
              type="text"
              className="rounded-lg border border-slate-300 px-4 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Name displayed in game"
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
            {isSubmitting ? 'Registering...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
            Login here
          </Link>
        </div>
      </section>
    </div>
  )
}

export default RegisterPage
