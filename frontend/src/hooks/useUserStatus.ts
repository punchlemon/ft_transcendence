import { useState, useEffect } from 'react'
import { onChatWsEvent } from '../lib/chatWs'

export const useUserStatus = (userId?: number, initialStatus: string = 'OFFLINE') => {
  const [status, setStatus] = useState(initialStatus)

  useEffect(() => {
    setStatus(initialStatus)
  }, [initialStatus])

  useEffect(() => {
    if (!userId) return

    const cleanup = onChatWsEvent('user_update', (data: any) => {
      if (data.id === userId && data.status) {
        setStatus(data.status)
      }
    })

    return cleanup
  }, [userId])

  return status
}
