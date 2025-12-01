import { useState, FormEvent } from 'react'
import { normalizeAlias, aliasExists } from '../lib/tournament'
import { createTournament, fetchTournament, TournamentDetail } from '../lib/api'
import useAuthStore from '../stores/authStore'

export const useTournamentSetup = () => {
  const { user } = useAuthStore()
  const [aliasInput, setAliasInput] = useState('')
  const [players, setPlayers] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

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

    if (players.length >= 8) {
      setErrorMessage('参加者は最大8名までです')
      return
    }

    setPlayers((previous) => [...previous, normalizedAlias])
    setAliasInput('')
    setErrorMessage(null)
    setInfoMessage('参加者を追加しました。')
  }

  const handleRemovePlayer = (alias: string) => {
    setPlayers((previous) => previous.filter((entry) => entry !== alias))
    setInfoMessage('参加者を削除しました。')
  }

  const handleReset = () => {
    setPlayers([])
    setAliasInput('')
    setErrorMessage(null)
    setInfoMessage('エントリーを初期化しました。')
  }

  const create = async (): Promise<TournamentDetail | null> => {
    if (!user) {
      setErrorMessage('トーナメントを作成するにはログインが必要です')
      return null
    }
    if (players.length < 2) {
        setErrorMessage('最低2名の参加者が必要です')
        return null
    }
    if (players.length > 8) {
        setErrorMessage('参加者は最大8名までです')
        return null
    }

    setIsCreating(true)
    try {
      const res = await createTournament({
        name: `${user.displayName}'s Tournament ${new Date().toLocaleTimeString()}`,
        createdById: user.id,
        participants: players.map(p => ({ alias: p }))
      })
      
      const detail = await fetchTournament(res.data.id)
      localStorage.setItem('activeTournamentId', detail.data.id.toString())
      setInfoMessage('トーナメントを作成しました。')
      return detail.data
    } catch (err) {
      console.error(err)
      setErrorMessage('トーナメントの作成に失敗しました')
      return null
    } finally {
      setIsCreating(false)
    }
  }

  return {
    aliasInput,
    setAliasInput,
    players,
    errorMessage,
    infoMessage,
    isCreating,
    handleRegisterPlayer,
    handleRemovePlayer,
    handleReset,
    create
  }
}
