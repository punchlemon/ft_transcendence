import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GameRoomPage from './GameRoom'
import useAuthStore from '../stores/authStore'

// Mock Sound Manager
vi.mock('../lib/sound', () => ({
  soundManager: {
    playPaddleHit: vi.fn(),
    playWallHit: vi.fn(),
    playScore: vi.fn(),
    playGameOver: vi.fn(),
  }
}))

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'test-game-id' }),
  }
})

// Mock Auth Store
vi.mock('../stores/authStore', () => ({
  default: vi.fn(),
}))

// Mock Canvas context
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillStyle: '',
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  closePath: vi.fn(),
  setLineDash: vi.fn(),
})) as any

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: any) => void) | null = null
  onclose: (() => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor(public url: string) {
    setTimeout(() => {
      this.onopen?.()
    }, 0)
  }
}

describe('GameRoomPage', () => {
  let mockWs: MockWebSocket

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup Auth Store mock
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({
        accessToken: 'test-token',
      })
    )

    // Setup WebSocket mock
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders game canvas and info', async () => {
    let wsInstance: MockWebSocket | undefined
    vi.spyOn(global, 'WebSocket').mockImplementation((url) => {
      wsInstance = new MockWebSocket(url as string)
      return wsInstance as any
    })

    render(
      <MemoryRouter>
        <GameRoomPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(wsInstance).toBeDefined())

    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          event: 'match:event',
          payload: { type: 'CONNECTED', slot: 'p1' }
        })
      })
    })

    expect(screen.getByTestId('game-canvas')).toBeInTheDocument()
    expect(screen.getByText('Match Info')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Player 1 (You)')).toBeInTheDocument())
    expect(screen.getAllByText('Player 2').length).toBeGreaterThan(0)
  })

  it('starts in connecting state', () => {
    render(
      <MemoryRouter>
        <GameRoomPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Connecting to server...')).toBeInTheDocument()
    expect(screen.getByText('connecting')).toBeInTheDocument()
  })

  it('transitions to playing state on CONNECTED message', async () => {
    // Capture the WebSocket instance
    let wsInstance: MockWebSocket | undefined
    vi.spyOn(global, 'WebSocket').mockImplementation((url) => {
      wsInstance = new MockWebSocket(url as string)
      return wsInstance as any
    })

    render(
      <MemoryRouter>
        <GameRoomPage />
      </MemoryRouter>
    )

    // Wait for WebSocket to be created
    await waitFor(() => expect(wsInstance).toBeDefined())

    // Simulate server message
    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          event: 'match:event',
          payload: { type: 'START' }
        })
      })
    })

    await waitFor(() => {
      expect(screen.queryByText('Connecting to server...')).not.toBeInTheDocument()
    })

    expect(screen.getByText('playing')).toBeInTheDocument()
  })

  it('does not show pause controls (pausing disabled)', async () => {
    let wsInstance: MockWebSocket | undefined
    vi.spyOn(global, 'WebSocket').mockImplementation((url) => {
      wsInstance = new MockWebSocket(url as string)
      return wsInstance as any
    })

    render(
      <MemoryRouter>
        <GameRoomPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(wsInstance).toBeDefined())

    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          event: 'match:event',
          payload: { type: 'START' }
        })
      })
    })

    await waitFor(() => {
      expect(screen.getByText('playing')).toBeInTheDocument()
    })

    // Pause controls were removed
    expect(screen.queryByText('Pause')).not.toBeInTheDocument()
    expect(screen.queryByText('Resume')).not.toBeInTheDocument()
  })

  it('does not render Back to Home button (removed by UX)', () => {
    render(
      <MemoryRouter>
        <GameRoomPage />
      </MemoryRouter>
    )

    expect(screen.queryByText('Back to Home')).not.toBeInTheDocument()
  })

  it('shows walkover messaging when opponent forfeits', async () => {
    let wsInstance: MockWebSocket | undefined
    vi.spyOn(global, 'WebSocket').mockImplementation((url) => {
      wsInstance = new MockWebSocket(url as string)
      return wsInstance as any
    })

    render(
      <MemoryRouter>
        <GameRoomPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(wsInstance).toBeDefined())

    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          event: 'match:event',
          payload: { type: 'CONNECTED', slot: 'p1' }
        })
      })
    })

    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          event: 'match:event',
          payload: {
            type: 'FINISHED',
            winner: 'p1',
            score: { p1: 1, p2: 0 },
            reason: 'FORFEIT',
            meta: {
              forfeit: {
                loserSlot: 'p2',
                winnerSlot: 'p1',
                loserAlias: 'Opponent'
              }
            }
          }
        })
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Opponent forfeited the match. Walkover win recorded.')).toBeInTheDocument()
    })
    expect(screen.getByText('Walkover')).toBeInTheDocument()
  })
})
