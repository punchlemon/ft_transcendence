/**
 * なぜテストが必要か:
 * - ルーティングのルート要素がレンダリングできることを確認し、将来的なページ追加時の崩れを早期検知する。
 * - Vitest + Testing Library のセットアップが正しいことを保証する。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { resetAuthStoreForTesting } from './stores/authStore'

describe('App', () => {
  beforeEach(() => {
    resetAuthStoreForTesting()
    sessionStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('renders site title', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'ft_transcendence' })).toBeInTheDocument()
  })

  it('shows login link when user is not authenticated', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'ログイン' })).toBeInTheDocument()
  })

  it('restores navbar state from sessionStorage snapshot', async () => {
    sessionStorage.setItem('ft_access_token', 'sample-access')
    sessionStorage.setItem('ft_refresh_token', 'sample-refresh')
    sessionStorage.setItem('ft_user', JSON.stringify({ id: 9, displayName: 'Daisy', status: 'ONLINE' }))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('navbar-auth-state')).toBeInTheDocument()
    })
    expect(screen.getByText('Daisy')).toBeInTheDocument()
  })

  it('renders 2FA route content', () => {
    window.history.pushState({}, '', '/auth/2fa')
    render(<App />)
    expect(screen.getByText('二段階認証')).toBeInTheDocument()
  })

  it('renders OAuth callback route content', () => {
    window.history.pushState({}, '', '/oauth/callback')
    render(<App />)
    expect(screen.getByText('OAuth コールバック')).toBeInTheDocument()
  })
})

/*
解説:

1) import 群
  - Testing Library でコンポーネントをレンダリングし、`App` を直接読み込んで検証する。

2) describe/it
  - アプリのヘッダーに表示されるタイトルが DOM に存在するかを検証し、基本的な描画が壊れていないことを確認する。

3) expect(...).toBeInTheDocument()
  - `getByRole('link', { name: 'ft_transcendence' })` でヘッダーロゴのアンカーを特定し、主要ナビゲーションが描画されたことを保証する。
*/
