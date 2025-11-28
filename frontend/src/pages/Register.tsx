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
      setErrorMessage('メールアドレスを入力してください。')
      return false
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(normalizedEmail)) {
      setErrorMessage('有効なメールアドレスを入力してください。')
      return false
    }
    if (!username || username.length < 3) {
      setErrorMessage('ユーザー名は3文字以上で入力してください。')
      return false
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setErrorMessage('ユーザー名は半角英数字、アンダースコア(_)、ハイフン(-)のみ使用できます。')
      return false
    }
    if (!displayName || displayName.length < 3) {
      setErrorMessage('表示名は3文字以上で入力してください。')
      return false
    }
    if (!password || password.length < 8) {
      setErrorMessage('パスワードは8文字以上で入力してください。')
      return false
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setErrorMessage('パスワードは英字と数字の両方を含める必要があります。')
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
        let message = errorData.error?.message ?? '登録に失敗しました。'

        if (errorData.error?.details) {
          const details = Object.values(errorData.error.details).flat().join(' ')
          if (details) {
            message += ` (${details})`
          }
        }
        setErrorMessage(message)
      } else {
        setErrorMessage('登録に失敗しました。時間をおいて再試行してください。')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">新規登録</h1>
        <p className="mt-2 text-sm text-slate-600">
          アカウントを作成してゲームに参加しましょう。
        </p>

        {errorMessage ? (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        ) : null}

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            メールアドレス
            <input
              type="email"
              className="rounded-lg border border-slate-300 px-4 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={isSubmitting}
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            ユーザー名 (ID)
            <input
              type="text"
              className="rounded-lg border border-slate-300 px-4 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="半角英数字"
              disabled={isSubmitting}
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            表示名
            <input
              type="text"
              className="rounded-lg border border-slate-300 px-4 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="ゲーム内で表示される名前"
              disabled={isSubmitting}
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            パスワード
            <input
              type="password"
              className="rounded-lg border border-slate-300 px-4 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8文字以上"
              disabled={isSubmitting}
              required
            />
          </label>

          <button
            type="submit"
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={isSubmitting}
          >
            {isSubmitting ? '登録中...' : 'アカウント作成'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          すでにアカウントをお持ちですか？{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            ログインはこちら
          </Link>
        </div>
      </section>
    </div>
  )
}

export default RegisterPage
