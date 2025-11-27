import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  MatchQueueItem,
  advanceToNextMatch,
  aliasExists,
  buildMatchQueue,
  findNextMatch,
  normalizeAlias
} from '../lib/tournament'
import TournamentAliasPanel from '../components/tournament/TournamentAliasPanel'
import TournamentEntryPanel from '../components/tournament/TournamentEntryPanel'
import TournamentProgressPanel from '../components/tournament/TournamentProgressPanel'

export const TOURNAMENT_STATE_STORAGE_KEY = 'ft_tournament_state_v1'

type PersistedTournamentState = {
  players: string[]
  matchQueue: MatchQueueItem[]
  currentMatchIndex: number
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string')

const isMatchQueueItem = (value: unknown): value is MatchQueueItem => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as MatchQueueItem
  if (typeof candidate.id !== 'string' || !Array.isArray(candidate.players) || candidate.players.length !== 2) {
    return false
  }
  return typeof candidate.players[0] === 'string' && (typeof candidate.players[1] === 'string' || candidate.players[1] === null)
}

const parsePersistedState = (raw: string): PersistedTournamentState | null => {
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      isStringArray(parsed.players) &&
      Array.isArray(parsed.matchQueue) &&
      parsed.matchQueue.every((entry: unknown) => isMatchQueueItem(entry)) &&
      typeof parsed.currentMatchIndex === 'number' &&
      Number.isInteger(parsed.currentMatchIndex)
    ) {
      return {
        players: parsed.players,
        matchQueue: parsed.matchQueue,
        currentMatchIndex: parsed.currentMatchIndex
      }
    }
  } catch {
    return null
  }
  return null
}

const TournamentPage = () => {
  const hydrationSnapshot = useMemo<PersistedTournamentState | null>(() => {
    if (typeof window === 'undefined') {
      return null
    }
    const rawState = window.localStorage.getItem(TOURNAMENT_STATE_STORAGE_KEY)
    if (!rawState) {
      return null
    }
    const parsed = parsePersistedState(rawState)
    if (!parsed) {
      window.localStorage.removeItem(TOURNAMENT_STATE_STORAGE_KEY)
      return null
    }
    return parsed
  }, [])

  const [aliasInput, setAliasInput] = useState('')
  const [players, setPlayers] = useState<string[]>(() => hydrationSnapshot?.players ?? [])
  const [matchQueue, setMatchQueue] = useState<MatchQueueItem[]>(() => hydrationSnapshot?.matchQueue ?? [])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(() => hydrationSnapshot?.currentMatchIndex ?? -1)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const snapshot: PersistedTournamentState = {
      players,
      matchQueue,
      currentMatchIndex
    }
    try {
      window.localStorage.setItem(TOURNAMENT_STATE_STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      // 保存に失敗しても UX を阻害しない
    }
  }, [players, matchQueue, currentMatchIndex])

  const currentMatch = findNextMatch(matchQueue, currentMatchIndex)
  const isTournamentReady = players.length >= 2

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
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOURNAMENT_STATE_STORAGE_KEY)
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">トーナメント管理</h1>
        <p className="mt-2 text-sm text-slate-600">
          参加者のエイリアスを登録し、順番を確定してからトーナメント生成ボタンを押してください。
        </p>

        <TournamentAliasPanel
          aliasInput={aliasInput}
          onAliasChange={setAliasInput}
          onSubmit={handleRegisterPlayer}
          errorMessage={errorMessage}
          infoMessage={infoMessage}
          isSubmitDisabled={!aliasInput.trim()}
        />

        <TournamentEntryPanel
          players={players}
          onRemove={handleRemovePlayer}
          onGenerate={handleGenerateMatches}
          onReset={handleResetTournament}
          isGenerateDisabled={!isTournamentReady}
        />
      </section>

      <TournamentProgressPanel
        currentMatch={currentMatch}
        matchQueue={matchQueue}
        currentMatchIndex={currentMatchIndex}
        onAdvance={handleAdvanceMatch}
      />
    </div>
  )
}

export default TournamentPage

/*
解説:

1) import 群
  - トーナメント用ユーティリティ関数と、新設した UI コンポーネント (Alias/Entry/Progress panels) を読み込み、ページ側は状態とハンドラ提供に集中させている。

2) state 管理
  - エイリアス入力、参加者配列、マッチキュー、現在の試合インデックス、エラー/情報メッセージを `useState` で保持し、ユーザー操作に応じて純粋関数の結果を反映する。

3) handleRegisterPlayer などのイベントハンドラ
  - エイリアスの正規化と重複チェックを行い、参加者の追加・削除・トーナメント生成・進行・リセットを手続き的にまとめている。登録変更時にはマッチキューをリセットして矛盾を防ぐ。

4) ローカルストレージ永続化
  - `localStorage` へ参加者・マッチキュー・現在の試合インデックスを保存し、リロード後も状態を再構築できるよう `parsePersistedState` と 2 つの `useEffect` で復元・同期を実装している。構造が壊れている場合は削除して安全性を確保する。

5) JSX レイアウト
  - AliasPanel / EntryPanel / ProgressPanel の 3 つを組み合わせ、ページ側ではセクション枠のみを保持。コンポーネント単位でテストしやすくしつつ、レイアウトや文言は従来どおり維持する。

6) export default TournamentPage
  - ルーティングから利用できるようにページコンポーネントを公開し、SPA の主要機能としてトーナメント管理画面を追加する。
*/
