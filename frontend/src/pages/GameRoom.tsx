import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { soundManager } from '../lib/sound'
import { api, fetchTournament, TournamentDetail } from '../lib/api'
import BracketView from '../components/tournament/BracketView'
import TournamentRanking from '../components/tournament/TournamentRanking'
import { MatchQueueItem, advanceToNextMatch } from '../lib/tournament'
import PrivateRoomInviteModal from '../components/game/PrivateRoomInviteModal'

type GameStatus = 'connecting' | 'playing' | 'finished'

const GameRoomPage = () => {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const gameStateRef = useRef<any>(null)
  const prevBallRef = useRef<{ dx: number; dy: number } | null>(null)
  const token = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  
  const [status, setStatus] = useState<GameStatus>('connecting')
  const [scores, setScores] = useState({ p1: 0, p2: 0 })
  const [winner, setWinner] = useState<string | null>(null)
  const [playerSlot, setPlayerSlot] = useState<'p1' | 'p2' | null>(null)
  const playerSlotRef = useRef<'p1' | 'p2' | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)
  // Initialize sessionId from the route param so the invite modal can
  // be shown immediately when navigating to `/game/:id?showInvite=1`.
  const [sessionId, setSessionId] = useState<string | null>(id ?? null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showSessionDestroyed, setShowSessionDestroyed] = useState(false)

  const mode = searchParams.get('mode')

  const location = useLocation()
  const prevLocationRef = useRef<string | null>(null)

  // Helper to send LEAVE and close socket (centralized so multiple places can call)
  const sendLeaveAndClose = () => {
    try {
      const ws = socketRef.current
      if (ws && ws.readyState === (WebSocket as any).OPEN) {
        try { ws.send(JSON.stringify({ event: 'control', payload: { type: 'LEAVE' } })) } catch (e) { /* ignore */ }
      }
    } catch (e) {
      // ignore
    } finally {
      try { socketRef.current?.close() } catch (e) { /* ignore */ }
    }
  }

  const getPlayerName = (slot: 'p1' | 'p2') => {
    const paramName = searchParams.get(`${slot}Name`)
    if (paramName) return paramName
    
    if (mode === 'ai') {
        if (playerSlot) {
            return playerSlot === slot ? (user?.displayName || 'You') : 'AI'
        }
        // Default before connection (assume P1 is user)
        return slot === 'p1' ? (user?.displayName || 'You') : 'AI'
    }
    
    return slot === 'p1' ? 'Player 1' : 'Player 2'
  }

  const players = {
    p1: getPlayerName('p1'),
    p2: getPlayerName('p2')
  }

  // Tournament State
  const [activeTournament, setActiveTournament] = useState<TournamentDetail | null>(null)
  const [matchQueue, setMatchQueue] = useState<MatchQueueItem[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const [showRanking, setShowRanking] = useState(false)

  useEffect(() => {
    playerSlotRef.current = playerSlot
  }, [playerSlot])

  // Fetch Tournament Info
  useEffect(() => {
    const tournamentId = searchParams.get('tournamentId')
    if (tournamentId) {
      const tid = parseInt(tournamentId, 10)
      if (!isNaN(tid)) {
        fetchTournament(tid)
          .then((res) => {
            const detail = res.data
            setActiveTournament(detail)
            
            const queue: MatchQueueItem[] = detail.matches.map((m) => ({
              id: `match-${m.id}`,
              players: [m.playerA?.alias ?? 'Unknown', m.playerB?.alias ?? null],
              participantIds: [m.playerA?.participantId ?? -1, m.playerB?.participantId ?? null]
            }))
            setMatchQueue(queue)
            
            // Find current match index based on URL id (local-match-X)
            if (id?.startsWith('local-match-')) {
              const matchIdStr = id.replace('local-match-', '')
              const matchId = parseInt(matchIdStr, 10)
              const index = detail.matches.findIndex(m => m.id === matchId)
              setCurrentMatchIndex(index)
            }
          })
          .catch(err => console.error('Failed to fetch tournament', err))
      }
    }
  }, [id, searchParams, status]) // Re-fetch on status change (e.g. finished) to update bracket

  // WebSocket connection
  useEffect(() => {
    if (!token) return

    const mode = searchParams.get('mode')
    const difficulty = searchParams.get('difficulty')
    const tournamentId = searchParams.get('tournamentId')
    const p1Id = searchParams.get('p1Id')
    const p2Id = searchParams.get('p2Id')
    const p1Name = searchParams.get('p1Name')
    const p2Name = searchParams.get('p2Name')

    const query = new URLSearchParams()
    if (mode) query.append('mode', mode)
    if (difficulty) query.append('difficulty', difficulty)
    
    // If this is a tournament match (local-match-X), pass it as sessionId
    if (id?.startsWith('local-match-')) {
      query.append('sessionId', id)
      // If one of the players is AI, force mode=ai so backend adds AI player
      if (p1Name === 'AI' || p2Name === 'AI') {
        query.set('mode', 'ai')
        if (p1Name === 'AI') query.set('aiSlot', 'p1')
        if (p2Name === 'AI') query.set('aiSlot', 'p2')
      }
    } else if (id) {
      // For private rooms and explicit session ids, pass sessionId so backend uses the correct game
      query.append('sessionId', id)
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/api/ws/game?${query.toString()}`
    const ws = new WebSocket(wsUrl)
    socketRef.current = ws

    ws.onopen = () => {
      console.log('Connected to game server')
      ws.send(JSON.stringify({ event: 'ready', payload: { token } }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // (debug logs removed)
        
        if (data.event === 'match:event') {
          if (data.payload.type === 'CONNECTED') {
            setPlayerSlot(data.payload.slot)
            if (data.payload.sessionId) {
              setSessionId(data.payload.sessionId)
              // If URL asked to show invite modal, enable it when we have sessionId
                          if (searchParams.get('showInvite')) {
                            setShowInviteModal(true)
                          }
            }
            // connection handled
          } else if (data.payload.type === 'START') {
            setStatus('playing')
          } else if (data.payload.type === 'UNAVAILABLE' || data.payload.type === 'CLOSED' || data.payload.type === 'CLOSED_BY_CREATOR') {
            // If the server indicates the session is no longer available or was closed,
            // show the "session destroyed" modal so a user who is left in the room
            // understands the room has been removed.
            setShowInviteModal(false)
            setShowSessionDestroyed(true)
            // Close socket to avoid further state updates from server for this session
            try { socketRef.current?.close() } catch (e) { /* ignore */ }
            // Update status so UI overlays don't conflict
            setStatus('connecting')
          } else if (data.payload.type === 'FINISHED') {
            setStatus('finished')
            const winnerSlot = data.payload.winner
            
            if (mode === 'local') {
                const p1Name = searchParams.get('p1Name') || 'Player 1'
                const p2Name = searchParams.get('p2Name') || 'Player 2'
                setWinner(winnerSlot === 'p1' ? p1Name : p2Name)
            } else {
                setWinner(winnerSlot === playerSlotRef.current ? 'You' : 'Opponent')
            }
            
            soundManager.playGameOver()

            // Tournament Result Notification
            if (id?.startsWith('local-match-') && tournamentId) {
              const matchId = id.replace('local-match-', '')
              const winnerId = winnerSlot === 'p1' ? p1Id : p2Id
              
              if (winnerId) {
                // Use score from payload if available (most reliable), fallback to state
                const finalScore = data.payload.score || gameStateRef.current?.score || { p1: 0, p2: 0 }

                api.post(`/tournaments/matches/${matchId}/result`, { 
                    winnerId: parseInt(winnerId),
                    scoreA: finalScore.p1,
                    scoreB: finalScore.p2
                })
                  .then(() => {
                    // Refresh tournament data to show updated bracket
                    const tid = parseInt(tournamentId, 10)
                    if (!isNaN(tid)) {
                        fetchTournament(tid).then(res => {
                            setActiveTournament(res.data)
                            // Update queue as well
                            const queue: MatchQueueItem[] = res.data.matches.map((m) => ({
                                id: `match-${m.id}`,
                                players: [m.playerA?.alias ?? 'Unknown', m.playerB?.alias ?? null],
                                participantIds: [m.playerA?.participantId ?? -1, m.playerB?.participantId ?? null]
                            }))
                            setMatchQueue(queue)
                        })
                    }
                  })
                  .catch(err => console.error('Failed to submit match result', err))
              }
            }
          }
        } else if (data.event === 'state:update') {
          const newState = data.payload
          gameStateRef.current = newState

          // Sound effects for collisions
          if (prevBallRef.current) {
            // Wall hit (dy changed sign)
            if (Math.sign(newState.ball.dy) !== Math.sign(prevBallRef.current.dy)) {
              soundManager.playWallHit()
            }
            // Paddle hit (dx changed sign)
            if (Math.sign(newState.ball.dx) !== Math.sign(prevBallRef.current.dx)) {
              soundManager.playPaddleHit()
            }
          }
          prevBallRef.current = { dx: newState.ball.dx, dy: newState.ball.dy }

          if (data.payload.status === 'FINISHED') {
            setStatus('finished')
            // Fallback if match:event FINISHED wasn't handled or came out of order
            const s = data.payload.score
            // We might not know who won if we rely on score here without playerSlot, 
            // but match:event is better.
          }
          } else if (data.event === 'session_expired' || data.event === 'session:expired') {
            // Backend may broadcast a session_expired notification when a private
            // room is destroyed. Show the same modal and close socket.
            setShowInviteModal(false)
            setShowSessionDestroyed(true)
            try { socketRef.current?.close() } catch (e) { /* ignore */ }
            setStatus('connecting')
        } else if (data.event === 'score:update') {
          setScores(data.payload)
          soundManager.playScore()
        }
      } catch (err) {
        console.error('Failed to parse message', err)
      }
    }

    ws.onclose = () => {
      console.log('Disconnected from game server')
      setStatus('connecting')
    }

    return () => {
      try {
        // Send explicit LEAVE control so server can remove player deterministically
        if ((ws as any) && (ws as any).readyState === (WebSocket as any).OPEN) {
          try { (ws as any).send(JSON.stringify({ event: 'control', payload: { type: 'LEAVE' } })) } catch (e) { /* ignore */ }
        }
      } catch (e) {
        // ignore
      } finally {
        try { ws.close() } catch (e) { /* ignore */ }
      }
    }
    // reconnectKey is used to force a reconnect when user wants to play again
  }, [token, searchParams, reconnectKey, id])

  // Send LEAVE on page unload (reload/close) to ensure server removes player
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      try {
        const ws = socketRef.current
        if (ws && ws.readyState === (WebSocket as any).OPEN) {
          try { ws.send(JSON.stringify({ event: 'control', payload: { type: 'LEAVE' } })) } catch (err) { /* ignore */ }
          try { ws.close() } catch (err) { /* ignore */ }
        }
      } catch (err) {
        // ignore
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Detect route/location changes while component is mounted. If user navigates
  // away from the game route without unmounting for some reason, proactively
  // send LEAVE. This is an extra safeguard (component unmount cleanup also
  // sends LEAVE).
  useEffect(() => {
    const prev = prevLocationRef.current
    const curr = location.pathname
    // If we have a prev and the new path is not the game path, send leave.
    if (prev && !curr.startsWith('/game')) {
      sendLeaveAndClose()
    }
    prevLocationRef.current = curr
  }, [location.pathname])

  // Close invite modal helper
  const handleCloseInviteModal = () => {
    setShowInviteModal(false)
    // remove param from URL without reloading
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.delete('showInvite')
    const base = window.location.pathname + (params.toString() ? `?${params.toString()}` : '')
    window.history.replaceState({}, '', base)
  }

  // Ensure invite modal state is initialized/reset whenever the sessionId or
  // search params change. This prevents a previous cancelled modal state from
  // bleeding into a newly-created private room (create -> cancel -> home -> create again).
  useEffect(() => {
    if (!sessionId) {
      setShowInviteModal(false)
      return
    }
    const shouldShow = Boolean(searchParams.get('showInvite'))
    setShowInviteModal(shouldShow)
  }, [sessionId, searchParams])

  // Input handling
  useEffect(() => {
    if (status !== 'playing') return

    const keys = {
      w: false, s: false,
      up: false, down: false // up/down now map to 'o'/'l'
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'w') keys.w = true
      if (e.key === 's') keys.s = true
      if (e.key === 'o' || e.key === 'O') keys.up = true
      if (e.key === 'l' || e.key === 'L') keys.down = true
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'w') keys.w = false
      if (e.key === 's') keys.s = false
      if (e.key === 'o' || e.key === 'O') keys.up = false
      if (e.key === 'l' || e.key === 'L') keys.down = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    const intervalId = setInterval(() => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return

      const mode = searchParams.get('mode')

      if (mode === 'local') {
        // P1 Input (WASD)
        let axisP1 = 0
        if (keys.w) axisP1 -= 1
        if (keys.s) axisP1 += 1

        socketRef.current.send(JSON.stringify({
          event: 'input',
          payload: { tick: Date.now(), axis: axisP1, boost: false, player: 'p1' }
        }))

        // P2 Input (O / L)
        let axisP2 = 0
        if (keys.up) axisP2 -= 1
        if (keys.down) axisP2 += 1

        socketRef.current.send(JSON.stringify({
          event: 'input',
          payload: { tick: Date.now(), axis: axisP2, boost: false, player: 'p2' }
        }))
      } else {
        // Standard Input (WASD or O/L)
        let axis = 0
        if (keys.w || keys.up) axis -= 1
        if (keys.s || keys.down) axis += 1

        socketRef.current.send(JSON.stringify({
          event: 'input',
          payload: { tick: Date.now(), axis, boost: false }
        }))
      }
    }, 1000 / 60)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      clearInterval(intervalId)
    }
  }, [status, searchParams])

  // Pause/Resume functionality removed — pausing is disabled.

  const playAgain = useCallback(() => {
    // Close existing socket and reset local state. reconnectKey triggers a fresh connection.
    if (socketRef.current) {
      try { socketRef.current.close() } catch (e) { /* ignore */ }
      socketRef.current = null
    }
    gameStateRef.current = null
    setScores({ p1: 0, p2: 0 })
    setWinner(null)
    setPlayerSlot(null)
    setStatus('connecting')
    setReconnectKey((k) => k + 1)
  }, [])

  const handleNextMatch = useCallback(() => {
    if (!activeTournament) return
    
    // Find next match
    const nextIndex = advanceToNextMatch(matchQueue, currentMatchIndex)
    if (nextIndex !== -1) {
        const nextMatch = matchQueue[nextIndex]
        const p1 = nextMatch.players[0]
        const p2 = nextMatch.players[1]
        const p1Id = nextMatch.participantIds?.[0]
        const p2Id = nextMatch.participantIds?.[1]
        
        let url = `/game/local-${nextMatch.id}?mode=local&p1Name=${encodeURIComponent(p1)}&p2Name=${encodeURIComponent(p2 ?? '')}`
        url += `&tournamentId=${activeTournament.id}`
        if (p1Id) url += `&p1Id=${p1Id}`
        if (p2Id) url += `&p2Id=${p2Id}`
        
        // Force full reload or just navigate? Navigate should be enough if useEffect handles id change
        // But we need to reset state.
        // Navigate to new URL
        navigate(url)
        // Reset local state manually because component might not unmount
        setReconnectKey(k => k + 1)
        setStatus('connecting')
        setScores({ p1: 0, p2: 0 })
        setWinner(null)
    } else {
        // Tournament finished
        setShowRanking(true)
    }
  }, [activeTournament, matchQueue, currentMatchIndex, navigate])

  // Space key behavior: when finished -> Play Again / Next Match. Pausing disabled.
  useEffect(() => {
    const handleSpace = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      // Prevent page scrolling
      e.preventDefault()

      if (status === 'finished') {
        if (id?.startsWith('local-')) {
          handleNextMatch()
        } else {
          playAgain()
        }
      }
    }

    window.addEventListener('keydown', handleSpace)
    return () => window.removeEventListener('keydown', handleSpace)
  }, [status, playAgain, handleNextMatch, id])

  // Game loop
  useEffect(() => {
    if (status !== 'playing') return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    // In test environments the mocked `getContext` may return a minimal object
    // that lacks some canvas methods (clearRect, etc.). If required methods
    // are missing, skip the render loop to avoid throwing during tests.
    if (!canvas || !ctx || typeof (ctx as any).clearRect !== 'function') return

    let animationFrameId: number
    const paddleHeight = 80
    const paddleWidth = 10
    const p1Y = canvas.height / 2 - paddleHeight / 2
    const p2Y = canvas.height / 2 - paddleHeight / 2

    // Detect dark mode once per effect so we can pick appropriate visuals.
    const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

    const render = () => {
      // Clear canvas to transparent so the container background shows through.
      // Previously the canvas was filled with a dark color, which prevented
      // the CSS `dark:bg-*` on the wrapper from being visible. Use
      // `clearRect` to leave the canvas transparent and rely on CSS for the
      // visible play-area background.
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw center line (color adapts to dark mode for better contrast)
      ctx.setLineDash([10, 10])
      ctx.beginPath()
      ctx.moveTo(canvas.width / 2, 0)
      ctx.lineTo(canvas.width / 2, canvas.height)
      // Note: when `isDarkMode` is true we treat the play-area as "bright"
      // (user requested a very bright play-area in dark mode). In that case
      // choose dark colors for paddles/ball/center line so they remain visible
      // against the bright background. In normal (light) mode, use the
      // lighter / original palette.
      const centerLineColor = isDarkMode ? '#0f172a' /* slate-900 - dark on bright bg */ : '#94a3b8' /* slate-400 */
      ctx.strokeStyle = centerLineColor
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.setLineDash([])

      const state = gameStateRef.current
      if (state) {
        // Choose colors that stand out on dark backgrounds
        // Paddle and ball colors: dark on bright play-area (isDarkMode=true),
        // lighter/brighter on standard light background.
        const p1Shadow = isDarkMode ? 'rgba(2,6,23,0.6)' /* subtle dark shadow */ : '#6366f1'
        const p1Fill = isDarkMode ? '#3730a3' /* indigo-700 - dark */ : '#818cf8' /* indigo-400 */

        const p2Shadow = isDarkMode ? 'rgba(2,6,23,0.6)' /* dark shadow */ : '#f43f5e'
        const p2Fill = isDarkMode ? '#be123c' /* rose-700 - dark */ : '#fb7185' /* rose-400 */

        const ballShadow = isDarkMode ? 'rgba(2,6,23,0.8)' /* dark glow */ : '#f8fafc' /* slate-50 */
        const ballFill = isDarkMode ? '#0f172a' /* slate-900 - dark ball */ : '#f8fafc'

        // Use server state for paddles if available, otherwise default
        const p1Pos = state.paddles?.p1 ?? p1Y
        const p2Pos = state.paddles?.p2 ?? p2Y

        // Draw P1 paddle
        ctx.shadowBlur = 18
        ctx.shadowColor = p1Shadow
        ctx.fillStyle = p1Fill
        ctx.fillRect(10, p1Pos, paddleWidth, paddleHeight)

        // Draw P2 paddle
        ctx.shadowColor = p2Shadow
        ctx.fillStyle = p2Fill
        ctx.fillRect(canvas.width - 20, p2Pos, paddleWidth, paddleHeight)

        // Draw ball with stronger glow in dark mode
        ctx.shadowBlur = 12
        ctx.shadowColor = ballShadow
        ctx.beginPath()
        ctx.arc(state.ball.x, state.ball.y, 8, 0, Math.PI * 2)
        ctx.fillStyle = ballFill
        ctx.fill()
        ctx.closePath()

        // Reset shadow
        ctx.shadowBlur = 0
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [status])

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col dark:bg-slate-900">
      {showInviteModal && sessionId && (
        <PrivateRoomInviteModal sessionId={sessionId} onClose={handleCloseInviteModal} />
      )}
      {showRanking && activeTournament && (
        <TournamentRanking 
            tournament={activeTournament} 
            onClose={() => navigate('/')} 
        />
      )}
      {/* Tournament Bracket Overlay (Top) */}
      {activeTournament && (
        <div className="w-full bg-white border-b border-slate-200 py-1 px-4 dark:bg-slate-800 dark:border-slate-700">
            <div className="max-w-6xl mx-auto">
                <h2 className="text-sm font-bold text-slate-900 mb-1 dark:text-slate-100">{activeTournament.name}</h2>
                {activeTournament.matches && activeTournament.matches.length > 0 && (
                    <BracketView 
                        matches={activeTournament.matches} 
                        currentMatchIndex={currentMatchIndex} 
                    />
                )}
            </div>
        </div>
      )}

      <div className="flex flex-1 flex-col lg:flex-row">

      {/* Main Area: Game Canvas */}
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-100 p-4 dark:bg-slate-900">
        {/* Top score bar */}
        <div className="w-full max-w-5xl px-4 mb-4">
          <div className="mx-auto flex items-center justify-center gap-8 rounded-xl bg-white/80 py-2 px-4 text-center shadow dark:bg-slate-800/80 dark:shadow-lg">
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{players.p1} {searchParams.get('mode') !== 'local' && playerSlot === 'p1' ? '(You)' : ''}</div>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{scores.p1}</div>
            </div>
            <div className="text-sm font-medium text-slate-400 dark:text-slate-500">VS</div>
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{players.p2} {searchParams.get('mode') !== 'local' && playerSlot === 'p2' ? '(You)' : ''}</div>
              <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{scores.p2}</div>
            </div>
          </div>
        </div>

        <div className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-lg bg-slate-800 shadow-xl dark:bg-slate-400">
          <canvas
            ref={canvasRef}
            width={800}
            height={450}
            // keep canvas background transparent so wrapper CSS shows through
            className="h-full w-full bg-transparent"
            data-testid="game-canvas"
          />
          
          {/* Overlays */}
          {status === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10 backdrop-blur-sm">
              <div className="text-center text-white">
                <div className="mb-4 text-4xl">⌛</div>
                <h3 className="text-xl font-bold">Connecting to server...</h3>
              </div>
            </div>
          )}
          
          {/* Pausing disabled — server/client will not present paused UI */}

          {status === 'finished' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-md z-10">
              <div className="text-center text-white animate-in fade-in zoom-in duration-300">
                <h3 className="mb-2 text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-rose-400">
                  GAME OVER
                </h3>
                <div className="mb-6 text-3xl font-bold text-white">
                  {searchParams.get('mode') === 'local' ? `🏆 ${winner} Won!` : (winner === 'You' ? '🏆 You Won!' : '💀 You Lost')}
                </div>
                {/* Scores intentionally omitted from finished overlay per UX request */}
                <div className="flex gap-4 justify-center">
                  <button 
                    onClick={() => {
                      if (id?.startsWith('local-')) {
                        handleNextMatch()
                      } else {
                        playAgain()
                      }
                    }}
                    className="rounded-full bg-white px-8 py-3 font-bold text-slate-900 hover:bg-indigo-50 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    {id?.startsWith('local-') ? (advanceToNextMatch(matchQueue, currentMatchIndex) === -1 ? 'View Results' : 'Next Match') : 'Play Again'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Session destroyed modal: shown when a private room is removed while
              the user is still looking at it, or when accessing an already-
              destroyed private room. */}
          {showSessionDestroyed && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-slate-100/90">
              <div className="max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-slate-800">
                <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100">Room Removed</h3>
                <p className="mb-4 text-sm text-slate-700 dark:text-slate-300">This private room has been destroyed by its creator or expired. You can return to the home page to create or join another room.</p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      try { socketRef.current?.close() } catch (e) { /* ignore */ }
                      setShowSessionDestroyed(false)
                      setPlayerSlot(null)
                      setStatus('connecting')
                      navigate('/')
                    }}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Go Home
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Controls & Chat */}
      <div className="flex w-full flex-col border-t border-slate-200 bg-white p-6 lg:w-80 lg:border-l lg:border-t-0 dark:bg-slate-800 dark:border-slate-700">
        <div className="mb-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">Match Info</h2>
          <div className="mb-4">
            <div className="mb-2 text-sm text-slate-500 dark:text-slate-400">Status</div>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${
                status === 'playing' ? 'bg-green-500 animate-pulse' :
                status === 'connecting' ? 'bg-yellow-500' :
                'bg-slate-400 dark:bg-slate-600'
              }`} />
              <span className="font-medium capitalize text-slate-700 dark:text-slate-300">{status}</span>
            </div>
          </div>
          <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">Controls</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded bg-slate-50 p-3 dark:bg-slate-700">
              <div className="font-semibold text-slate-700 dark:text-slate-300">Move Up</div>
              <kbd className="font-mono text-slate-500 dark:text-slate-400">W / O</kbd>
            </div>
            <div className="rounded bg-slate-50 p-3 dark:bg-slate-700">
              <div className="font-semibold text-slate-700 dark:text-slate-300">Move Down</div>
              <kbd className="font-mono text-slate-500 dark:text-slate-400">S / L</kbd>
            </div>
          </div>
        </div>
        <div className="mb-6">
          <div className="flex">
            <button
              onClick={() => {
                try {
                  const ws = socketRef.current
                  if (ws && ws.readyState === (WebSocket as any).OPEN) {
                    try { ws.send(JSON.stringify({ event: 'control', payload: { type: 'LEAVE' } })) } catch (e) { /* ignore */ }
                  }
                } catch (e) {
                  // ignore
                } finally {
                  try { socketRef.current?.close() } catch (e) { /* ignore */ }
                  setStatus('connecting')
                  setPlayerSlot(null)
                  navigate('/')
                }
              }}
              className="w-full rounded-md border border-rose-400 bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600"
            >
              Leave
            </button>
          </div>
        </div>

        {/* Chat removed (old demo placeholder) */}
      </div>
      </div>
    </div>
  )
}

export default GameRoomPage
