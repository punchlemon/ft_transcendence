import { useState, useRef, KeyboardEvent, FormEvent } from 'react'
import logger from '../../lib/logger'

interface MessageInputProps {
  onSend: (message: string) => void | Promise<void>
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}

export const MessageInput = ({ 
  onSend, 
  placeholder = "Type a message...", 
  disabled = false,
  autoFocus = false,
  className = ""
}: MessageInputProps) => {
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter without Shift = send message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
    // Shift+Enter = new line (default behavior)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!message.trim() || isSending || disabled) return

    setIsSending(true)
    try {
      await onSend(message)
      setMessage('')
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } catch (err) {
      logger.error('Failed to send chat message', err)
    } finally {
      setIsSending(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`flex gap-2 ${className}`}>
      <textarea
        ref={textareaRef}
        value={message}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isSending}
        autoFocus={autoFocus}
        rows={1}
        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 resize-none overflow-hidden max-h-32 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
        style={{ minHeight: '38px' }}
      />
      <button 
        type="submit"
        disabled={!message.trim() || isSending || disabled}
        className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700 self-end"
      >
        {isSending ? 'Sending...' : 'Send'}
      </button>
    </form>
  )
}
