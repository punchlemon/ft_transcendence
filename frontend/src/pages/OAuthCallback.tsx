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
  const [message, setMessage] = useState('OAuth プロバイダからの応答を検証しています。')
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
      setMessage('二段階認証を完了してください。')
      setDetails('OAuth 連携は成功しました。続けてワンタイムコードを入力してください。')
      setRetryEnabled(false)
    }

    const handleSuccess = (response: OAuthCallbackResponse) => {
      if (!isMounted) {
        return
      }
      if (!response.user || !response.tokens) {
        fail('ログイン情報の確定に失敗しました。', 'もう一度ログインページから OAuth を実行してください。')
        return
      }
      setSession({ user: response.user, tokens: response.tokens })
      setStatus('success')
      setMessage(`${response.user.displayName} としてログインが完了しました。`)
      setDetails('数秒後に自動でトップページへ移動します。')
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
        fail('OAuth 認証がキャンセルされました。', errorDescription ?? `エラーコード: ${errorParam}`)
        return
      }

      if (!code || !stateParam) {
        fail('認証コードまたは state が不足しています。', 'ブラウザを更新せず、最初からログインをやり直してください。')
        return
      }

      if (!context) {
        fail('OAuth セッション情報を復元できませんでした。', 'ブラウザのストレージがクリアされた可能性があります。ログインから再試行してください。')
        return
      }

      if (context.state !== stateParam) {
        fail('state の検証に失敗しました。', 'セッションが失効したか、リクエストが改ざんされた可能性があります。')
        return
      }

      const provider = context.provider ?? providerFromQuery
      if (!provider) {
        fail('OAuth プロバイダを特定できませんでした。', 'ログイン画面から対象のプロバイダを選び直してください。')
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
          fail('OAuth コールバック処理に失敗しました。', apiMessage ?? '時間をおいて再試行してください。')
        } else {
          fail('OAuth コールバック処理に失敗しました。', 'ネットワーク状態を確認してから再試行してください。')
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
    if (isHydrated && user && status !== 'validating') {
      navigate('/', { replace: true })
    }
  }, [isHydrated, user, navigate])

  const renderActions = () => {
    if (status === 'success') {
      return (
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          すぐにホームへ移動する
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
          2FA コード入力ページへ
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
          ログイン画面に戻る
        </button>
      )
    }
    return null
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">OAuth コールバック</h1>
        <p className="mt-2 text-sm text-slate-600">OAuth プロバイダから戻ったリクエストを検証しています。</p>

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
            <p className="mt-2 text-xs">{countdown} 秒後にトップページへ移動します。</p>
          ) : null}
          {details ? <p className="mt-2 text-xs opacity-80">{details}</p> : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">{renderActions()}</div>
      </section>
    </div>
  )
}

export default OAuthCallbackPage

/*
解説:

1) 状態管理
  - OAuth コールバックの検証状態 (`status`)、メッセージ、詳細、リトライ可否、成功時のカウントダウン秒数を `useState` で管理し、UI と副作用を明確に分離している。

2) validateAndSubmit()
  - クエリパラメータ、`sessionStorage` に保存した state/provider を照合し、`completeOAuthCallback` を呼び出して JWT もしくは MFA チャレンジを受け取る。検証に失敗した場合は即座にエラーメッセージを表示し、再ログイン導線を提示する。

3) handleSuccess / handleMfaRequired
  - 成功時は `authStore.setSession()` を経由してセッションを保存し、自動リダイレクトのカウントダウンを開始。MFA が必要な場合はチャレンジ ID を保存して `/auth/2fa` へのボタンを表示する。

4) renderActions()
  - 成功/エラー/MFA で異なる CTA を描画し、利用者が次に取るべき行動を単一のボタンで示している。

5) レイアウト
  - 他の認証系ページと同じカードレイアウトで、状態に応じた配色 (緑/黄/赤) を用いたアラートを表示し、フィードバックを視覚的に把握しやすくしている。
*/
