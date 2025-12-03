import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import ChatDrawer from './ChatDrawer'
import { api, inviteToGame } from '../../lib/api'
import { useChatStore } from '../../stores/chatStore'

const mockNavigate = vi.fn()

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

// Mock api
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn()
  },
  inviteToGame: vi.fn(),
  baseURL: 'http://localhost:3000'
}))

// Mock auth store
vi.mock('../../stores/authStore', () => {
  const user = { id: 1, displayName: 'Me' }
  const mockStore = () => ({
    user
  })
  // @ts-ignore
  mockStore.getState = () => ({ accessToken: 'mock-token' })
  return { default: mockStore }
})

describe('ChatDrawer', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    useChatStore.setState({
      threads: [],
      activeThreadId: null,
      messages: {},
      isLoading: false
    })
  })

  it('renders in collapsed state initially', () => {
    render(<ChatDrawer />)
    expect(screen.getByText('Chat')).toBeInTheDocument()
  })

  it('expands and fetches threads', async () => {
    const mockThreads = [
      {
        id: 1,
        name: 'Alice',
        type: 'DM',
        updatedAt: new Date().toISOString(),
        lastMessage: { content: 'Hello' },
        members: [{ id: 2, displayName: 'Alice', status: 'ONLINE' }]
      }
    ]
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: mockThreads }) // fetchThreads
      .mockResolvedValueOnce({ data: { data: [] } }) // fetchNotifications

    render(<ChatDrawer />)
    fireEvent.click(screen.getByTestId('chat-header'))

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
    expect(api.get).toHaveBeenCalledWith('/chat/threads')
  })

  it('navigates to thread and sends message', async () => {
    const mockThreads = [
      {
        id: 1,
        name: 'Alice',
        type: 'DM',
        updatedAt: new Date().toISOString(),
        lastMessage: { content: 'Hello' },
        members: [{ id: 2, displayName: 'Alice', status: 'ONLINE' }]
      }
    ]
    const mockMessages = [
      {
        id: 1,
        channelId: 1,
        userId: 2,
        content: 'Hi there!',
        sentAt: new Date().toISOString(),
        user: { id: 2, displayName: 'Alice', avatarUrl: null }
      }
    ]

    vi.mocked(api.get).mockResolvedValue({ data: [] }) // Default fallback
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: mockThreads }) // fetchThreads (initial)
      .mockResolvedValueOnce({ data: { data: [] } }) // fetchNotifications
      .mockResolvedValueOnce({ data: mockMessages }) // fetchMessages (select thread)

    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: {} }) // markAsRead
      .mockResolvedValueOnce({ data: {
        id: 2,
        channelId: 1,
        userId: 1,
        content: 'New message',
        sentAt: new Date().toISOString(),
        user: { id: 1, displayName: 'Me', avatarUrl: null }
      } })

    render(<ChatDrawer />)
    
    // Open drawer
    fireEvent.click(screen.getByTestId('chat-header'))
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())
    
    // Click thread
    fireEvent.click(screen.getByText('Alice'))
    
    // Check if messages are shown
    await waitFor(() => expect(screen.getByText('Hi there!')).toBeInTheDocument())
    
    // Type and send message
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'New message' } })
    fireEvent.click(screen.getByText('Send'))
    
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/chat/threads/1/messages', { content: 'New message' })
    })
    
    // Should fetch messages again
    await waitFor(() => expect(screen.getByText('New message')).toBeInTheDocument())
  })

  it('invites user to game from DM thread', async () => {
    const mockThreads = [
      {
        id: 1,
        name: 'Alice',
        type: 'DM',
        updatedAt: new Date().toISOString(),
        lastMessage: { content: 'Hello' },
        members: [{ id: 2, displayName: 'Alice', status: 'ONLINE' }]
      }
    ]
    const mockMessages: any[] = []

    vi.mocked(api.get).mockResolvedValue({ data: [] })
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: mockThreads }) // fetchThreads
      .mockResolvedValueOnce({ data: { data: [] } }) // fetchNotifications
      .mockResolvedValueOnce({ data: mockMessages }) // fetchMessages

    vi.mocked(inviteToGame).mockResolvedValue({ sessionId: 'sess-123' })

    render(<ChatDrawer />)

    // Open drawer
    fireEvent.click(screen.getByTestId('chat-header'))
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())

    // Click thread
    fireEvent.click(screen.getByText('Alice'))
    
    // Open menu
    const menuButton = screen.getByText('⋮')
    fireEvent.click(menuButton)

    // Click invite
    const inviteButton = screen.getByText('Invite to Game')
    fireEvent.click(inviteButton)

    await waitFor(() => {
      expect(inviteToGame).toHaveBeenCalledWith(2)
      expect(mockNavigate).toHaveBeenCalledWith('/game/sess-123')
    })
  })
})
