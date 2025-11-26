/**
 * なぜテストが必要か:
 * - ルーティングのルート要素がレンダリングできることを確認し、将来的なページ追加時の崩れを早期検知する。
 * - Vitest + Testing Library のセットアップが正しいことを保証する。
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders site title', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'ft_transcendence' })).toBeInTheDocument()
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
