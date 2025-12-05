/**
 * Why this test is needed:
 * - Validates that the tournament entry form is correctly controlled by props and prevents registration errors.
 * - Ensures status messages and button states work as expected, maintaining UX integrity.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TournamentAliasPanel from '../TournamentAliasPanel'

describe('TournamentAliasPanel', () => {
  it('input change calls onAliasChange', () => {
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

    fireEvent.change(screen.getByPlaceholderText('e.g. Meteor'), { target: { value: 'Nova' } })

    expect(onAliasChange).toHaveBeenCalledTimes(1)
    expect(onAliasChange).toHaveBeenCalledWith('Nova')
  })

  it('disables button when isSubmitDisabled is true', () => {
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

    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled()
  })

  it('displays messages when provided', () => {
    render(
      <TournamentAliasPanel
        aliasInput="Nova"
        onAliasChange={vi.fn()}
        onSubmit={vi.fn()}
        errorMessage="Duplicate alias"
        infoMessage="Participant added"
      />
    )

    expect(screen.getByText('Duplicate alias')).toBeInTheDocument()
    expect(screen.getByText('Participant added')).toBeInTheDocument()
  })

  it('calls onSubmit when form is submitted', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Register' }))

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
