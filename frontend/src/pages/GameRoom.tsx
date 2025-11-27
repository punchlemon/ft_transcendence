import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

type GameStatus = 'connecting' | 'playing' | 'paused' | 'finished'

const GameRoomPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  const [status, setStatus] = useState<GameStatus>('connecting')
  const [scores, setScores] = useState({ p1: 0, p2: 0 })
  const [players, setPlayers] = useState({ p1: 'Player 1', p2: 'Player 2' })

  // Game loop simulation
  useEffect(() => {
    if (status !== 'playing') return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let animationFrameId: number
    let ball = { x: canvas.width / 2, y: canvas.height / 2, dx: 4, dy: 4, radius: 8 }
    const paddleHeight = 80
    const paddleWidth = 10
    const p1Y = canvas.height / 2 - paddleHeight / 2
    const p2Y = canvas.height / 2 - paddleHeight / 2

    const render = () => {
      // Clear canvas
      ctx.fillStyle = '#1e293b' // slate-800
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw center line
      ctx.setLineDash([10, 10])
      ctx.beginPath()
      ctx.moveTo(canvas.width / 2, 0)
      ctx.lineTo(canvas.width / 2, canvas.height)
      ctx.strokeStyle = '#475569' // slate-600
      ctx.stroke()
      ctx.setLineDash([])

      // Draw paddles
      ctx.fillStyle = '#f8fafc' // slate-50
      ctx.fillRect(10, p1Y, paddleWidth, paddleHeight)
      ctx.fillRect(canvas.width - 20, p2Y, paddleWidth, paddleHeight)

      // Draw ball
      ctx.beginPath()
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
      ctx.fillStyle = '#f8fafc'
      ctx.fill()
      ctx.closePath()

      // Update ball position (simple bounce)
      ball.x += ball.dx
      ball.y += ball.dy

      if (ball.y + ball.radius > canvas.height || ball.y - ball.radius < 0) {
        ball.dy = -ball.dy
      }
      if (ball.x + ball.radius > canvas.width || ball.x - ball.radius < 0) {
        ball.dx = -ball.dx
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [status])

  // Simulate connection sequence
  useEffect(() => {
    if (status === 'connecting') {
      const timer = setTimeout(() => {
        setStatus('playing')
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [status])

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col lg:flex-row">
      {/* Left Panel: Match Info */}
      <div className="flex w-full flex-col border-b border-slate-200 bg-white p-6 lg:w-64 lg:border-b-0 lg:border-r">
        <h2 className="mb-6 text-lg font-bold text-slate-900">Match Info</h2>
        
        <div className="mb-8 space-y-6">
          <div>
            <div className="mb-1 text-sm text-slate-500">Player 1 (You)</div>
            <div className="font-semibold text-slate-900">{players.p1}</div>
            <div className="text-3xl font-bold text-indigo-600">{scores.p1}</div>
          </div>
          
          <div className="text-center text-sm font-medium text-slate-400">VS</div>
          
          <div>
            <div className="mb-1 text-sm text-slate-500">Player 2</div>
            <div className="font-semibold text-slate-900">{players.p2}</div>
            <div className="text-3xl font-bold text-rose-600">{scores.p2}</div>
          </div>
        </div>

        <div className="mt-auto">
          <div className="mb-2 text-sm text-slate-500">Status</div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${
              status === 'playing' ? 'bg-green-500 animate-pulse' :
              status === 'connecting' ? 'bg-yellow-500' :
              'bg-slate-400'
            }`} />
            <span className="font-medium capitalize text-slate-700">{status}</span>
          </div>
        </div>
      </div>

      {/* Main Area: Game Canvas */}
      <div className="relative flex flex-1 items-center justify-center bg-slate-100 p-4">
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
                  onClick={() => setStatus('playing')}
                  className="rounded-full bg-white px-6 py-2 font-semibold text-slate-900 hover:bg-slate-200"
                >
                  Resume
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Controls & Chat */}
      <div className="flex w-full flex-col border-t border-slate-200 bg-white p-6 lg:w-80 lg:border-l lg:border-t-0">
        <div className="mb-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Controls</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded bg-slate-50 p-3">
              <div className="font-semibold text-slate-700">Move Up</div>
              <kbd className="font-mono text-slate-500">W / ↑</kbd>
            </div>
            <div className="rounded bg-slate-50 p-3">
              <div className="font-semibold text-slate-700">Move Down</div>
              <kbd className="font-mono text-slate-500">S / ↓</kbd>
            </div>
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setStatus(status === 'playing' ? 'paused' : 'playing')}
            className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {status === 'playing' ? 'Pause' : 'Resume'}
          </button>
          <button
            onClick={() => navigate('/game/new')}
            className="flex-1 rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Surrender
          </button>
        </div>

        <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 text-sm font-medium text-slate-500">Chat</div>
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Chat unavailable in demo
          </div>
        </div>
      </div>
    </div>
  )
}

export default GameRoomPage
