import { FormEvent, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { login, fetchOAuthAuthorizationUrl, type OAuthProvider } from '../lib/api'
import { resolveOAuthRedirectUri, saveOAuthRequestContext } from '../lib/oauth'
import useAuthStore from '../stores/authStore'

const OAUTH_PROVIDERS: Array<{ id: OAuthProvider; label: string }> = [
  { id: 'fortytwo', label: '42 OAuthでログイン' },
  { id: 'google', label: 'Google OAuthでログイン' }
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
      setErrorMessage('メールアドレスを入力してください。')
      return null
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(normalizedEmail)) {
      setErrorMessage('有効なメールアドレスを入力してください。')
      return null
    }
    if (!password || password.length < 8) {
      setErrorMessage('パスワードは8文字以上で入力してください。')
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
      setStatusMessage(`${response.user.displayName} としてログインに成功しました。`)
      setPassword('')
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 423) {
        const challengeId = (error.response.data as { challengeId?: string }).challengeId ?? null
        if (challengeId) {
          sessionStorage.setItem('ft_mfa_challenge_id', challengeId)
        }
        setMfaChallengeId(challengeId)
        setMfaMessage('追加の二段階認証が必要です。')
      } else if (isAxiosError(error) && error.response?.data && 'error' in error.response.data) {
        const message = (error.response.data as { error?: { message?: string } }).error?.message
        setErrorMessage(message ?? 'ログインに失敗しました。')
      } else {
        setErrorMessage('ログインに失敗しました。時間をおいて再試行してください。')
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
        setErrorMessage(message ?? 'OAuth 認証の開始に失敗しました。')
      } else {
        setErrorMessage('OAuth 認証の開始に失敗しました。')
      }
    } finally {
      setOauthLoadingProvider(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">ログイン</h1>
        <p className="mt-2 text-sm text-slate-600">
          メールアドレスとパスワード、もしくは OAuth プロバイダを使用してログインできます。
        </p>

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

        {mfaMessage ? (
          <div role="alert" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>{mfaMessage}</p>
            {mfaChallengeId ? <p className="mt-2 text-xs">チャレンジ ID: {mfaChallengeId}</p> : null}
            <p className="mt-2 text-xs text-amber-800">下記リンクから 2FA コード入力画面を開いてください。</p>
            <a href="/auth/2fa" className="mt-2 inline-flex text-xs text-indigo-700 underline">
              2FA コード入力ページを開く
            </a>
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
            {isSubmitting ? '送信中...' : 'メールアドレスでログイン'}
          </button>
        </form>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <p className="text-sm font-medium text-slate-700">OAuth でログイン</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {OAUTH_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                onClick={() => handleOAuthLogin(provider.id)}
                disabled={Boolean(oauthLoadingProvider)}
              >
                {oauthLoadingProvider === provider.id ? 'リダイレクト準備中...' : provider.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">ブラウザが自動で別タブへ遷移しない場合はポップアップを許可してください。</p>
        </div>
      </section>
    </div>
  )
}

export default LoginPage

/*
解説:

1) OAUTH_PROVIDERS / resolveOAuthRedirectUri
  - フロント側で有効な OAuth プロバイダとリダイレクト URI を定義し、共通ヘルパーで `.env` 未設定時も `window.location.origin` からデフォルトを導き出している。

2) state 管理
  - メール/パスワード/エラー/成功/MFA/送信状態/OAuth ローディングを `useState` で保持し、`resetAlerts` で画面上のメッセージをまとめて初期化できるようにした。

3) handleSubmit
  - クライアントバリデーション後に `login` API を呼び出し、成功時は `authStore.setSession()` を通じて Zustand と `sessionStorage` を同時に更新し、失敗時は 423 (MFA) と 401/400 系で扱いを分けてユーザーへ明示的にフィードバックする。

4) handleOAuthLogin
  - `/auth/oauth/:provider/url` を叩いて state/codeChallenge/選択したプロバイダを `sessionStorage` に保存するヘルパーを呼び出し、取得した `authorizationUrl` へブラウザをリダイレクトする。失敗時は共通アラートでエラーを知らせる。

5) JSX レイアウト
  - メールログインフォームと OAuth ボタン群をカード状に配置し、アラート枠で状態を視覚化することで UX を損なわないようにしている。
*/
