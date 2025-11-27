import axios, { type InternalAxiosRequestConfig } from 'axios'
import useAuthStore, { readAccessTokenFromStorage } from '../stores/authStore'

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const shouldUseRelativeBase =
  !rawBaseUrl ||
  rawBaseUrl === '/' ||
  rawBaseUrl === '/api' ||
  rawBaseUrl.startsWith('http://backend') ||
  rawBaseUrl.startsWith('https://backend')

const resolvedBaseUrl = shouldUseRelativeBase ? '/api' : rawBaseUrl
const baseURL = resolvedBaseUrl?.endsWith('/') ? resolvedBaseUrl.slice(0, -1) : resolvedBaseUrl

const apiClient = axios.create({
  baseURL
})

export const attachAuthorizationHeader = (config: InternalAxiosRequestConfig) => {
  const storeToken = useAuthStore.getState().accessToken
  const token = storeToken ?? readAccessTokenFromStorage()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}

apiClient.interceptors.request.use(attachAuthorizationHeader)

export const fetchHealth = async () => {
  const response = await apiClient.get('/health')
  return response.data as { status: string; timestamp: string }
}

export type LoginPayload = {
  email: string
  password: string
}

export type LoginSuccessResponse = {
  user: {
    id: number
    displayName: string
    status: string
  }
  tokens: {
    access: string
    refresh: string
  }
  mfaRequired: boolean
  challengeId?: string | null
}

export const login = async (payload: LoginPayload) => {
  const response = await apiClient.post('/auth/login', payload)
  return response.data as LoginSuccessResponse
}

export type OAuthProvider = 'fortytwo' | 'google'

export type OAuthAuthorizationUrlResponse = {
  authorizationUrl: string
  state: string
  codeChallenge?: string | null
  expiresIn: number
}

export const fetchOAuthAuthorizationUrl = async (provider: OAuthProvider, redirectUri: string) => {
  const response = await apiClient.get(`/auth/oauth/${provider}/url`, {
    params: { redirectUri }
  })
  return response.data as OAuthAuthorizationUrlResponse
}

export type OAuthCallbackPayload = {
  code: string
  state: string
  redirectUri: string
}

export type OAuthCallbackResponse = {
  user: LoginSuccessResponse['user'] | null
  tokens: LoginSuccessResponse['tokens'] | null
  mfaRequired: boolean
  challengeId: string | null
  oauthProvider: OAuthProvider
}

export const completeOAuthCallback = async (
  provider: OAuthProvider,
  payload: OAuthCallbackPayload
) => {
  const response = await apiClient.post(`/auth/oauth/${provider}/callback`, payload)
  return response.data as OAuthCallbackResponse
}

export type MfaChallengePayload = {
  challengeId: string
  code?: string
  backupCode?: string
}

export const submitMfaChallenge = async (payload: MfaChallengePayload) => {
  const response = await apiClient.post('/auth/mfa/challenge', payload)
  return response.data as LoginSuccessResponse
}

/*
解説:

1) import axios
  - HTTP クライアントとして axios を使用し、共通のベース URL 設定を一箇所に集約する。

2) rawBaseUrl / shouldUseRelativeBase / resolvedBaseUrl
  - 環境変数 `VITE_API_BASE_URL` を解釈し、Docker 経由の `http://backend` や未設定の場合は相対パス `/api` にフォールバックしてフロント/バック間のプロキシ互換を確保する。

3) const apiClient = axios.create
  - 計算した `baseURL` で axios インスタンスを生成し、以降の API 呼び出しで URL の重複指定を避ける。

4) attachAuthorizationHeader / 各 API 関数
  - リクエスト前に `authStore`/`sessionStorage` からアクセストークンを取得し、`Authorization` ヘッダーへ付与するインターセプターを登録している。`fetchHealth`（匿名）以外の API でも個別処理を記述せずに済むよう統合した。

5) completeOAuthCallback
  - OAuth リダイレクト後の `code`/`state` をバックエンドへ橋渡しするための関数とレスポンス型を用意し、`mfaRequired` や `challengeId` フラグも併せて扱えるようにしている。
*/
