/**
 * なぜテストが必要か:
 * - Authorization ヘッダーが付与されないと JWT が必要なエンドポイントへアクセスできず、全体の認証フローが破綻するため。
 * - Zustand ストアや sessionStorage の状態に依存するロジックが意図通りに動くかを自動テストで担保する。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { api, attachAuthorizationHeader } from './api'
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

describe('response interceptor (401 handling)', () => {
  const getResponseRejector = () => {
    const handlers = (api.interceptors.response as any).handlers as Array<{
      fulfilled?: (value: unknown) => unknown
      rejected?: (error: any) => Promise<any>
    }>
    const handler = handlers.find((h) => typeof h?.rejected === 'function')
    if (!handler?.rejected) {
      throw new Error('Response interceptor not registered')
    }
    return handler.rejected
  }

  const createAxios401Error = () => {
    const error: any = new Error('Request failed with status 401')
    error.config = { url: '/auth/login', headers: {} }
    error.response = { status: 401, data: { error: { message: 'Unauthorized' } } }
    return error
  }

  beforeEach(() => {
    resetAuthStoreForTesting()
    sessionStorage.clear()
  })

  it('rejects promptly when refresh token is absent, even after repeated 401 responses', async () => {
    const rejector = getResponseRejector()

    await expect(rejector(createAxios401Error())).rejects.toBeTruthy()
    await expect(rejector(createAxios401Error())).rejects.toBeTruthy()
  })
})
