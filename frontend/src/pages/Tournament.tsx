import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MatchQueueItem,
  advanceToNextMatch,
  aliasExists,
  findNextMatch,
  normalizeAlias
} from '../lib/tournament'
import TournamentAliasPanel from '../components/tournament/TournamentAliasPanel'
import TournamentEntryPanel from '../components/tournament/TournamentEntryPanel'
import TournamentProgressPanel from '../components/tournament/TournamentProgressPanel'
import { api, createTournament, fetchTournament, TournamentDetail } from '../lib/api'
import useAuthStore from '../stores/authStore'

const TournamentPage = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [aliasInput, setAliasInput] = useState('')
  const [players, setPlayers] = useState<string[]>([])
  const [activeTournament, setActiveTournament] = useState<TournamentDetail | null>(null)
  const [matchQueue, setMatchQueue] = useState<MatchQueueItem[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Restore tournament state on mount
  useEffect(() => {
    const savedId = localStorage.getItem('activeTournamentId')
    if (savedId) {
      const id = parseInt(savedId, 10)
      if (!isNaN(id)) {
        fetchTournament(id)
          .then((res) => {
            const detail = res.data
            setActiveTournament(detail)
            
            const queue: MatchQueueItem[] = detail.matches.map((m) => ({
              id: `match-${m.id}`,
              players: [m.playerA?.alias ?? 'Unknown', m.playerB?.alias ?? null],
              participantIds: [m.playerA?.participantId ?? -1, m.playerB?.participantId ?? null]
            }))
            setMatchQueue(queue)
            
            // Find first pending match (where winnerId is null)
            // Note: The API response matches should be sorted by round/id usually.
            const nextIndex = detail.matches.findIndex((m) => !m.winnerId)
            setCurrentMatchIndex(nextIndex !== -1 ? nextIndex : -1)
            
            if (nextIndex !== -1) {
               setInfoMessage('次の試合の準備ができました。')
            } else if (detail.matches.every(m => m.winnerId)) {
               setInfoMessage('全ての試合が終了しました。')
               setCurrentMatchIndex(-1) // Ensure no match is selected if all finished
            }
          })
          .catch((err) => {
            console.error('Failed to restore tournament', err)
            localStorage.removeItem('activeTournamentId')
          })
      }
    }
  }, [])

  const currentMatch = findNextMatch(matchQueue, currentMatchIndex)
  const isTournamentReady = players.length >= 2

  const resetMatchProgress = () => {
    setMatchQueue([])
    setCurrentMatchIndex(-1)
    setActiveTournament(null)
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

  const handleCreateTournament = async () => {
    if (!user) {
      setErrorMessage('トーナメントを作成するにはログインが必要です')
      return
    }

    setIsCreating(true)
    try {
      const res = await createTournament({
        name: `${user.displayName}'s Tournament ${new Date().toLocaleTimeString()}`,
        createdById: user.id,
        participants: players.map(p => ({ alias: p }))
      })
      
      const detail = await fetchTournament(res.data.id)
      setActiveTournament(detail.data)
      localStorage.setItem('activeTournamentId', detail.data.id.toString())
      
      // Map API matches to UI MatchQueueItem
      const queue: MatchQueueItem[] = detail.data.matches.map(m => ({
        id: `match-${m.id}`,
        players: [m.playerA?.alias ?? 'Unknown', m.playerB?.alias ?? null],
        participantIds: [m.playerA?.participantId ?? -1, m.playerB?.participantId ?? null]
      }))
      
      setMatchQueue(queue)
      setCurrentMatchIndex(queue.length > 0 ? 0 : -1)
      setInfoMessage('トーナメントを作成しました。')
    } catch (err) {
      console.error(err)
      setErrorMessage('トーナメントの作成に失敗しました')
    } finally {
      setIsCreating(false)
    }
  }

  const handleAdvanceMatch = () => {
    const nextIndex = advanceToNextMatch(matchQueue, currentMatchIndex)
    setCurrentMatchIndex(nextIndex)
    setInfoMessage(
      nextIndex === -1 ? '全ての試合が完了しました。エントリーを更新して次の大会を始めましょう。' : '次の試合に進みました。'
    )
  }

  const handleResetTournament = () => {
    localStorage.removeItem('activeTournamentId')
    setPlayers([])
    setAliasInput('')
    setInfoMessage('エントリーを初期化しました。')
    setErrorMessage(null)
    resetMatchProgress()
  }

  const handlePlayMatch = () => {
    if (!currentMatch) return
    const p1 = currentMatch.players[0]
    const p2 = currentMatch.players[1]
    if (!p2) return
    
    const p1Id = currentMatch.participantIds?.[0]
    const p2Id = currentMatch.participantIds?.[1]
    
    let url = `/game/local-${currentMatch.id}?mode=local&p1Name=${encodeURIComponent(p1)}&p2Name=${encodeURIComponent(p2)}`
    if (activeTournament) {
        url += `&tournamentId=${activeTournament.id}`
    }
    if (p1Id) url += `&p1Id=${p1Id}`
    if (p2Id) url += `&p2Id=${p2Id}`

    navigate(url)
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">トーナメント管理</h1>
        <p className="mt-2 text-sm text-slate-600">
          参加者のエイリアスを登録し、順番を確定してからトーナメント生成ボタンを押してください。
        </p>

        {!activeTournament && (
          <>
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
              onGenerate={handleCreateTournament}
              onReset={handleResetTournament}
              isGenerateDisabled={!isTournamentReady || isCreating}
            />
          </>
        )}
        
        {activeTournament && (
          <div className="mt-4 p-4 bg-indigo-50 rounded-lg">
            <h2 className="font-bold text-indigo-900">{activeTournament.name}</h2>
            <p className="text-sm text-indigo-700">Status: {activeTournament.status}</p>
            <button 
              onClick={handleResetTournament}
              className="mt-2 text-xs text-indigo-600 underline"
            >
              新しいトーナメントを作成
            </button>
          </div>
        )}
      </section>

      <TournamentProgressPanel
        currentMatch={currentMatch}
        matchQueue={matchQueue}
        currentMatchIndex={currentMatchIndex}
        onAdvance={handleAdvanceMatch}
        onPlayMatch={handlePlayMatch}
        matches={activeTournament?.matches}
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
