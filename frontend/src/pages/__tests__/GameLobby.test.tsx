import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

// Mock API createPrivateRoom (use inline factory to avoid hoisting issues)
vi.mock('../../../src/lib/api', () => ({
  createPrivateRoom: vi.fn(() => Promise.resolve({ sessionId: 'game_private_abc123' }))
}), { virtual: true })

// Ensure auth store has a user
import useAuthStore from '../../stores/authStore'
import GameLobbyPage from '../GameLobby'

describe('GameLobby private room flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // set authenticated user
    useAuthStore.setState({ user: { id: 1, displayName: 'Tester' } } as any)
  })

  it('creates a private room when starting with no code and navigates', async () => {
    const user = userEvent.setup()
    render(<GameLobbyPage />)

    // Select Online PvP
    await user.click(screen.getByText('Online PvP'))
    // Select Private Room
    await user.click(screen.getByText('Private Room'))

    // Click Start Game (button text)
    await user.click(screen.getByRole('button', { name: 'Start Game' }))

    // Wait for navigation to be triggered and assert
    await new Promise((r) => setTimeout(r, 10))
    const api = await import('../../../src/lib/api')
    expect((api as any).createPrivateRoom).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/game/game_private_abc123?mode=remote&private=true&showInvite=1')
  })
})
