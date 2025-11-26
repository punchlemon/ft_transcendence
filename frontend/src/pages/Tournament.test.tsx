/**
 * なぜテストが必要か:
 * - Tournament ページのフォーム登録やマッチ操作を UI レベルで検証し、純粋関数だけでは検知できないイベント連携の欠陥を防ぐ。
 * - 重複エイリアス検出や BYE を含むマッチ進行のステータス表示が崩れていないか、ユーザー視点の DOM を通じて確認する。
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TournamentPage from './Tournament'

const registerAlias = async (user: ReturnType<typeof userEvent.setup>, alias: string) => {
  const input = screen.getByPlaceholderText('例: Meteor') as HTMLInputElement
  await user.clear(input)
  await user.type(input, alias)
  await user.click(screen.getByRole('button', { name: '参加登録' }))
}

describe('TournamentPage', () => {
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
*/
