/**
 * なぜテストが必要か:
 * - Home ページのヒーローテキストや説明文がレンダリングされることを保証し、主要導線が崩れていないかを検知する。
 * - ヘルスチェックとトーナメントへの遷移ボタンが正しいパスで `useNavigate` を呼び出すかを確認し、UX の破綻を早期に察知する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HomePage from './Home'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

describe('HomePage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders hero title, description, and navigation buttons', () => {
    render(<HomePage />)

    expect(screen.getByRole('heading', { name: 'ft_transcendence' })).toBeInTheDocument()
    expect(
      screen.getByText('Pong をベースにした SPA を構築する最終課題です。まずはバックエンドのヘルスチェックから動作確認しましょう。')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ヘルスチェックへ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'トーナメント管理を開く' })).toBeInTheDocument()
  })

  it('navigates to health and tournament paths when buttons are clicked', async () => {
    const user = userEvent.setup()
    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: 'ヘルスチェックへ' }))
    await user.click(screen.getByRole('button', { name: 'トーナメント管理を開く' }))

    expect(mockNavigate).toHaveBeenNthCalledWith(1, '/health')
    expect(mockNavigate).toHaveBeenNthCalledWith(2, '/tournament')
  })
})

/*
解説:

1) mockNavigate / vi.mock
  - React Router の `useNavigate` をテスト内で監視できるよう差し替え、リンク遷移の副作用を直接検証する。

2) renders hero title ... テスト
  - 主要コピーとボタンが DOM に存在するかを確認し、Home ページが想定どおり描画されるかを担保する。

3) navigates ... テスト
  - ユーザー操作で `useNavigate` が正しい順序と引数で呼ばれることを確認し、導線の破綻を防ぐ。
*/
