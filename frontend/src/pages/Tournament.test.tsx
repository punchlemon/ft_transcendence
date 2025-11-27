/**
 * なぜテストが必要か:
 * - Tournament ページのフォーム登録やマッチ操作を UI レベルで検証し、純粋関数だけでは検知できないイベント連携の欠陥を防ぐ。
 * - 重複エイリアス検出や BYE を含むマッチ進行のステータス表示が崩れていないか、ユーザー視点の DOM を通じて確認する。
 */
import { StrictMode } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TournamentPage, { TOURNAMENT_STATE_STORAGE_KEY } from './Tournament'

const registerAlias = async (user: ReturnType<typeof userEvent.setup>, alias: string) => {
  const input = screen.getByPlaceholderText('例: Meteor') as HTMLInputElement
  await user.clear(input)
  await user.type(input, alias)
  await user.click(screen.getByRole('button', { name: '参加登録' }))
}

describe('TournamentPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
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

  it('persists players and match queue to localStorage', async () => {
    const user = userEvent.setup()
    render(<TournamentPage />)

    await registerAlias(user, 'Astra')
    await registerAlias(user, 'Borealis')
    await user.click(screen.getByRole('button', { name: 'トーナメント生成' }))

    await waitFor(() => {
      const raw = window.localStorage.getItem(TOURNAMENT_STATE_STORAGE_KEY)
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(parsed.players).toEqual(['Astra', 'Borealis'])
      expect(parsed.matchQueue).toHaveLength(1)
      expect(parsed.currentMatchIndex).toBe(0)
    })
  })

  it('generates matches and advances through the queue', async () => {
    const user = userEvent.setup()
    render(<TournamentPage />)

    await registerAlias(user, 'Astra')
    await registerAlias(user, 'Borealis')
    await registerAlias(user, 'Cosmos')
    await registerAlias(user, 'Draco')

    await user.click(screen.getByRole('button', { name: 'トーナメント生成' }))

    expect(screen.getByText('トーナメントを開始しました。')).toBeInTheDocument()
  expect(screen.getByText('第 1 試合:')).toBeInTheDocument()

  const currentMatchCard = screen.getByText('現在の試合').closest('div') as HTMLElement
  expect(within(currentMatchCard).getByText('Astra vs Borealis')).toBeInTheDocument()

    const advanceButton = screen.getByRole('button', { name: '次の試合へ進む' })
    await user.click(advanceButton)
    await user.click(screen.getByRole('button', { name: '次の試合へ進む' }))

    expect(screen.getByText('全ての試合が終了しました。')).toBeInTheDocument()
    expect(screen.getByText('全ての試合が完了しました。エントリーを更新して次の大会を始めましょう。')).toBeInTheDocument()
  })

  it('restores persisted tournament state on mount', async () => {
    const snapshot = {
      players: ['Helios', 'Luna'],
      matchQueue: [
        {
          id: 'match-1',
          players: ['Helios', 'Luna'] as [string, string | null]
        }
      ],
      currentMatchIndex: 0
    }
    window.localStorage.setItem(TOURNAMENT_STATE_STORAGE_KEY, JSON.stringify(snapshot))

    render(<TournamentPage />)

    expect(await screen.findByText('Helios')).toBeInTheDocument()
    expect(await screen.findByText('第 1 試合:')).toBeInTheDocument()
    const restoredCard = (await screen.findByText('現在の試合')).closest('div') as HTMLElement
    expect(within(restoredCard).getByText('Helios vs Luna')).toBeInTheDocument()
  })

  it('keeps localStorage snapshot intact under StrictMode double render', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <TournamentPage />
      </StrictMode>
    )

    await registerAlias(user, 'Atlas')
    await registerAlias(user, 'Boreas')
    await user.click(screen.getByRole('button', { name: 'トーナメント生成' }))

    const raw = window.localStorage.getItem(TOURNAMENT_STATE_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.players).toEqual(['Atlas', 'Boreas'])
    expect(parsed.matchQueue).toHaveLength(1)
    expect(parsed.currentMatchIndex).toBe(0)
  })

  it('handles bye rounds and resets entries after completion', async () => {
    const user = userEvent.setup()
    render(<TournamentPage />)

    await registerAlias(user, 'Aster')
    await registerAlias(user, 'Blaze')
    await registerAlias(user, 'Comet')

    await user.click(screen.getByRole('button', { name: 'トーナメント生成' }))
    await user.click(screen.getByRole('button', { name: '次の試合へ進む' }))

    expect(screen.getByText('対戦相手がいないため、自動的に次のラウンドへ進みます。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '次の試合へ進む' }))

    expect(screen.getByText('全ての試合が終了しました。')).toBeInTheDocument()
    expect(screen.getByText('全ての試合が完了しました。エントリーを更新して次の大会を始めましょう。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'エントリーをリセット' }))

    expect(screen.getByText('エントリーを初期化しました。')).toBeInTheDocument()
    expect(screen.getByText('まだ登録されたプレイヤーはいません。')).toBeInTheDocument()
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
