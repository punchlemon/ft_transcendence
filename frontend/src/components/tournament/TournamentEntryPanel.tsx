import Button from '../ui/Button'

type TournamentEntryPanelProps = {
  players: string[]
  onRemove: (alias: string) => void
  onGenerate: () => void
  onReset: () => void
  isGenerateDisabled?: boolean
  hideGenerateButton?: boolean
}

const TournamentEntryPanel = ({
  players,
  onRemove,
  onGenerate,
  onReset,
  isGenerateDisabled,
  hideGenerateButton
}: TournamentEntryPanelProps) => {
  return (
    <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
      <h2 className="text-lg font-semibold text-slate-800">エントリー一覧</h2>
      {players.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">まだ登録されたプレイヤーはいません。</p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="登録済みプレイヤー一覧">
          {players.map((alias) => (
            <li key={alias} className="flex items-center justify-between rounded-lg bg-white px-4 py-2 text-sm shadow">
              <span className="font-medium text-slate-700">{alias}</span>
              <Button variant="secondary" onClick={() => onRemove(alias)}>
                削除
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {!hideGenerateButton && (
          <Button onClick={onGenerate} disabled={Boolean(isGenerateDisabled)}>
            トーナメント生成
          </Button>
        )}
        <Button variant="secondary" onClick={onReset}>
          エントリーをリセット
        </Button>
      </div>
    </div>
  )
}

export default TournamentEntryPanel

/*
解説:

1) props
  - 親から受け取ったコールバックのみを実行してステートレスに保つことで、単体テスト時に操作イベントを簡潔に検証できるようにする。

2) 空状態と一覧
  - `players.length` で分岐し、登録がない場合はプレースホルダー文言、ある場合は `aria-label` 付きの `ul` を描画してアクセシビリティを担保する。

3) アクションボタン
  - 生成ボタンの disable 判定を props 依存にし、リセット/削除ボタンも含めて UI レイヤーに留めることでビジネスロジックを TournamentPage 側へ閉じ込める。
*/
