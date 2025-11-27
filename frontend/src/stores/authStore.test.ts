/**
 * なぜテストが必要か:
 * - 認証ストアがセッション保存/復元に失敗すると再ログイン体験が破綻するため、Zustand のアクションを単体で検証する。
 * - StrictMode での二重ハイドレーションやログアウト処理が正しくストレージを更新するかを確認しておく必要がある。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import useAuthStore, { resetAuthStoreForTesting } from './authStore'

describe('authStore', () => {
  beforeEach(() => {
    resetAuthStoreForTesting()
    sessionStorage.clear()
  })

  it('stores tokens and user snapshot when setSession is called', () => {
    const store = useAuthStore.getState()
    store.setSession({
      user: { id: 1, displayName: 'Alice', status: 'ONLINE' },
      tokens: { access: 'access-token', refresh: 'refresh-token' }
    })

    const latest = useAuthStore.getState()
    expect(latest.user?.displayName).toBe('Alice')
    expect(latest.accessToken).toBe('access-token')
    expect(sessionStorage.getItem('ft_user')).toBe(JSON.stringify({ id: 1, displayName: 'Alice', status: 'ONLINE' }))
    expect(latest.isHydrated).toBe(true)
  })

  it('hydrates state from sessionStorage exactly once', () => {
    sessionStorage.setItem('ft_access_token', 'stored-access')
    sessionStorage.setItem('ft_refresh_token', 'stored-refresh')
    sessionStorage.setItem('ft_user', JSON.stringify({ id: 2, displayName: 'Bob', status: 'OFFLINE' }))

    const store = useAuthStore.getState()
    store.hydrateFromStorage()
    store.hydrateFromStorage()

    const latest = useAuthStore.getState()
    expect(latest.user?.displayName).toBe('Bob')
    expect(latest.accessToken).toBe('stored-access')
    expect(latest.refreshToken).toBe('stored-refresh')
    expect(latest.isHydrated).toBe(true)
  })

  it('clears state and storage when clearSession is called', () => {
    const store = useAuthStore.getState()
    store.setSession({
      user: { id: 3, displayName: 'Carol', status: 'ONLINE' },
      tokens: { access: 'acc', refresh: 'ref' }
    })

    store.clearSession()

    const latest = useAuthStore.getState()
    expect(latest.user).toBeNull()
    expect(latest.accessToken).toBeNull()
    expect(sessionStorage.getItem('ft_access_token')).toBeNull()
    expect(sessionStorage.getItem('ft_user')).toBeNull()
  })
})

/*
解説:

1) beforeEach
  - 各テストの独立性を確保するため、ストアと `sessionStorage` を初期化している。

2) setSession の検証
  - ログイン直後に状態とストレージが同期されること、`isHydrated` が真になることを保証する。

3) hydrateFromStorage の検証
  - セッション情報を 1 度だけ復元し、StrictMode での二重呼び出しでも冪等であることを確認する。

4) clearSession の検証
  - ログアウト処理でストアとストレージが確実に空になることを保証し、残データによる情報漏洩を防ぐ。
*/
