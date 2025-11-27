import Button from '../ui/Button'
import type { MatchQueueItem } from '../../lib/tournament'

type TournamentProgressPanelProps = {
  currentMatch: MatchQueueItem | null
  matchQueue: MatchQueueItem[]
  currentMatchIndex: number
  onAdvance: () => void
}

const TournamentProgressPanel = ({ currentMatch, matchQueue, currentMatchIndex, onAdvance }: TournamentProgressPanelProps) => {
  const hasTournamentHistory = matchQueue.length > 0

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">進行状況</h2>
      {currentMatch ? (
        <div className="mt-4 rounded-xl border border-brand/40 bg-brand/10 p-4">
          <p className="text-sm text-slate-600">現在の試合</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {currentMatch.players[0]} vs {currentMatch.players[1] ?? 'シード'}
          </p>
          {currentMatch.players[1] === null && (
            <p className="mt-1 text-sm text-slate-600">対戦相手がいないため、自動的に次のラウンドへ進みます。</p>
          )}
          <Button className="mt-4" onClick={onAdvance}>
            次の試合へ進む
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">
          {hasTournamentHistory ? '全ての試合が終了しました。' : 'トーナメント生成ボタンでマッチメイクを開始してください。'}
        </p>
      )}

      {matchQueue.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">組み合わせ一覧</h3>
          <ol className="mt-3 space-y-2" aria-label="トーナメント組み合わせ一覧">
            {matchQueue.map((match, index) => (
              <li
                key={match.id}
                className={`rounded-lg border px-4 py-2 text-sm ${
                  index === currentMatchIndex ? 'border-brand bg-brand/5 text-slate-900' : 'border-slate-200 text-slate-600'
                }`}
                aria-current={index === currentMatchIndex ? 'true' : undefined}
              >
                <span className="font-semibold">第 {index + 1} 試合:</span> {match.players[0]} vs {match.players[1] ?? 'シード'}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

export default TournamentProgressPanel

/*
解説:

1) hasTournamentHistory
  - マッチキューが存在するかを判定し、進行が完了した場合のメッセージと、未生成時の案内文を適切に出し分けるために利用する。

2) 現在試合カード
  - `players[1]` が null の場合は BYE 説明を表示し、常に「次の試合へ進む」ボタンで親から受け取った `onAdvance` を呼び出すだけに留めて UI を純粋化する。

3) 組み合わせ一覧
  - `aria-current` とクラスのハイライトを同期させ、DOM レベルで現在の試合がわかるようにした。リストは `aria-label` を与えて支援技術に対して意味を伝える。
*/
