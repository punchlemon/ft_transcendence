import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { soundManager } from '../lib/sound'
import { api, fetchTournament, TournamentDetail } from '../lib/api'
import BracketView from '../components/tournament/BracketView'
import TournamentRanking from '../components/tournament/TournamentRanking'
import { MatchQueueItem, advanceToNextMatch } from '../lib/tournament'

type GameStatus = 'connecting' | 'playing' | 'paused' | 'finished'

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
  const [sessionId, setSessionId] = useState<string | null>(null)

  const mode = searchParams.get('mode')

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
            if (data.payload.sessionId) setSessionId(data.payload.sessionId)
            // connection handled
          } else if (data.payload.type === 'START') {
            setStatus('playing')
          } else if (data.payload.type === 'PAUSE') {
            setStatus('paused')
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
      ws.close()
    }
    // reconnectKey is used to force a reconnect when user wants to play again
  }, [token, searchParams, reconnectKey, id])

  // Input handling
  useEffect(() => {
    if (status !== 'playing') return

    const keys = { 
      w: false, s: false, 
      up: false, down: false 
    }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'w') keys.w = true
      if (e.key === 's') keys.s = true
      if (e.key === 'ArrowUp') keys.up = true
      if (e.key === 'ArrowDown') keys.down = true
    }
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'w') keys.w = false
      if (e.key === 's') keys.s = false
      if (e.key === 'ArrowUp') keys.up = false
      if (e.key === 'ArrowDown') keys.down = false
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

        // P2 Input (Arrows)
        let axisP2 = 0
        if (keys.up) axisP2 -= 1
        if (keys.down) axisP2 += 1
        
        socketRef.current.send(JSON.stringify({
          event: 'input',
          payload: { tick: Date.now(), axis: axisP2, boost: false, player: 'p2' }
        }))
      } else {
        // Standard Input (WASD or Arrows)
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

  const togglePause = useCallback(() => {
    // Do nothing if the game is finished or still connecting.
    if (status === 'finished' || status === 'connecting') return

    const ws = socketRef.current
    if (!ws || ws.readyState !== (WebSocket as any).OPEN) {
      setStatus((s) => (s === 'playing' ? 'paused' : 'playing'))
      return
    }

    if (status === 'playing') {
      ws.send(JSON.stringify({ event: 'control', payload: { type: 'PAUSE' } }))
      setStatus('paused')
    } else {
      ws.send(JSON.stringify({ event: 'control', payload: { type: 'RESUME' } }))
      setStatus('playing')
    }
  }, [status])

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

  // Space key behavior:
  // - When finished: Space -> Play Again
  // - When paused: Space -> Resume
  // - During playing: Space does nothing (to avoid conflicting with input mapping)
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
      } else if (status === 'paused') {
        // resume
        togglePause()
      }
    }

    window.addEventListener('keydown', handleSpace)
    return () => window.removeEventListener('keydown', handleSpace)
  }, [status, playAgain, togglePause, handleNextMatch, id])

  // Game loop
  useEffect(() => {
    if (status !== 'playing') return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let animationFrameId: number
    const paddleHeight = 80
    const paddleWidth = 10
    const p1Y = canvas.height / 2 - paddleHeight / 2
    const p2Y = canvas.height / 2 - paddleHeight / 2

    const render = () => {
      // Clear canvas
      ctx.fillStyle = '#0f172a' // slate-900
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw center line
      ctx.setLineDash([10, 10])
      ctx.beginPath()
      ctx.moveTo(canvas.width / 2, 0)
      ctx.lineTo(canvas.width / 2, canvas.height)
      ctx.strokeStyle = '#334155' // slate-700
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.setLineDash([])

      const state = gameStateRef.current
      if (state) {
        // Draw paddles with glow
        ctx.shadowBlur = 15
        ctx.shadowColor = '#6366f1' // indigo-500
        ctx.fillStyle = '#818cf8' // indigo-400
        
        // Use server state for paddles if available, otherwise default
        const p1Pos = state.paddles?.p1 ?? p1Y
        const p2Pos = state.paddles?.p2 ?? p2Y
        
        ctx.fillRect(10, p1Pos, paddleWidth, paddleHeight)
        
        ctx.shadowColor = '#f43f5e' // rose-500
        ctx.fillStyle = '#fb7185' // rose-400
        ctx.fillRect(canvas.width - 20, p2Pos, paddleWidth, paddleHeight)

        // Draw ball with glow
        ctx.shadowBlur = 10
        ctx.shadowColor = '#f8fafc' // slate-50
        ctx.beginPath()
        ctx.arc(state.ball.x, state.ball.y, 8, 0, Math.PI * 2)
        ctx.fillStyle = '#f8fafc'
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
      {/* Left Panel: Match Info */}
        <div className="flex w-full flex-col border-b border-slate-200 bg-white p-6 lg:w-64 lg:border-b-0 lg:border-r dark:bg-slate-800 dark:border-slate-700">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Match Info</h2>
        </div>

        <div className="mt-auto">
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
      </div>

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

        <div className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-lg bg-slate-800 shadow-xl">
          <canvas
            ref={canvasRef}
            width={800}
            height={450}
            className="h-full w-full"
            data-testid="game-canvas"
          />
          
          {/* Overlays */}
          {status === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
              <div className="text-center text-white">
                <div className="mb-4 text-4xl">⌛</div>
                <h3 className="text-xl font-bold">Connecting to server...</h3>
              </div>
            </div>
          )}
          
          {status === 'paused' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
              <div className="text-center text-white">
                <h3 className="mb-4 text-2xl font-bold">PAUSED</h3>
                <button 
                  onClick={togglePause}
                  className="rounded-full bg-white px-6 py-2 font-semibold text-slate-900 hover:bg-slate-200"
                >
                  Resume
                </button>
              </div>
            </div>
          )}

          {status === 'finished' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 backdrop-blur-md z-10">
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
        </div>
      </div>

      {/* Right Panel: Controls & Chat */}
      <div className="flex w-full flex-col border-t border-slate-200 bg-white p-6 lg:w-80 lg:border-l lg:border-t-0 dark:bg-slate-800 dark:border-slate-700">
        <div className="mb-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">Controls</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded bg-slate-50 p-3 dark:bg-slate-700">
              <div className="font-semibold text-slate-700 dark:text-slate-300">Move Up</div>
              <kbd className="font-mono text-slate-500 dark:text-slate-400">W / ↑</kbd>
            </div>
            <div className="rounded bg-slate-50 p-3 dark:bg-slate-700">
              <div className="font-semibold text-slate-700 dark:text-slate-300">Move Down</div>
              <kbd className="font-mono text-slate-500 dark:text-slate-400">S / ↓</kbd>
            </div>
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          <button
            onClick={togglePause}
            disabled={!(status === 'playing' || status === 'paused')}
                className={`flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 ${
                  (status === 'finished' || status === 'connecting') ? 'opacity-50 cursor-not-allowed' : ''
                }`}
          >
            {status === 'playing' ? 'Pause' : 'Resume'}
          </button>
        </div>

        <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-700">
          <div className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400">Chat</div>
          <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
            Chat unavailable in demo
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

export default GameRoomPage
