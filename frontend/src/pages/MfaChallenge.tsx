import { FormEvent, useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { submitMfaChallenge } from '../lib/api'
import useAuthStore from '../stores/authStore'

const MfaChallengePage = () => {
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

  const refreshChallengeId = () => {
    const storedId = sessionStorage.getItem('ft_mfa_challenge_id')
    setChallengeId(storedId)
    setChallengeMissing(!storedId)
  }

  useEffect(() => {
    refreshChallengeId()
  }, [])

  useEffect(() => {
    if (isHydrated && user) {
      // already authenticated, navigate away to home
      window.location.href = '/'
    }
  }, [isHydrated, user])

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
      setErrorMessage('チャレンジ ID が見つかりません。再度ログインしてください。')
      return
    }

    const payload = {
      challengeId,
      code: useBackupCode ? undefined : code.trim(),
      backupCode: useBackupCode ? backupCode.trim() : undefined
    }

    if (!payload.code && !payload.backupCode) {
      setErrorMessage('コードを入力してください。')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await submitMfaChallenge(payload)
      setSession({ user: response.user, tokens: response.tokens })
      sessionStorage.removeItem('ft_mfa_challenge_id')
      setStatusMessage(`${response.user.displayName} としてログインが完了しました。`)
      setChallengeMissing(false)
      setCode('')
      setBackupCode('')
    } catch (error) {
      if (isAxiosError(error) && error.response) {
        const status = error.response.status
        const data = error.response.data as { error?: { message?: string; code?: string } }

        if (status === 404 || status === 410) {
          sessionStorage.removeItem('ft_mfa_challenge_id')
          setChallengeId(null)
          setChallengeMissing(true)
          setErrorMessage('チャレンジの有効期限が切れました。もう一度ログインしてください。')
          return
        }

        if (data?.error?.code === 'MFA_BACKUP_CODES_EXHAUSTED') {
          setErrorMessage('バックアップコードがすべて使用済みです。TOTP を入力してください。')
        } else {
          setErrorMessage(data?.error?.message ?? 'コードの検証に失敗しました。')
        }
      } else {
        setErrorMessage('コードの検証に失敗しました。時間をおいて再試行してください。')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const disableForm = challengeMissing

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">二段階認証</h1>
        <p className="mt-2 text-sm text-slate-600">認証アプリの 6 桁コード、またはバックアップコードを入力してください。</p>

        {challengeMissing ? (
          <div role="alert" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>有効なチャレンジ ID が見つかりません。再度ログインを実行してください。</p>
            <p className="mt-2 text-xs text-amber-800">ログインページでメールアドレスとパスワードを入力し直した後、この画面に戻ってください。</p>
            <a href="/login" className="mt-3 inline-flex text-xs text-indigo-600 underline">
              ログインページを開く
            </a>
            <button
              type="button"
              className="mt-3 inline-flex items-center rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={refreshChallengeId}
            >
              チャレンジ ID を再読み込み
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
            バックアップコードを使用する
          </label>

          {useBackupCode ? (
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              バックアップコード
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
              6桁コード
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
            {isSubmitting ? '送信中...' : 'コードを送信'}
          </button>
        </form>
      </section>
    </div>
  )
}

export default MfaChallengePage

/*
解説:

1) challengeId のハイドレーション
  - `sessionStorage` の `ft_mfa_challenge_id` を読み込み、存在しない場合はフォームをロックして再ログインを促す。

2) バリデーションと状態管理
  - TOTP/バックアップコードそれぞれで入力ルールを分岐し、6 桁の数字や `ABCD-EFGH` 形式に制限してから API を呼び出す。

3) submitMfaChallenge
  - `/auth/mfa/challenge` を呼び出し、成功時は `authStore.setSession()` とステータスメッセージを更新、失敗時は HTTP ステータスごとにエラーメッセージを出し分ける。

4) UI 表示
  - アラートカードでエラー/成功を表示し、チャレンジ ID 欠落時はログインページへのリンクと再読み込みボタンを提供する。
*/
