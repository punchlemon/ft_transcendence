import { FormEvent, useState } from 'react'
import Button from '../components/ui/Button'
import {
  MatchQueueItem,
  advanceToNextMatch,
  aliasExists,
  buildMatchQueue,
  findNextMatch,
  normalizeAlias
} from '../lib/tournament'

const TournamentPage = () => {
  const [aliasInput, setAliasInput] = useState('')
  const [players, setPlayers] = useState<string[]>([])
  const [matchQueue, setMatchQueue] = useState<MatchQueueItem[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  const currentMatch = findNextMatch(matchQueue, currentMatchIndex)
  const isTournamentReady = players.length >= 2
  const hasActiveTournament = matchQueue.length > 0 && currentMatchIndex !== -1

  const resetMatchProgress = () => {
    setMatchQueue([])
    setCurrentMatchIndex(-1)
  }

  const handleRegisterPlayer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedAlias = normalizeAlias(aliasInput)

    if (!normalizedAlias) {
      setErrorMessage('エイリアスを入力してください')
      return
    }

    if (aliasExists(players, normalizedAlias)) {
      setErrorMessage('同じエイリアスは登録できません')
      return
    }

    setPlayers((previous) => [...previous, normalizedAlias])
    setAliasInput('')
    setErrorMessage(null)
    setInfoMessage('参加者を追加しました。トーナメント生成ボタンで組み合わせを更新してください。')
    resetMatchProgress()
  }

  const handleRemovePlayer = (alias: string) => {
    setPlayers((previous) => previous.filter((entry) => entry !== alias))
    resetMatchProgress()
    setInfoMessage('参加者を削除しました。必要であれば再度トーナメントを生成してください。')
  }

  const handleGenerateMatches = () => {
    const queue = buildMatchQueue(players)
    setMatchQueue(queue)
    setCurrentMatchIndex(queue.length > 0 ? 0 : -1)
    setInfoMessage(queue.length > 0 ? 'トーナメントを開始しました。' : 'プレイヤー数が不足しています。')
  }

  const handleAdvanceMatch = () => {
    const nextIndex = advanceToNextMatch(matchQueue, currentMatchIndex)
    setCurrentMatchIndex(nextIndex)
    setInfoMessage(
      nextIndex === -1 ? '全ての試合が完了しました。エントリーを更新して次の大会を始めましょう。' : '次の試合に進みました。'
    )
  }

  const handleResetTournament = () => {
    setPlayers([])
    setAliasInput('')
    setInfoMessage('エントリーを初期化しました。')
    setErrorMessage(null)
    resetMatchProgress()
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">トーナメント管理</h1>
        <p className="mt-2 text-sm text-slate-600">
          参加者のエイリアスを登録し、順番を確定してからトーナメント生成ボタンを押してください。
        </p>

        <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={handleRegisterPlayer}>
          <input
            type="text"
            value={aliasInput}
            onChange={(event) => setAliasInput(event.target.value)}
            placeholder="例: Meteor"
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <Button type="submit" disabled={!aliasInput.trim()}>
            参加登録
          </Button>
        </form>

        {errorMessage && <p className="mt-2 text-sm text-red-600">{errorMessage}</p>}
        {infoMessage && <p className="mt-2 text-sm text-brand-dark">{infoMessage}</p>}

        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <h2 className="text-lg font-semibold text-slate-800">エントリー一覧</h2>
          {players.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">まだ登録されたプレイヤーはいません。</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {players.map((alias) => (
                <li key={alias} className="flex items-center justify-between rounded-lg bg-white px-4 py-2 text-sm shadow">
                  <span className="font-medium text-slate-700">{alias}</span>
                  <Button variant="secondary" onClick={() => handleRemovePlayer(alias)}>
                    削除
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={handleGenerateMatches} disabled={!isTournamentReady}>
            トーナメント生成
          </Button>
          <Button variant="secondary" onClick={handleResetTournament}>
            エントリーをリセット
          </Button>
        </div>
      </section>

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
            <Button className="mt-4" onClick={handleAdvanceMatch}>
              次の試合へ進む
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            {hasActiveTournament ? '全ての試合が終了しました。' : 'トーナメント生成ボタンでマッチメイクを開始してください。'}
          </p>
        )}

        {matchQueue.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">組み合わせ一覧</h3>
            <ol className="mt-3 space-y-2">
              {matchQueue.map((match, index) => (
                <li
                  key={match.id}
                  className={`rounded-lg border px-4 py-2 text-sm ${
                    index === currentMatchIndex ? 'border-brand bg-brand/5 text-slate-900' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <span className="font-semibold">第 {index + 1} 試合:</span> {match.players[0]} vs {match.players[1] ?? 'シード'}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  )
}

export default TournamentPage

/*
解説:

1) import 群
  - UI コンポーネント `Button` とトーナメント用ユーティリティ関数を読み込み、React Hooks でフォーム状態やマッチ進行を制御する準備を行う。

2) state 管理
  - エイリアス入力、参加者配列、マッチキュー、現在の試合インデックス、エラー/情報メッセージを `useState` で保持し、ユーザー操作に応じて純粋関数の結果を反映する。

3) handleRegisterPlayer などのイベントハンドラ
  - エイリアスの正規化と重複チェックを行い、参加者の追加・削除・トーナメント生成・進行・リセットを手続き的にまとめている。登録変更時にはマッチキューをリセットして矛盾を防ぐ。

4) JSX レイアウト
  - エントリー管理と進行状況の 2 セクションで構成し、現在の試合カードや組み合わせ一覧を視覚的に区別。Tailwind CSS クラスでレスポンシブかつ視認性の高い UI を実現する。

5) export default TournamentPage
  - ルーティングから利用できるようにページコンポーネントを公開し、SPA の主要機能としてトーナメント管理画面を追加する。
*/
