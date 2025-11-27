import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import GameRoomPage from './GameRoom'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'test-game-id' }),
  }
})

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

describe('GameRoomPage', () => {
  it('renders game canvas and info', () => {
    render(
      <MemoryRouter>
        <GameRoomPage />
      </MemoryRouter>
    )

    expect(screen.getByTestId('game-canvas')).toBeInTheDocument()
    expect(screen.getByText('Match Info')).toBeInTheDocument()
    expect(screen.getByText('Player 1 (You)')).toBeInTheDocument()
    // Player 2 appears twice (label and name), so we check if at least one exists
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

  it('transitions to playing state', async () => {
    render(
      <MemoryRouter>
        <GameRoomPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.queryByText('Connecting to server...')).not.toBeInTheDocument()
    }, { timeout: 2000 })

    expect(screen.getByText('playing')).toBeInTheDocument()
  })

  it('toggles pause state', async () => {
    render(
      <MemoryRouter>
        <GameRoomPage />
      </MemoryRouter>
    )

    // Wait for playing state
    await waitFor(() => {
      expect(screen.getByText('playing')).toBeInTheDocument()
    }, { timeout: 2000 })

    // Click Pause
    fireEvent.click(screen.getByText('Pause'))
    expect(screen.getByText('PAUSED')).toBeInTheDocument()
    
    // Resume buttons appear in overlay and side panel
    const resumeButtons = screen.getAllByText('Resume')
    expect(resumeButtons.length).toBeGreaterThan(0)

    // Click Resume (use the first one found, likely the overlay one or side panel)
    fireEvent.click(resumeButtons[0])
    expect(screen.queryByText('PAUSED')).not.toBeInTheDocument()
  })

  it('navigates to lobby on surrender', () => {
    render(
      <MemoryRouter>
        <GameRoomPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Surrender'))
    expect(mockNavigate).toHaveBeenCalledWith('/game/new')
  })
})
