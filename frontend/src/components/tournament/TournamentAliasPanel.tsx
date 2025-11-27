import { FormEvent } from 'react'
import Button from '../ui/Button'

type TournamentAliasPanelProps = {
  aliasInput: string
  onAliasChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  errorMessage?: string | null
  infoMessage?: string | null
  isSubmitDisabled?: boolean
}

const TournamentAliasPanel = ({
  aliasInput,
  onAliasChange,
  onSubmit,
  errorMessage,
  infoMessage,
  isSubmitDisabled
}: TournamentAliasPanelProps) => {
  return (
    <div className="mt-6">
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit} aria-label="トーナメント参加フォーム">
        <input
          type="text"
          value={aliasInput}
          onChange={(event) => onAliasChange(event.target.value)}
          placeholder="例: Meteor"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <Button type="submit" disabled={isSubmitDisabled}>
          参加登録
        </Button>
      </form>
      {errorMessage && <p className="mt-2 text-sm text-red-600">{errorMessage}</p>}
      {infoMessage && <p className="mt-2 text-sm text-brand-dark">{infoMessage}</p>}
    </div>
  )
}

export default TournamentAliasPanel

/*
解説:

1) TournamentAliasPanelProps
  - 親コンポーネントから状態とハンドラを受け取り、フォーム内で副作用を持たずに入力値と送信処理を委譲するための契約を明示する。

2) form レイアウト
  - `aria-label` を付与してスクリーンリーダーから識別しやすくし、SM 以上では横並び・モバイルでは縦積みになるよう Tailwind クラスを組み合わせている。

3) メッセージ表示
  - エラーを優先して表示し、成功/情報メッセージは brand カラーで描画することで、TournamentPage から渡された状態が視認できるようにする。
*/
