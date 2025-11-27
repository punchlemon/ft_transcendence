import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import ChatDrawer from './ChatDrawer'
import { api } from '../../lib/api'

// Mock api
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

// Mock auth store
vi.mock('../../stores/authStore', () => ({
  default: () => ({
    user: { id: 1, displayName: 'Me' }
  })
}))

describe('ChatDrawer', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  beforeEach(() => {
    vi.clearAllMocks()
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
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: mockThreads } })

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

    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } }) // Default fallback
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: mockThreads } }) // fetchThreads (initial)
      .mockResolvedValueOnce({ data: { data: mockMessages } }) // fetchMessages (select thread)
      .mockResolvedValueOnce({ data: { data: [...mockMessages, {
        id: 2,
        channelId: 1,
        userId: 1,
        content: 'New message',
        sentAt: new Date().toISOString(),
        user: { id: 1, displayName: 'Me', avatarUrl: null }
      }] } }) // fetchMessages (after send)
      .mockResolvedValueOnce({ data: { data: mockThreads } }) // fetchThreads (after send)

    vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

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
})
