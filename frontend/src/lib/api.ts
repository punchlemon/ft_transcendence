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
export const baseURL = resolvedBaseUrl?.endsWith('/') ? resolvedBaseUrl.slice(0, -1) : resolvedBaseUrl

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

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: any) => void
}> = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token!)
    }
  })
  failedQueue = []
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (!originalRequest) {
      return Promise.reject(error)
    }

    if (originalRequest.url?.endsWith('/auth/refresh')) {
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && !(originalRequest as any)._retry) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`
            return apiClient(originalRequest)
          })
          .catch((err) => {
            return Promise.reject(err)
          })
      }

      ;(originalRequest as any)._retry = true
      isRefreshing = true

      const refreshToken = useAuthStore.getState().refreshToken

      if (!refreshToken) {
        useAuthStore.getState().clearSession()
        return Promise.reject(error)
      }

      try {
        const response = await apiClient.post('/auth/refresh', { refreshToken })
        const { tokens, user } = response.data

        useAuthStore.getState().setSession({
          user,
          tokens
        })

        processQueue(null, tokens.access)

        originalRequest.headers['Authorization'] = `Bearer ${tokens.access}`
        return apiClient(originalRequest)
      } catch (err) {
        processQueue(err, null)
        useAuthStore.getState().clearSession()
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

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
    login: string
    status: string
    avatarUrl?: string
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

export type RegisterPayload = {
  email: string
  username: string
  displayName: string
  password: string
}

export const register = async (payload: RegisterPayload) => {
  const response = await apiClient.post('/auth/register', payload)
  return response.data as LoginSuccessResponse
}

export type OAuthProvider = 'google'

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
  friendshipStatus: 'NONE' | 'FRIEND' | 'PENDING_SENT' | 'PENDING_RECEIVED'
  friendRequestId?: number
  isBlockedByViewer: boolean
  isBlockingViewer: boolean
  mutualFriends: number
}

export const fetchUserProfile = async (userId: string) => {
  const response = await apiClient.get(`/users/${userId}`)
  return response.data as UserProfileResponse
}

export const sendFriendRequest = async (userId: number) => {
  await apiClient.post(`/friends/${userId}`)
}

export const cancelFriendRequest = async (userId: number) => {
  await apiClient.delete(`/friends/requests/${userId}`)
}

export const removeFriend = async (userId: number) => {
  await apiClient.delete(`/friends/${userId}`)
}

export const acceptFriendRequest = async (requestId: number) => {
  await apiClient.patch(`/friends/${requestId}`, { action: 'ACCEPT' })
}

export const declineFriendRequest = async (requestId: number) => {
  await apiClient.patch(`/friends/${requestId}`, { action: 'DECLINE' })
}

export const blockUser = async (userId: number) => {
  await apiClient.post(`/blocks/${userId}`)
}

export const unblockUser = async (userId: number) => {
  await apiClient.delete(`/blocks/${userId}`)
}

export type FriendRequestResponse = {
  data: Array<{
    id: number
    status: string
    sender?: {
      id: number
      displayName: string
      avatarUrl: string | null
    }
    receiver?: {
      id: number
      displayName: string
      avatarUrl: string | null
    }
  }>
}

export const fetchSentFriendRequests = async () => {
  const response = await apiClient.get('/friends/requests/sent')
  return response.data as FriendRequestResponse
}

export const fetchReceivedFriendRequests = async () => {
  const response = await apiClient.get('/friends/requests/received')
  return response.data as FriendRequestResponse
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
    login: string
    status: string
    avatarUrl: string | null
  }>
}

export const fetchUserFriends = async (userId: string) => {
  const response = await apiClient.get(`/users/${userId}/friends`)
  return response.data as FriendResponse
}

export const fetchBlockedUsers = async () => {
  const response = await apiClient.get('/blocks')
  return response.data as FriendResponse // Reusing FriendResponse structure as it's similar
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
      inviteState: string
    } | null
    playerB: {
      participantId: number
      alias: string
      inviteState: string
    } | null
    winnerId: number | null
    scoreA?: number | null
    scoreB?: number | null
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
  const response = await apiClient.get(`/tournaments/${id}`, {
    params: { _t: Date.now() }
  })
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

export const uploadAvatar = async (userId: string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await apiClient.post(`/users/${userId}/avatar`, formData)
  return response.data as UserProfileResponse
}

export const deleteAvatar = async (userId: string) => {
  const response = await apiClient.delete(`/users/${userId}/avatar`)
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

export type UserSearchResponse = {
  data: Array<{
    id: number
    displayName: string
    login: string
    status: string
    avatarUrl: string | null
    mutualFriends: number
    wins: number
    winRate: number
    gamesPlayed: number
  }>
  meta: {
    page: number
    limit: number
    total: number
  }
}

export type UserSearchParams = {
  page?: number
  limit?: number
  query?: string
  statuses?: string
  relationships?: string
  sortBy?: 'displayName' | 'createdAt' | 'winRate'
  order?: 'asc' | 'desc'
  winRateSort?: 'off' | 'asc' | 'desc'
  gamesSort?: 'off' | 'asc' | 'desc'
  sortOrder?: string
}

export const fetchUsers = async (params: UserSearchParams = {}) => {
  // Backend expects `q` as the search query param. Frontend types use `query`.
  const sendParams: Record<string, any> = { ...params }
  // Only include `q` when a non-empty query is provided. Backend validation
  // rejects empty strings (schema expects min length 1), so omit empty.
  if (typeof params.query === 'string' && params.query.trim().length > 0) {
    sendParams.q = params.query.trim()
  }
  // Remove frontend-only `query` key before sending
  delete sendParams.query

  const response = await apiClient.get('/users', { params: sendParams })
  return response.data as UserSearchResponse
}

export const inviteToGame = async (targetUserId: number) => {
  const response = await apiClient.post('/game/invite', { targetUserId })
  return response.data as { sessionId: string }
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

9) ユーザー検索関連の型と API 関数
  - ユーザーの検索、ソート、フィルタリングを行うための型定義と API 関数を追加した。
*/
