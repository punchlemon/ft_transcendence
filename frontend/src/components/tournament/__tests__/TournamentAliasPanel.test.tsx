/**
 * なぜテストが必要か:
 * - トーナメントの入力フォームが props に依存して正しく制御されているかを検証し、不整合による登録エラーを未然に防ぐ。
 * - 状態メッセージやボタン活性制御が想定どおりに動くことで、画面全体の UX を担保する。
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TournamentAliasPanel from '../TournamentAliasPanel'

describe('TournamentAliasPanel', () => {
  it('入力値変更時に onAliasChange が呼ばれる', () => {
    const onAliasChange = vi.fn()
    const onSubmit = vi.fn()

    render(
      <TournamentAliasPanel
        aliasInput=""
        onAliasChange={onAliasChange}
        onSubmit={onSubmit}
        errorMessage={null}
        infoMessage={null}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('例: Meteor'), { target: { value: 'Nova' } })

    expect(onAliasChange).toHaveBeenCalledTimes(1)
    expect(onAliasChange).toHaveBeenCalledWith('Nova')
  })

  it('isSubmitDisabled が true の場合はボタンが無効になる', () => {
    render(
      <TournamentAliasPanel
        aliasInput=""
        onAliasChange={vi.fn()}
        onSubmit={vi.fn()}
        errorMessage={null}
        infoMessage={null}
        isSubmitDisabled
      />
    )

    expect(screen.getByRole('button', { name: '参加登録' })).toBeDisabled()
  })

  it('メッセージが渡されたときに表示される', () => {
    render(
      <TournamentAliasPanel
        aliasInput="Nova"
        onAliasChange={vi.fn()}
        onSubmit={vi.fn()}
        errorMessage="同じエイリアスは登録できません"
        infoMessage="参加者を追加しました"
      />
    )

    expect(screen.getByText('同じエイリアスは登録できません')).toBeInTheDocument()
    expect(screen.getByText('参加者を追加しました')).toBeInTheDocument()
  })

  it('フォーム送信で onSubmit が呼ばれる', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((event) => event.preventDefault())

    render(
      <TournamentAliasPanel
        aliasInput="Orion"
        onAliasChange={vi.fn()}
        onSubmit={onSubmit}
        errorMessage={null}
        infoMessage={null}
      />
    )

    await user.click(screen.getByRole('button', { name: '参加登録' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

/*
解説:

1) describe ブロック
  - TournamentAliasPanel の主要挙動を 4 ケースに分解し、入力変更・ボタン状態・メッセージ表示・送信イベントをそれぞれ独立に検証している。

2) userEvent.setup()
  - 実ユーザー操作に近い形でタイプ/クリックをシミュレートし、フォーム制御が正しく反応するか確かめる。

3) onSubmit モック
  - `event.preventDefault()` を呼びつつモックを検出し、TournamentPage から渡されるハンドラと同じ契約を再現している。
*/
