import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GameLobbyPage from './GameLobby'
import useAuthStore, { resetAuthStoreForTesting } from '../stores/authStore'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('GameLobbyPage', () => {
  beforeEach(() => {
    // set a logged-in user so lobby actions are enabled during tests
    useAuthStore.setState({ user: { id: 1, displayName: 'Test', status: 'ONLINE' } })
    mockNavigate.mockClear()
  })

  afterEach(() => {
    resetAuthStoreForTesting()
  })
  it('renders all game modes', () => {
    render(
      <MemoryRouter>
        <GameLobbyPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Local 1v1')).toBeInTheDocument()
    expect(screen.getByText('Online PvP')).toBeInTheDocument()
    expect(screen.getByText('vs AI')).toBeInTheDocument()
    expect(screen.getByText('Start Game')).toBeDisabled()
  })

  it('enables start button when local mode is selected', () => {
    render(
      <MemoryRouter>
        <GameLobbyPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Local 1v1'))
    expect(screen.getByText('Start Game')).toBeEnabled()
  })

  it('shows sub-options when remote mode is selected', () => {
    render(
      <MemoryRouter>
        <GameLobbyPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Online PvP'))
    expect(screen.getByText('Select Match Type')).toBeInTheDocument()
    expect(screen.getByText('Public Match')).toBeInTheDocument()
    expect(screen.getByText('Private Room')).toBeInTheDocument()
    // Start button should still be disabled until match type is selected
    expect(screen.getByText('Start Game')).toBeDisabled()
  })

  it('navigates immediately for local game', () => {
    render(
      <MemoryRouter>
        <GameLobbyPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Local 1v1'))
    fireEvent.click(screen.getByText('Start Game'))

    expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/game\/game-local-/))
  })

  it('shows matching spinner for public remote game', async () => {
    render(
      <MemoryRouter>
        <GameLobbyPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Online PvP'))
    fireEvent.click(screen.getByText('Public Match'))
    expect(screen.getByText('Start Game')).toBeEnabled()

    fireEvent.click(screen.getByText('Start Game'))

    expect(screen.getByText('Looking for an opponent...')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('cancels matching and returns to selection', () => {
    render(
      <MemoryRouter>
        <GameLobbyPage />
      </MemoryRouter>
    )

    // Start matching
    fireEvent.click(screen.getByText('Online PvP'))
    fireEvent.click(screen.getByText('Public Match'))
    fireEvent.click(screen.getByText('Start Game'))

    // Cancel
    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByText('Looking for an opponent...')).not.toBeInTheDocument()
    // after cancelling, mode selection should be visible again
    expect(screen.getByText('Local 1v1')).toBeInTheDocument()
  })
})
