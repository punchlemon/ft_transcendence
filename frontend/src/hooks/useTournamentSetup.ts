import { useState, FormEvent, useEffect } from 'react'
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

  useEffect(() => {
    if (user && players.length === 0) {
      setPlayers([user.displayName])
    }
  }, [user, players.length])

  const handleRegisterPlayer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedAlias = normalizeAlias(aliasInput)

    if (!normalizedAlias) {
      setErrorMessage('Please enter an alias')
      return
    }

    if (aliasExists(players, normalizedAlias)) {
      setErrorMessage('Duplicate alias not allowed')
      return
    }

    if (players.length >= 4) {
      setErrorMessage('Maximum 4 participants allowed')
      return
    }

    setPlayers((previous) => [...previous, normalizedAlias])
    setAliasInput('')
    setErrorMessage(null)
    setInfoMessage('Participant added.')
  }

  const handleRemovePlayer = (alias: string) => {
    setPlayers((previous) => previous.filter((entry) => entry !== alias))
    setInfoMessage('Participant removed.')
  }

  const handleReset = () => {
    setPlayers([])
    setAliasInput('')
    setErrorMessage(null)
    setInfoMessage('エントリーを初期化しました。')
  }

  const create = async (): Promise<TournamentDetail | null> => {
    if (!user) {
      setErrorMessage('You must be logged in to create a tournament')
      return null
    }
    if (players.length < 2) {
      setErrorMessage('At least 2 participants required')
        return null
    }
    if (players.length > 4) {
      setErrorMessage('Maximum 4 participants allowed')
        return null
    }

    setIsCreating(true)
    try {
      const finalPlayers = [...players]
      if (finalPlayers.length % 2 !== 0) {
        finalPlayers.push('AI')
      }

      const res = await createTournament({
        name: `${user.displayName}'s Tournament ${new Date().toLocaleTimeString()}`,
        createdById: user.id,
        participants: finalPlayers.map(p => ({ alias: p }))
      })
      
      const detail = await fetchTournament(res.data.id)
      localStorage.setItem('activeTournamentId', detail.data.id.toString())
      setInfoMessage('Tournament created.')
      return detail.data
    } catch (err) {
      console.error(err)
      setErrorMessage('Failed to create tournament')
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
