import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
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

export const api = apiClient

export const attachAuthorizationHeader = (config: InternalAxiosRequestConfig) => {
  const storeToken = useAuthStore.getState().accessToken
  const token = storeToken ?? readAccessTokenFromStorage()
  if (token) {
    const headers = config.headers instanceof AxiosHeaders
      ? config.headers
      : AxiosHeaders.from(config.headers ?? {})

    headers.set('Authorization', `Bearer ${token}`)
    config.headers = headers
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

export type UserProfileResponse = {
  id: number
  displayName: string
  login: string
  status: string
  avatarUrl: string | null
  country: string | null
  bio: string | null
  createdAt: string
  stats: {
    wins: number
    losses: number
    matchesPlayed: number
    pointsScored: number
    pointsAgainst: number
  } | null
  ladder: {
    tier: string
    division: number
    mmr: number
  } | null
  friendshipStatus: 'NONE' | 'FRIEND' | 'PENDING_SENT' | 'PENDING_RECEIVED'
  mutualFriends: number
}

export const fetchUserProfile = async (userId: string) => {
  const response = await apiClient.get(`/users/${userId}`)
  return response.data as UserProfileResponse
}

export type MatchHistoryResponse = {
  data: Array<{
    id: number
    opponent: {
      id: number
      displayName: string
      avatarUrl: string | null
    }
    result: 'WIN' | 'LOSS' | 'UNKNOWN'
    score: string
    date: string
    mode: string
  }>
  meta: {
    page: number
    limit: number
    total: number
  }
}

export const fetchUserMatches = async (userId: string, page = 1, limit = 20) => {
  const response = await apiClient.get(`/users/${userId}/matches`, {
    params: { page, limit }
  })
  return response.data as MatchHistoryResponse
}

export type FriendResponse = {
  data: Array<{
    id: number
    displayName: string
    status: string
    avatarUrl: string | null
  }>
}

export const fetchUserFriends = async (userId: string) => {
  const response = await apiClient.get(`/users/${userId}/friends`)
  return response.data as FriendResponse
}

export type Tournament = {
  id: number
  name: string
  status: string
  bracketType: string
  startsAt: string | null
  owner: {
    id: number
    displayName: string
  }
  participantCount: number
}

export type TournamentDetail = Tournament & {
  participants: Array<{
    id: number
    alias: string
    userId: number | null
    inviteState: string
    seed: number | null
    joinedAt: string
  }>
  matches: Array<{
    id: number
    round: number
    status: string
    scheduledAt: string | null
    playerA: {
      participantId: number
      alias: string
    }
    playerB: {
      participantId: number
      alias: string
    }
    winnerId: number | null
  }>
}

export type CreateTournamentPayload = {
  name: string
  createdById: number
  bracketType?: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION'
  startsAt?: string
  participants?: Array<{
    alias: string
    userId?: number
    inviteState?: string
    seed?: number
  }>
}

export const fetchTournaments = async (page = 1, limit = 20) => {
  const response = await apiClient.get('/tournaments', {
    params: { page, limit }
  })
  return response.data as { data: Tournament[]; meta: { page: number; limit: number; total: number } }
}

export const fetchTournament = async (id: number) => {
  const response = await apiClient.get(`/tournaments/${id}`)
  return response.data as { data: TournamentDetail }
}

export const createTournament = async (payload: CreateTournamentPayload) => {
  const response = await apiClient.post('/tournaments', payload)
  return response.data as { data: Tournament }
}

export type UpdateProfilePayload = {
  displayName?: string
  bio?: string
  avatarUrl?: string
}

export const updateUserProfile = async (userId: string, payload: UpdateProfilePayload) => {
  const response = await apiClient.patch(`/users/${userId}`, payload)
  return response.data as UserProfileResponse
}

export type Session = {
  id: number
  createdAt: string
  expiresAt: string
  lastUsedAt: string
  ipAddress: string | null
  userAgent: string | null
  current: boolean
}

export const fetchSessions = async () => {
  const response = await apiClient.get('/auth/sessions')
  return response.data as { sessions: Session[] }
}

export const revokeSession = async (sessionId: number) => {
  await apiClient.delete(`/auth/sessions/${sessionId}`)
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

6) トーナメント関連の型と API 関数
  - トーナメントの一覧取得、詳細取得、作成を行うための型定義と API 関数を追加した。

7) updateUserProfile
  - ユーザープロフィールの更新を行うための関数と型定義を追加した。

8) セッション関連の型と API 関数
  - セッションの取得と無効化を行うための型定義と API 関数を追加した。
*/
