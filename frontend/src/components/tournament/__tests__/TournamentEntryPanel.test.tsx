/**
 * なぜテストが必要か:
 * - 参加者一覧の空状態とリスト表示の両方を保証し、アクセシビリティラベルが欠落しないようにする。
 * - 削除/生成/リセットといった主要アクションが正しいハンドラを呼ぶか確認し、トーナメント進行のバグを防ぐ。
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TournamentEntryPanel from '../TournamentEntryPanel'

describe('TournamentEntryPanel', () => {
  it('参加者がいない場合は空状態メッセージを表示する', () => {
    render(
      <TournamentEntryPanel
        players={[]}
        onRemove={vi.fn()}
        onGenerate={vi.fn()}
        onReset={vi.fn()}
        isGenerateDisabled
      />
    )

    expect(screen.getByText('まだ登録されたプレイヤーはいません。')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '登録済みプレイヤー一覧' })).not.toBeInTheDocument()
  })

  it('登録済みプレイヤーを一覧表示し、削除ボタンで onRemove を呼ぶ', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()

    render(
      <TournamentEntryPanel
        players={['Alpha', 'Beta']}
        onRemove={onRemove}
        onGenerate={vi.fn()}
        onReset={vi.fn()}
        isGenerateDisabled={false}
      />
    )

    const list = screen.getByRole('list', { name: '登録済みプレイヤー一覧' })
    expect(list).toHaveTextContent('Alpha')
    expect(list).toHaveTextContent('Beta')

    const removeButtons = screen.getAllByRole('button', { name: '削除' })
    await user.click(removeButtons[1])

    expect(onRemove).toHaveBeenCalledWith('Beta')
  })

  it('生成/リセットボタンで各ハンドラが呼ばれ、無効化状態も反映される', async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()
    const onReset = vi.fn()

    const { rerender } = render(
      <TournamentEntryPanel
        players={['Alpha']}
        onRemove={vi.fn()}
        onGenerate={onGenerate}
        onReset={onReset}
        isGenerateDisabled
      />
    )

    const generateButton = screen.getByRole('button', { name: 'トーナメント生成' })
    expect(generateButton).toBeDisabled()

    rerender(
      <TournamentEntryPanel
        players={['Alpha']}
        onRemove={vi.fn()}
        onGenerate={onGenerate}
        onReset={onReset}
        isGenerateDisabled={false}
      />
    )

    await user.click(screen.getByRole('button', { name: 'トーナメント生成' }))
    await user.click(screen.getByRole('button', { name: 'エントリーをリセット' }))

    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})

/*
解説:

1) 空状態テスト
  - 参加者が 0 人のときに案内文が表示され、リスト DOM が出現しないことを確認している。

2) 削除ボタンテスト
  - 2 名登録したケースを描画し、`getAllByRole` で削除ボタン群を取得してクリック → 指定 alias で `onRemove` が呼ばれることを検証する。

3) 生成/リセット操作
  - `rerender` で `isGenerateDisabled` を切り替え、ボタン活性状態とコールバック呼び出しを同一テストで網羅している。
*/
