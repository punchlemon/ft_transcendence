import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import ChatDrawer from './ChatDrawer'

describe('ChatDrawer', () => {
  beforeAll(() => {
    // Mock scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('renders in collapsed state initially', () => {
    render(<ChatDrawer />)
    expect(screen.getByText('Chat')).toBeInTheDocument()
    // Should not show thread list content yet (or hidden)
    // We can check if the container has the collapsed class or height
    // But testing implementation details (classes) is brittle.
    // Instead, let's check if we can find a thread name.
    // In the current implementation, content is conditionally rendered with `isOpen &&`
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('expands when header is clicked', () => {
    render(<ChatDrawer />)
    fireEvent.click(screen.getByTestId('chat-header'))
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('navigates to thread and sends message', () => {
    render(<ChatDrawer />)
    
    // Open drawer
    fireEvent.click(screen.getByTestId('chat-header'))
    
    // Click thread
    fireEvent.click(screen.getByText('Alice'))
    
    // Check if messages are shown
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
    
    // Type and send message
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'New message' } })
    fireEvent.click(screen.getByText('Send'))
    
    // Check if new message appears
    expect(screen.getByText('New message')).toBeInTheDocument()
    // Input should be cleared
    expect(input).toHaveValue('')
  })

  it('navigates back to thread list', () => {
    render(<ChatDrawer />)
    
    // Open and enter thread
    fireEvent.click(screen.getByTestId('chat-header'))
    fireEvent.click(screen.getByText('Alice'))
    
    // Click back button
    fireEvent.click(screen.getByText('←'))
    
    // Should see thread list again
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Type a message...')).not.toBeInTheDocument()
  })

  it('switches tabs', () => {
    render(<ChatDrawer />)
    fireEvent.click(screen.getByTestId('chat-header'))
    
    fireEvent.click(screen.getByText('System'))
    expect(screen.getByText('No system notifications')).toBeInTheDocument()
    
    fireEvent.click(screen.getByText('Messages'))
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
})
