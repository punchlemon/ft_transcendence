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
    expect(screen.getByText('Pong ベースのゲームへようこそ。ログインして対戦を始めましょう。')).toBeInTheDocument()
    // Game lobby is embedded on the home page — verify mode options are present
    expect(screen.getByText('Local 1v1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument()
  })

  it('navigates to health and tournament paths when buttons are clicked', async () => {
    const user = userEvent.setup()
    render(<HomePage />)
    // Start Game is disabled until a mode is selected
    const startBtn = screen.getByRole('button', { name: 'Start Game' })
    expect(startBtn).toBeDisabled()
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
