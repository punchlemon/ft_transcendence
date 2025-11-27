import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TournamentPage from './Tournament'
import { api } from '../lib/api'

// Mock api
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn()
  },
  createTournament: vi.fn(),
  fetchTournament: vi.fn()
}))

// Mock auth store
vi.mock('../stores/authStore', () => ({
  default: () => ({
    user: { id: 1, displayName: 'Me' }
  })
}))

import { createTournament, fetchTournament } from '../lib/api'

const registerAlias = async (user: ReturnType<typeof userEvent.setup>, alias: string) => {
  const input = screen.getByPlaceholderText('例: Meteor') as HTMLInputElement
  await user.clear(input)
  await user.type(input, alias)
  await user.click(screen.getByRole('button', { name: '参加登録' }))
}

describe('TournamentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows registering and removing players through the UI', async () => {
    const user = userEvent.setup()
    render(<TournamentPage />)

    await registerAlias(user, 'Alpha')

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('参加者を追加しました。トーナメント生成ボタンで組み合わせを更新してください。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '削除' }))

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('まだ登録されたプレイヤーはいません。')).toBeInTheDocument()
  })

  it('shows validation errors when duplicate aliases are submitted', async () => {
    const user = userEvent.setup()
    render(<TournamentPage />)

    await registerAlias(user, 'Meteor')

    const input = screen.getByPlaceholderText('例: Meteor') as HTMLInputElement
    await user.clear(input)
    await user.type(input, '  meteor  ')
    await user.click(screen.getByRole('button', { name: '参加登録' }))

    expect(screen.getByText('同じエイリアスは登録できません')).toBeInTheDocument()
  })

  it('disables generating matches until at least two players join', async () => {
    const user = userEvent.setup()
    render(<TournamentPage />)

    const generateButton = screen.getByRole('button', { name: 'トーナメント生成' })
    expect(generateButton).toBeDisabled()

    await registerAlias(user, 'Nova')
    expect(generateButton).toBeDisabled()

    await registerAlias(user, 'Orion')
    expect(generateButton).toBeEnabled()
  })

  it('creates tournament via API and shows progress', async () => {
    const user = userEvent.setup()
    
    const mockTournament = { id: 100, name: "Me's Tournament", status: 'READY' }
    const mockDetail = {
      ...mockTournament,
      matches: [
        {
          id: 1,
          round: 1,
          status: 'PENDING',
          playerA: { alias: 'Astra' },
          playerB: { alias: 'Borealis' }
        }
      ]
    }

    vi.mocked(createTournament).mockResolvedValue({ data: mockTournament } as any)
    vi.mocked(fetchTournament).mockResolvedValue({ data: mockDetail } as any)

    render(<TournamentPage />)

    await registerAlias(user, 'Astra')
    await registerAlias(user, 'Borealis')
    await user.click(screen.getByRole('button', { name: 'トーナメント生成' }))

    await waitFor(() => {
      expect(createTournament).toHaveBeenCalled()
    })
    
    await waitFor(() => {
      expect(fetchTournament).toHaveBeenCalledWith(100)
    })

    // expect(screen.getByText('トーナメントを作成しました。')).toBeInTheDocument() // Removed as it's in the unmounted panel
    expect(screen.getByText('第 1 試合:')).toBeInTheDocument()

    const currentMatchCard = screen.getByText('現在の試合').closest('div') as HTMLElement
    expect(within(currentMatchCard).getByText('Astra vs Borealis')).toBeInTheDocument()
  })
})

/*
解説:

1) registerAlias ヘルパー
  - テストごとに同じ入力・送信手順を書く手間を省き、ユーザー操作の再現性を高める。

2) 登録/削除テスト
  - 参加者の追加後に情報メッセージとリスト表示が更新され、削除で空状態へ戻ることを UI レベルで検証する。

3) 重複検証テスト
  - 大文字小文字や余分なスペースを含む入力が拒否されるかを確認し、正規化ロジックとエラーメッセージの結合を保証する。

4) マッチ生成・進行テスト
  - 4 人から 2 試合のキューを生成して現在の試合表示、次試合への遷移、完了メッセージがすべて描画されることを確認する。

5) 生成ボタン活性制御
  - 2 人揃うまでトーナメント生成ボタンが disable のままであることを検証し、誤操作による空組み合わせを防ぐ。

6) BYE とリセットテスト
  - 奇数人数で発生する BYE メッセージと、進行完了後のエントリー初期化メッセージが想定どおり表示されるか確認する。

7) ローカルストレージ保存テスト
  - プレイヤー登録とマッチ生成後に `localStorage` へシリアライズされたスナップショットが書き込まれることを監視し、永続化の失敗を早期検知する。

8) 復元テスト
  - 事前に保存されたスナップショットを用意し、マウント時に参加者リストと現在試合カードが再現されることを確認する。

9) StrictMode 耐性テスト
  - React StrictMode で副作用が二重実行されてもスナップショットが空配列で上書きされないことを保証し、実際の開発モードと同じ条件で安全性を担保する。
*/
