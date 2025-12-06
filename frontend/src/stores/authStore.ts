import { create } from 'zustand'

export type AuthUserSnapshot = {
  id: number
  displayName: string
  login: string
  status: string
  twoFAEnabled?: boolean
  avatarUrl?: string
}

type AuthTokens = {
  access: string
  refresh: string
}

type AuthStore = {
  user: AuthUserSnapshot | null
  accessToken: string | null
  refreshToken: string | null
  isHydrated: boolean
  mfaChallenge: MfaChallenge | null
  setSession: (payload: { user: AuthUserSnapshot; tokens: AuthTokens }) => void
  updateUser: (updates: Partial<AuthUserSnapshot>) => void
  hydrateFromStorage: () => void
  setMfaChallenge: (challenge: MfaChallenge | null) => void
  clearMfaChallenge: () => void
  clearSession: () => void
}

export type MfaChallenge = {
  id: string
  redirectTo?: string | null
  emailOrName?: string | null
}

const ACCESS_TOKEN_KEY = 'ft_access_token'
const REFRESH_TOKEN_KEY = 'ft_refresh_token'
const USER_SNAPSHOT_KEY = 'ft_user'
const MFA_CHALLENGE_KEY = 'ft_mfa_challenge'

const isBrowserEnvironment = () => typeof window !== 'undefined' && typeof sessionStorage !== 'undefined'

const readUserSnapshot = (): AuthUserSnapshot | null => {
  if (!isBrowserEnvironment()) {
    return null
  }
  const raw = sessionStorage.getItem(USER_SNAPSHOT_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as AuthUserSnapshot
  } catch (error) {
    console.warn('ユーザースナップショットの解析に失敗したため、破棄しました。', error)
    sessionStorage.removeItem(USER_SNAPSHOT_KEY)
    return null
  }
}

const readMfaChallenge = (): MfaChallenge | null => {
  if (!isBrowserEnvironment()) {
    return null
  }
  const raw = sessionStorage.getItem(MFA_CHALLENGE_KEY)
  if (!raw) {
    // Backward compatibility: legacy key that stored only the id string
    const legacy = sessionStorage.getItem('ft_mfa_challenge_id')
    if (legacy) {
      const challenge: MfaChallenge = { id: legacy }
      sessionStorage.setItem(MFA_CHALLENGE_KEY, JSON.stringify(challenge))
      sessionStorage.removeItem('ft_mfa_challenge_id')
      return challenge
    }
    return null
  }
  try {
    return JSON.parse(raw) as MfaChallenge
  } catch (error) {
    console.warn('MFAチャレンジの復元に失敗したため、破棄しました。', error)
    sessionStorage.removeItem(MFA_CHALLENGE_KEY)
    return null
  }
}

const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isHydrated: false,
  mfaChallenge: null,
  setSession: ({ user, tokens }) => {
    if (isBrowserEnvironment()) {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.access)
      sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh)
      sessionStorage.setItem(USER_SNAPSHOT_KEY, JSON.stringify(user))
      sessionStorage.removeItem(MFA_CHALLENGE_KEY)
    }
    set({
      user,
      accessToken: tokens.access,
      refreshToken: tokens.refresh,
      isHydrated: true,
      mfaChallenge: null
    })
  },
  updateUser: (updates) => {
    const currentUser = get().user
    if (!currentUser) return
    const newUser = { ...currentUser, ...updates }
    if (isBrowserEnvironment()) {
      sessionStorage.setItem(USER_SNAPSHOT_KEY, JSON.stringify(newUser))
    }
    set({ user: newUser })
  },
  hydrateFromStorage: () => {
    if (get().isHydrated) {
      return
    }
    if (!isBrowserEnvironment()) {
      set({ isHydrated: true })
      return
    }
    const accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY)
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY)
    set({
      user: readUserSnapshot(),
      accessToken: accessToken ?? null,
      refreshToken: refreshToken ?? null,
      isHydrated: true,
      mfaChallenge: readMfaChallenge()
    })
  },
  setMfaChallenge: (challenge) => {
    if (isBrowserEnvironment()) {
      if (challenge) {
        sessionStorage.setItem(MFA_CHALLENGE_KEY, JSON.stringify(challenge))
      } else {
        sessionStorage.removeItem(MFA_CHALLENGE_KEY)
      }
    }
    set({ mfaChallenge: challenge })
  },
  clearMfaChallenge: () => {
    if (isBrowserEnvironment()) {
      sessionStorage.removeItem(MFA_CHALLENGE_KEY)
    }
    set({ mfaChallenge: null })
  },
  clearSession: () => {
    if (isBrowserEnvironment()) {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY)
      sessionStorage.removeItem(REFRESH_TOKEN_KEY)
      sessionStorage.removeItem(USER_SNAPSHOT_KEY)
      sessionStorage.removeItem(MFA_CHALLENGE_KEY)
    }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isHydrated: true,
      mfaChallenge: null
    })
  }
}))

export const readAccessTokenFromStorage = () => {
  if (!isBrowserEnvironment()) {
    return null
  }
  return sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

export const resetAuthStoreForTesting = () => {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    mfaChallenge: null,
    isHydrated: false
  })
}

export default useAuthStore

/*
解説:

1) AuthUserSnapshot / AuthStore 型
  - 認証済みユーザ情報とトークンを正しく型付けし、Zustand ストアの責務を明示するために導入した。

2) ストレージキーと isBrowserEnvironment
  - `sessionStorage` が利用可能な環境かを判定し、SSR やテスト実行時に安全へ配慮する。キーは衝突を避けるために定数化した。

3) readUserSnapshot()
  - JSON 解析失敗時にデータを破棄し、破損したスナップショットで無限ループにならないようにしている。

4) setSession / hydrateFromStorage / clearSession
  - ログイン成功時の同期、アプリ初期化時の復元、ログアウト時の破棄をそれぞれ 1 箇所で扱い、`isHydrated` フラグで StrictMode 二重呼び出しに耐える構造を整えた。

5) resetAuthStoreForTesting / readAccessTokenFromStorage
  - Vitest からストアを初期化するためのユーティリティと、`sessionStorage` 内のアクセストークンを直接参照する関数を提供し、axios インターセプタがストア未ハイドレート時でも確実にヘッダーへ反映できるようにした。
*/
