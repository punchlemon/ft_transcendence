/**
 * なぜテストが必要か:
 * - Authorization ヘッダーが付与されないと JWT が必要なエンドポイントへアクセスできず、全体の認証フローが破綻するため。
 * - Zustand ストアや sessionStorage の状態に依存するロジックが意図通りに動くかを自動テストで担保する。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { attachAuthorizationHeader } from './api'
import useAuthStore, { resetAuthStoreForTesting } from '../stores/authStore'

const createConfig = (): InternalAxiosRequestConfig => ({
  headers: new AxiosHeaders(),
  method: 'get',
  url: '/health'
})

const readAuthorizationHeader = (config: InternalAxiosRequestConfig) => {
  if (!config.headers) {
    return undefined
  }
  if (config.headers instanceof AxiosHeaders) {
    return config.headers.get('Authorization') ?? undefined
  }
  return (config.headers as Record<string, string | undefined>).Authorization
}

describe('attachAuthorizationHeader', () => {
  beforeEach(() => {
    resetAuthStoreForTesting()
    sessionStorage.clear()
  })

  it('applies bearer token from auth store', () => {
    useAuthStore.setState({ accessToken: 'store-token' })

    const updated = attachAuthorizationHeader(createConfig())

    expect(readAuthorizationHeader(updated)).toBe('Bearer store-token')
  })

  it('falls back to sessionStorage when store is empty', () => {
    sessionStorage.setItem('ft_access_token', 'stored-token')

    const updated = attachAuthorizationHeader(createConfig())

    expect(readAuthorizationHeader(updated)).toBe('Bearer stored-token')
  })

  it('keeps headers untouched when token is missing', () => {
    const updated = attachAuthorizationHeader(createConfig())

    expect(readAuthorizationHeader(updated)).toBeUndefined()
  })
})
