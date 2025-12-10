import { useState, useEffect, useRef } from 'react'
import logger from '../lib/logger'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
// Tournament alias registration UI removed
import BracketView from '../components/tournament/BracketView'
import { useTournamentSetup } from '../hooks/useTournamentSetup'
import { generatePreviewMatches, normalizeAlias } from '../lib/tournament'
// FriendSelectorModal removed — use lobby flow / toasts instead
import { fetchUserFriends, createTournament, fetchTournament, createTournamentRoom } from '../lib/api'

type GameMode = 'local' | 'remote' | 'ai' | 'tournament'
type MatchType = 'public' | 'private'
type AIDifficulty = 'EASY' | 'NORMAL' | 'HARD'

const GameLobbyPage = () => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.accessToken)
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null)
  const [matchType, setMatchType] = useState<MatchType | null>(null)
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('NORMAL')
  const [isMatching, setIsMatching] = useState(false)
  const matchingSocketRef = useRef<WebSocket | null>(null)
  

  // Local 1v1 State
  const [localP1, setLocalP1] = useState('Player 1')
  const [localP2, setLocalP2] = useState('Player 2')

  // Tournament State
  const tournamentSetup = useTournamentSetup()
  const [createdTournament, setCreatedTournament] = useState<any | null>(null)
  const [tournamentName, setTournamentName] = useState<string>(`${user?.displayName ?? 'Tournament'}'s Tournament`)
  const [friends, setFriends] = useState<Array<any>>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([])
  const [isCreatingTournament, setIsCreatingTournament] = useState(false)
  const [isStartDisabled, setIsStartDisabled] = useState(true)
  

  const handleModeSelect = (mode: GameMode) => {
    if (!user) return
    setSelectedMode(mode)
    setMatchType(null)
    setIsMatching(false)
  }

  useEffect(() => {
    if (selectedMode !== 'tournament' || !user) return
    setFriendsLoading(true)
    fetchUserFriends(String(user.id))
      .then((res) => setFriends(res.data))
      .catch((err) => logger.error('Failed to fetch friends', err))
      .finally(() => setFriendsLoading(false))
  }, [selectedMode, user])

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
      // Create tournament using selected friends + current user
      if (!user) return
      setIsCreatingTournament(true)
          try {
            const participants: Array<any> = []
            participants.push({ alias: user.displayName, userId: user.id })
            const selectedFriends = friends.filter((f) => selectedFriendIds.includes(f.id))
            selectedFriends.forEach((f) => participants.push({ alias: f.displayName, userId: f.id }))
            if (participants.length % 2 !== 0) {
              participants.push({ alias: 'AI' })
            }

            const res = await createTournament({
              name: tournamentName || `${user.displayName}'s Tournament`,
              createdById: user.id,
              participants: participants.map((p) => ({ alias: p.alias, userId: p.userId }))
            })

            const detail = await fetchTournament(res.data.id)
            setCreatedTournament(detail.data)
            setIsStartDisabled(false)

            // Create a tournament room to send invites to selected friends
            try {
              const invitedIds = selectedFriendIds || []
              const roomRes = await createTournamentRoom(detail.data.id, invitedIds)
              const roomId = roomRes?.data?.roomId ?? null

              // Navigate owner into the game waiting area (pseudo session). The actual game start
              // will wait until participants accept invites — participants will navigate directly
              // into the game when they Accept (NotificationToast handles that).
              const tid = detail.data.id
              const sid = `tournament-${tid}-room-${roomId ?? 'unknown'}-${Date.now()}`
              navigate(`/game/${encodeURIComponent(sid)}?mode=tournament&tournamentId=${encodeURIComponent(tid)}&roomId=${encodeURIComponent(String(roomId))}`)
              return
            } catch (e) {
              logger.error('Failed to create tournament room or navigate owner to game', e)
            }
          } catch (err) {
            logger.error('Failed to create tournament', err)
            alert('Failed to create tournament')
          } finally {
            setIsCreatingTournament(false)
          }
    } else if (selectedMode === 'remote') {
      if (matchType === 'public') {
        // Start real matching: open a WS to /api/ws/game without sessionId
        setIsMatching(true)
        try {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          const host = window.location.host
          const wsUrl = `${protocol}//${host}/api/ws/game`
          const ws = new WebSocket(wsUrl)
          matchingSocketRef.current = ws

          ws.onopen = () => {
            // send ready with token to authenticate and join waiting slot
            try { if (token) ws.send(JSON.stringify({ event: 'ready', payload: { token } })) } catch (e) { /* ignore */ }
          }

          ws.onmessage = (evt) => {
            try {
              const data = JSON.parse(evt.data)
              if (data.event === 'match:event') {
                if (data.payload.type === 'CONNECTED' && data.payload.waiting) {
                  // waiting: show spinner (already isMatching=true)
                } else if (data.payload.type === 'MATCH_FOUND' && data.payload.sessionId) {
                  // navigate to the newly-created session and close the matching socket
                  const sid = data.payload.sessionId
                  try { ws.close() } catch (e) { /* ignore */ }
                  matchingSocketRef.current = null
                  setIsMatching(false)
                  navigate(`/game/${encodeURIComponent(sid)}?mode=remote`)
                } else if (data.payload.type === 'UNAVAILABLE' || data.payload.type === 'CLOSED') {
                  // stop matching and show message
                  try { ws.close() } catch (e) {}
                  matchingSocketRef.current = null
                  setIsMatching(false)
                  alert(data.payload.message || 'Match unavailable')
                }
              }
            } catch (err) {
              logger.error('Failed to parse matching ws message', err)
            }
          }

          ws.onclose = () => {
            matchingSocketRef.current = null
            setIsMatching(false)
          }
        } catch (err) {
          logger.error('Failed to start matching socket', err)
          setIsMatching(false)
        }
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
          logger.error('Failed to create private room', err)
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
    try {
      if (matchingSocketRef.current) {
        try { matchingSocketRef.current.send(JSON.stringify({ event: 'control', payload: { type: 'LEAVE' } })) } catch (e) {}
        try { matchingSocketRef.current.close() } catch (e) {}
        matchingSocketRef.current = null
      }
    } catch (e) {
      // ignore
    }
  }

  // Ensure matching socket is closed when this component unmounts
  useEffect(() => {
    return () => {
      try {
        if (matchingSocketRef.current) {
          try { matchingSocketRef.current.send(JSON.stringify({ event: 'control', payload: { type: 'LEAVE' } })) } catch (e) {}
          try { matchingSocketRef.current.close() } catch (e) {}
          matchingSocketRef.current = null
        }
      } catch (e) {
        // ignore
      }
    }
  }, [])

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
              {/* Invite modal removed: lobby-based invites use NotificationToast */}
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
              <div className="mt-2">
                <div className="mb-4 flex items-center gap-3">
                  <label className="text-sm font-medium">Tournament Name</label>
                  <input
                    type="text"
                    value={tournamentName}
                    onChange={(e) => setTournamentName(e.target.value)}
                    className="ml-2 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="mb-4">
                  <h4 className="mb-2 text-sm font-semibold text-slate-700">Invite Friends</h4>
                  <div className="max-h-48 overflow-auto rounded border border-slate-200 p-2">
                    {friendsLoading ? (
                      <div>Loading friends...</div>
                    ) : friends.filter(f => f.status === 'ONLINE').length === 0 ? (
                      <div className="text-sm text-slate-500">No friends online</div>
                    ) : (
                      friends
                        .filter((f) => f.status === 'ONLINE')
                        .map((f) => (
                          <label key={f.id} className="flex items-center justify-between gap-4 border-b py-2">
                            <div>
                              <div className="font-medium">{f.displayName}</div>
                              <div className="text-xs text-slate-500">{f.login}</div>
                            </div>
                            <div>
                              <input
                                type="checkbox"
                                checked={selectedFriendIds.includes(f.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedFriendIds((s) => [...s, f.id])
                                  else setSelectedFriendIds((s) => s.filter((id) => id !== f.id))
                                }}
                              />
                            </div>
                          </label>
                        ))
                    )}
                  </div>
                </div>

                {/* Invite Friends button removed — use NotificationToast for invites */}

                {(() => {
                  const selectedFriends = friends.filter(f => selectedFriendIds.includes(f.id))
                  const aliases = [user?.displayName ?? 'You', ...selectedFriends.map(f => f.displayName)]
                  if (aliases.length === 0) return null

                  // Build participants for preview so avatars/status can resolve
                  const participantsForPreview: Array<any> = []
                  let nextId = 1
                  // Owner / current user
                  participantsForPreview.push({ id: nextId++, alias: user?.displayName ?? 'You', userId: user?.id ?? null, inviteState: 'ACCEPTED', seed: null, joinedAt: new Date().toISOString() })
                  // Selected friends
                  selectedFriends.forEach((f) => {
                    participantsForPreview.push({ id: nextId++, alias: f.displayName, userId: f.id, inviteState: 'ACCEPTED', seed: null, joinedAt: new Date().toISOString() })
                  })
                  // Pad with AI if needed
                  if (participantsForPreview.length % 2 !== 0) {
                    participantsForPreview.push({ id: nextId++, alias: 'AI', userId: null, inviteState: 'PLACEHOLDER', seed: null, joinedAt: new Date().toISOString() })
                  }

                  // Generate matches and then map participantId on preview matches to our participants
                  const rawMatches = generatePreviewMatches(aliases) as any[]
                  // Build lookup by normalized alias
                  const lookupByAlias: Record<string, any> = {}
                  participantsForPreview.forEach((p) => { lookupByAlias[normalizeAlias(p.alias)] = p })

                  const matchesWithIds = rawMatches.map((m) => {
                    const clone = { ...m }
                    if (clone.playerA && clone.playerA.alias) {
                      const key = normalizeAlias(clone.playerA.alias)
                      const p = lookupByAlias[key]
                      if (p) clone.playerA.participantId = p.id
                    }
                    if (clone.playerB && clone.playerB.alias) {
                      const key = normalizeAlias(clone.playerB.alias)
                      const p = lookupByAlias[key]
                      if (p) clone.playerB.participantId = p.id
                    }
                    return clone
                  })

                  return (
                    <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700">
                      <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tournament Bracket</h4>
                      <BracketView 
                        matches={matchesWithIds as any} 
                        currentMatchIndex={-1}
                        onRemovePlayer={undefined}
                        currentUserAlias={user?.displayName}
                        participants={participantsForPreview}
                      />
                    </div>
                  )
                })()}
              </div>
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
                  (selectedMode === 'tournament' && (1 + selectedFriendIds.length) < 2) ||
                  isCreatingTournament
                }
              className="min-w-[200px] rounded-full bg-slate-900 px-8 py-3 font-semibold text-white transition-transform hover:scale-105 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 dark:bg-indigo-600 dark:hover:bg-indigo-700 dark:hover:scale-105"
            >
              {selectedMode === 'tournament'
                ? isCreatingTournament
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
