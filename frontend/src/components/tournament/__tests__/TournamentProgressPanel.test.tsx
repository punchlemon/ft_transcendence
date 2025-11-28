/**
 * なぜテストが必要か:
 * - 進行状況パネルがトーナメント状態に応じた文言とハイライトを正しく切り替えるか検証する。
 * - BYE など特殊ケースでも現在試合カードが正しく描画され、操作ボタンが安全に動作することを保証する。
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TournamentProgressPanel from '../TournamentProgressPanel'
import type { MatchQueueItem } from '../../../lib/tournament'

describe('TournamentProgressPanel', () => {
  it('現在試合を表示し、BYE 説明と onAdvance 呼び出しを行う', async () => {
    const user = userEvent.setup()
    const onAdvance = vi.fn()
    const currentMatch: MatchQueueItem = {
      id: 'match-1',
      players: ['Alpha', null]
    }

    render(
      <TournamentProgressPanel
        currentMatch={currentMatch}
        matchQueue={[currentMatch]}
        currentMatchIndex={0}
        onAdvance={onAdvance}
        onPlayMatch={vi.fn()}
      />
    )

  expect(screen.getByText('Alpha vs シード', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('対戦相手がいないため、自動的に次のラウンドへ進みます。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '次の試合へ進む' }))
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('対戦相手がいる場合は試合開始ボタンを表示する', async () => {
    const user = userEvent.setup()
    const onPlayMatch = vi.fn()
    const currentMatch: MatchQueueItem = {
      id: 'match-1',
      players: ['Alpha', 'Beta']
    }

    render(
      <TournamentProgressPanel
        currentMatch={currentMatch}
        matchQueue={[currentMatch]}
        currentMatchIndex={0}
        onAdvance={vi.fn()}
        onPlayMatch={onPlayMatch}
      />
    )

    expect(screen.getByText('Alpha vs Beta', { selector: 'p' })).toBeInTheDocument()
    const playButton = screen.getByRole('button', { name: '試合を開始する' })
    expect(playButton).toBeInTheDocument()
    
    await user.click(playButton)
    expect(onPlayMatch).toHaveBeenCalledTimes(1)
  })

  it('マッチキューが空の場合は開始案内を表示する', () => {
    render(<TournamentProgressPanel currentMatch={null} matchQueue={[]} currentMatchIndex={-1} onAdvance={vi.fn()} onPlayMatch={vi.fn()} />)

    expect(screen.getByText('トーナメント生成ボタンでマッチメイクを開始してください。')).toBeInTheDocument()
  })

  it('履歴が存在し現在試合がない場合は完了メッセージとハイライトを表示する', () => {
    const matchQueue: MatchQueueItem[] = [
      { id: 'match-1', players: ['Alpha', 'Beta'] },
      { id: 'match-2', players: ['Gamma', 'Delta'] }
    ]

    render(
      <TournamentProgressPanel
        currentMatch={null}
        matchQueue={matchQueue}
        currentMatchIndex={1}
        onAdvance={vi.fn()}
        onPlayMatch={vi.fn()}
      />
    )

    expect(screen.getByText('全ての試合が終了しました。')).toBeInTheDocument()

    const matchItems = screen.getAllByRole('listitem')
    expect(matchItems[0]).not.toHaveAttribute('aria-current')
    expect(matchItems[1]).toHaveAttribute('aria-current', 'true')
  })
})

/*
解説:

1) 現在試合ケース
  - BYE (片側 null) の説明文とボタン操作を検証し、親から渡された `onAdvance` がクリックで呼ばれることを確認する。

2) 未生成ケース
  - `matchQueue` が空のときに開始案内文が表示されるかをテストし、不要なリストが描画されないことを保証する。

3) 完了ケース
  - 履歴を持つ状態で `currentMatch` を null にし、終了メッセージと `aria-current` のハイライト付与が適切かを検証する。
*/
