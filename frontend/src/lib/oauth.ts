import type { OAuthProvider } from './api'

const OAUTH_STATE_KEY = 'ft_oauth_state'
const OAUTH_PROVIDER_KEY = 'ft_oauth_provider'
const OAUTH_CODE_CHALLENGE_KEY = 'ft_oauth_code_challenge'

const isBrowserEnvironment = () => typeof window !== 'undefined' && typeof sessionStorage !== 'undefined'

export const resolveOAuthRedirectUri = () => {
  const envValue = import.meta.env.VITE_OAUTH_REDIRECT_URI?.trim()
  if (envValue) {
    return envValue
  }
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}/oauth/callback`
  }
  return '/oauth/callback'
}

export const saveOAuthRequestContext = (payload: {
  state: string
  provider: OAuthProvider
  codeChallenge?: string | null
}) => {
  if (!isBrowserEnvironment()) {
    return
  }
  sessionStorage.setItem(OAUTH_STATE_KEY, payload.state)
  sessionStorage.setItem(OAUTH_PROVIDER_KEY, payload.provider)
  if (payload.codeChallenge) {
    sessionStorage.setItem(OAUTH_CODE_CHALLENGE_KEY, payload.codeChallenge)
  } else {
    sessionStorage.removeItem(OAUTH_CODE_CHALLENGE_KEY)
  }
}

export const readOAuthRequestContext = () => {
  if (!isBrowserEnvironment()) {
    return null
  }
  const state = sessionStorage.getItem(OAUTH_STATE_KEY)
  const provider = sessionStorage.getItem(OAUTH_PROVIDER_KEY) as OAuthProvider | null
  const codeChallenge = sessionStorage.getItem(OAUTH_CODE_CHALLENGE_KEY)
  if (!state || !provider) {
    return null
  }
  return {
    state,
    provider,
    codeChallenge: codeChallenge ?? null
  }
}

export const clearOAuthRequestContext = () => {
  if (!isBrowserEnvironment()) {
    return
  }
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_PROVIDER_KEY)
  sessionStorage.removeItem(OAUTH_CODE_CHALLENGE_KEY)
}

export const getOAuthStorageKeys = () => ({
  stateKey: OAUTH_STATE_KEY,
  providerKey: OAUTH_PROVIDER_KEY,
  codeChallengeKey: OAUTH_CODE_CHALLENGE_KEY
})

/*
解説:

1) 定数と環境判定
  - OAuth の state/provider/codeChallenge を保存するキーを一元管理し、`sessionStorage` が利用できるブラウザ環境かを判定するヘルパーを用意している。

2) resolveOAuthRedirectUri()
  - `.env` の `VITE_OAUTH_REDIRECT_URI` を優先し、未指定なら `window.location.origin` に `/oauth/callback` を付与することでバックエンドと同じ URL を計算できるようにした。

3) saveOAuthRequestContext()/readOAuthRequestContext()
  - OAuth 開始時に state・provider・codeChallenge を保存し、コールバックで確実に復元できるよう型安全な API を提供する。必須値が欠ける場合は `null` を返してリトライを促す。

4) clearOAuthRequestContext()
  - 成功/失敗を問わず OAuth 補助データを削除しておき、 stale な state で誤った検証をしないようにしている。

5) getOAuthStorageKeys()
  - テストコードなどでキーの値を参照する用途のため公開し、直接ハードコードしなくても済むようにしている。
*/
