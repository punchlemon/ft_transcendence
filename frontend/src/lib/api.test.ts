/**
 * なぜテストが必要か:
 * - Authorization ヘッダーが付与されないと JWT が必要なエンドポイントへアクセスできず、全体の認証フローが破綻するため。
 * - Zustand ストアや sessionStorage の状態に依存するロジックが意図通りに動くかを自動テストで担保する。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { attachAuthorizationHeader } from './api'
import useAuthStore, { resetAuthStoreForTesting } from '../stores/authStore'

type TestConfig = InternalAxiosRequestConfig & { headers: Record<string, string> }

const createConfig = (): TestConfig => ({
  headers: {},
  method: 'get',
  url: '/health'
})

describe('attachAuthorizationHeader', () => {
  beforeEach(() => {
    resetAuthStoreForTesting()
    sessionStorage.clear()
  })

  it('applies bearer token from auth store', () => {
    useAuthStore.setState({ accessToken: 'store-token' })

    const updated = attachAuthorizationHeader(createConfig())

    expect(updated.headers.Authorization).toBe('Bearer store-token')
  })

  it('falls back to sessionStorage when store is empty', () => {
    sessionStorage.setItem('ft_access_token', 'stored-token')

    const updated = attachAuthorizationHeader(createConfig())

    expect(updated.headers.Authorization).toBe('Bearer stored-token')
  })

  it('keeps headers untouched when token is missing', () => {
    const updated = attachAuthorizationHeader(createConfig())

    expect(updated.headers.Authorization).toBeUndefined()
  })
})
