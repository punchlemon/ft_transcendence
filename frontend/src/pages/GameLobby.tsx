import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import TournamentAliasPanel from '../components/tournament/TournamentAliasPanel'
import BracketView from '../components/tournament/BracketView'
import { useTournamentSetup } from '../hooks/useTournamentSetup'
import { generatePreviewMatches } from '../lib/tournament'
import FriendSelectorModal from '../components/tournament/FriendSelectorModal'

type GameMode = 'local' | 'remote' | 'ai' | 'tournament'
type MatchType = 'public' | 'private'
type AIDifficulty = 'EASY' | 'NORMAL' | 'HARD'

const GameLobbyPage = () => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null)
  const [matchType, setMatchType] = useState<MatchType | null>(null)
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('NORMAL')
  const [isMatching, setIsMatching] = useState(false)
  

  // Local 1v1 State
  const [localP1, setLocalP1] = useState('Player 1')
  const [localP2, setLocalP2] = useState('Player 2')

  // Tournament State
  const tournamentSetup = useTournamentSetup()
  const [createdTournament, setCreatedTournament] = useState<any | null>(null)
  const [isCreatingTournament, setIsCreatingTournament] = useState(false)
  const [isStartDisabled, setIsStartDisabled] = useState(true)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  const handleModeSelect = (mode: GameMode) => {
    if (!user) return
    setSelectedMode(mode)
    setMatchType(null)
    setIsMatching(false)
  }

  const handleStartMatch = async () => {
    if (selectedMode === 'local') {
      const mockGameId = `game-${selectedMode}-${Date.now()}`
      navigate(
        `/game/${mockGameId}?mode=local&p1Name=${encodeURIComponent(localP1)}&p2Name=${encodeURIComponent(localP2)}`
      )
    } else if (selectedMode === 'ai') {
      const mockGameId = `game-${selectedMode}-${Date.now()}`
      navigate(`/game/${mockGameId}?mode=ai&difficulty=${aiDifficulty}`)
    } else if (selectedMode === 'tournament') {
      // Create tournament but do not immediately navigate: allow inviting friends first
      setIsCreatingTournament(true)
      const tournament = await tournamentSetup.create()
      setIsCreatingTournament(false)
      if (tournament) {
        setCreatedTournament(tournament)
        setIsStartDisabled(false)
        // show invite modal automatically (optional)
        setIsInviteModalOpen(true)
      }
    } else if (selectedMode === 'remote') {
      if (matchType === 'public') {
        setIsMatching(true)
        // ここでWebSocket接続＆マッチング待機を開始する想定
        // モックとして3秒後に遷移
        setTimeout(() => {
          navigate(`/game/remote-${Date.now()}?mode=remote`)
        }, 3000)
      } else if (matchType === 'private') {
        try {
          // Create a new private room via API (no manual code entry)
          setIsMatching(true)
          const res = await (await import('../lib/api')).createPrivateRoom()
          const sessionId = res.sessionId
          setIsMatching(false)
          // Navigate into the room and request GameRoom to show invite modal
          navigate(`/game/${sessionId}?mode=remote&private=true&showInvite=1`)
        } catch (err) {
          console.error('Failed to create private room', err)
          setIsMatching(false)
          alert('Failed to create private room')
        }
      }
    }
  }

  const handleStartTournamentNow = async () => {
    if (!createdTournament) return
    // Find the first match and navigate similarly to previous flow
    const firstMatch = createdTournament.matches.find((m: any) => !m.winnerId)
    if (firstMatch) {
      const p1 = firstMatch.playerA?.alias ?? 'Unknown'
      const p2 = firstMatch.playerB?.alias ?? null
      const p1Id = firstMatch.playerA?.participantId ?? -1
      const p2Id = firstMatch.playerB?.participantId ?? null

      let url = `/game/local-match-${firstMatch.id}?mode=local&p1Name=${encodeURIComponent(p1)}&p2Name=${encodeURIComponent(p2 ?? '')}`
      url += `&tournamentId=${createdTournament.id}`
      if (p1Id) url += `&p1Id=${p1Id}`
      if (p2Id) url += `&p2Id=${p2Id}`
      navigate(url)
    }
  }

  const handleCancelMatching = () => {
    setIsMatching(false)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      {isMatching ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-6 h-16 w-16 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400"></div>
          <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Looking for an opponent...</h2>
          <p className="mb-8 text-slate-500 dark:text-slate-400">Please wait while we find a match for you.</p>
          <button
            onClick={handleCancelMatching}
            className="rounded-md border border-slate-300 px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="grid gap-8">
          {/* Mode Selection */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <button
              onClick={() => handleModeSelect('local')}
              disabled={!user}
              className={`flex flex-col items-center rounded-xl border p-8 transition-all ${
                selectedMode === 'local'
                  ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600 ring-offset-2 dark:bg-indigo-950 dark:ring-offset-slate-900'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:hover:border-indigo-500'
              } ${!user ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="mb-4 text-4xl">👥</div>
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Local 1v1</h3>
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Play against a friend on the same device.
              </p>
            </button>

            <button
              onClick={() => handleModeSelect('remote')}
              disabled={!user}
              className={`flex flex-col items-center rounded-xl border p-8 transition-all ${
                selectedMode === 'remote'
                  ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600 ring-offset-2 dark:bg-indigo-950 dark:ring-offset-slate-900'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:hover:border-indigo-500'
              } ${!user ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="mb-4 text-4xl">🌍</div>
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Online PvP</h3>
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Challenge players from around the world.
              </p>
            </button>

            <button
              onClick={() => handleModeSelect('ai')}
              disabled={!user}
              className={`flex flex-col items-center rounded-xl border p-8 transition-all ${
                selectedMode === 'ai'
                  ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600 ring-offset-2 dark:bg-indigo-950 dark:ring-offset-slate-900'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:hover:border-indigo-500'
              } ${!user ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="mb-4 text-4xl">🤖</div>
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">vs AI</h3>
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Practice your skills against a bot.
              </p>
            </button>

            <button
              onClick={() => handleModeSelect('tournament')}
              disabled={!user}
              className={`flex flex-col items-center rounded-xl border p-8 transition-all ${
                selectedMode === 'tournament'
                  ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600 ring-offset-2 dark:bg-indigo-950 dark:ring-offset-slate-900'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:hover:border-indigo-500'
              } ${!user ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="mb-4 text-4xl">🏆</div>
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Tournament</h3>
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Compete in a bracket-style tournament.
              </p>
            </button>
          </div>

          {/* Sub Options for Local */}
          {selectedMode === 'local' && (
            <div className="animate-in fade-in slide-in-from-top-4 rounded-xl border border-slate-200 bg-slate-50 p-6 duration-300 dark:border-slate-700 dark:bg-slate-800/50">
              <h3 className="mb-4 text-lg font-medium text-slate-900 dark:text-slate-100">Player Aliases</h3>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Player 1</label>
                  <input
                    type="text"
                    value={localP1}
                    onChange={(e) => setLocalP1(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Player 2</label>
                  <input
                    type="text"
                    value={localP2}
                    onChange={(e) => setLocalP2(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              <FriendSelectorModal open={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} tournamentId={createdTournament?.id ?? -1} />
            </div>
          )}

          {/* Sub Options for Remote */}
          {selectedMode === 'remote' && (
            <div className="animate-in fade-in slide-in-from-top-4 rounded-xl border border-slate-200 bg-slate-50 p-6 duration-300 dark:border-slate-700 dark:bg-slate-800/50">
              <h3 className="mb-4 text-lg font-medium text-slate-900 dark:text-slate-100">Select Match Type</h3>
              <div className="flex flex-col gap-4 sm:flex-row">
                <button
                  onClick={() => setMatchType('public')}
                  className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
                    matchType === 'public'
                      ? 'border-indigo-600 bg-white ring-1 ring-indigo-600 dark:bg-indigo-950 dark:border-indigo-600 dark:ring-indigo-500'
                      : 'border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500'
                  }`}
                >
                  <div className="font-medium text-slate-900 dark:text-slate-100">Public Match</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Find a random opponent</div>
                </button>
                <button
                  onClick={() => setMatchType('private')}
                  className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
                    matchType === 'private'
                      ? 'border-indigo-600 bg-white ring-1 ring-indigo-600 dark:bg-indigo-950 dark:border-indigo-600 dark:ring-indigo-500'
                      : 'border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500'
                  }`}
                >
                  <div className="font-medium text-slate-900 dark:text-slate-100">Private Room</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Create a private room</div>
                  
                </button>
              </div>

              {/* private rooms create immediately; no manual code entry */}
            </div>
          )}

          {/* Sub Options for AI */}
          {selectedMode === 'ai' && (
            <div className="animate-in fade-in slide-in-from-top-4 rounded-xl border-2 border-slate-200 bg-slate-50 p-6 duration-300 dark:border-slate-600 dark:bg-slate-800/50">
              <h3 className="mb-4 text-lg font-medium text-slate-900 dark:text-slate-100">Select Difficulty</h3>
              <div className="flex gap-4">
                {(['EASY', 'NORMAL', 'HARD'] as const).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => setAiDifficulty(diff)}
                    className={`flex-1 rounded-lg border p-3 text-center transition-colors ${
                      aiDifficulty === diff
                        ? 'border-indigo-600 bg-white ring-1 ring-indigo-600 font-semibold text-indigo-600 dark:bg-indigo-950 dark:border-indigo-600 dark:text-indigo-400 dark:ring-indigo-500'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-indigo-500'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sub Options for Tournament */}
          {selectedMode === 'tournament' && (
            <div className="animate-in fade-in slide-in-from-top-4 rounded-xl border border-slate-200 bg-slate-50 p-6 duration-300 dark:border-slate-700 dark:bg-slate-800/50">
              <h3 className="mb-4 text-lg font-medium text-slate-900 dark:text-slate-100">Tournament Setup</h3>
              <TournamentAliasPanel
                aliasInput={tournamentSetup.aliasInput}
                onAliasChange={tournamentSetup.setAliasInput}
                onSubmit={tournamentSetup.handleRegisterPlayer}
                errorMessage={tournamentSetup.errorMessage}
                infoMessage={tournamentSetup.infoMessage}
                isSubmitDisabled={!tournamentSetup.aliasInput.trim()}
              />

              {createdTournament && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={() => setIsInviteModalOpen(true)}
                    className="rounded-md border px-4 py-2 text-sm"
                  >
                    フレンドを招待
                  </button>
                  <button
                    onClick={handleStartTournamentNow}
                    className="ml-2 rounded-md bg-indigo-600 px-4 py-2 text-sm text-white"
                  >
                    トーナメント開始
                  </button>
                </div>
              )}
              
              {tournamentSetup.players.length > 0 && (
                <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700">
                  <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tournament Bracket</h4>
                  <BracketView 
                    matches={generatePreviewMatches(tournamentSetup.players) as any} 
                    currentMatchIndex={-1}
                    onRemovePlayer={tournamentSetup.handleRemovePlayer}
                    currentUserAlias={user?.displayName}
                  />
                </div>
              )}
            </div>
          )}

          {/* Start Button */}
          <div className="flex justify-center pt-4">
            <button
              onClick={handleStartMatch}
              disabled={
                !user ||
                !selectedMode ||
                (selectedMode === 'remote' && !matchType) ||
                (selectedMode === 'tournament' && tournamentSetup.players.length < 2) ||
                tournamentSetup.isCreating
              }
              className="min-w-[200px] rounded-full bg-slate-900 px-8 py-3 font-semibold text-white transition-transform hover:scale-105 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 dark:bg-indigo-600 dark:hover:bg-indigo-700 dark:hover:scale-105"
            >
              {selectedMode === 'tournament'
                ? tournamentSetup.isCreating
                  ? 'Creating...'
                  : 'Start Tournament'
                : 'Start Game'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


export default GameLobbyPage
