import { useState } from 'react'
import logger from '../../lib/logger'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore, type Notification } from '../../stores/notificationStore'
import { acceptFriendRequest, declineFriendRequest } from '../../lib/api'

const NotificationItem = ({ notification }: { notification: Notification }) => {
  const markAsRead = useNotificationStore((state) => state.markAsRead)
  const deleteNotification = useNotificationStore((state) => state.deleteNotification)
  const navigate = useNavigate()
  const [actionStatus, setActionStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const handleClick = () => {
    if (!notification.read) {
      markAsRead(notification.id)
    }
  }

  const handleAcceptFriend = async () => {
    if (!notification.data?.requestId) return
    setActionStatus('loading')
    try {
      await acceptFriendRequest(notification.data.requestId)
      setActionStatus('success')
      deleteNotification(notification.id)
    } catch (error) {
      logger.error('Failed to accept friend request', error)
      setActionStatus('error')
    }
  }

  const handleDeclineFriend = async () => {
    if (notification.data?.requestId) {
      try {
        await declineFriendRequest(notification.data.requestId)
      } catch (error) {
        logger.error('Failed to decline friend request', error)
      }
    }
    deleteNotification(notification.id)
  }

  const handleGameInvite = () => {
    const gameId = notification.data?.gameId || notification.data?.sessionId
    if (gameId) {
      navigate(`/game/${gameId}`)
    }
  }

  return (
    <div
      className={`flex flex-col gap-2 border-b border-slate-100 p-4 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/50 ${
        !notification.read ? 'bg-indigo-50/40 dark:bg-indigo-950/30' : ''
      }`}
      onClick={handleClick}
    >
      <div className="flex justify-between gap-4">
        <p className="text-sm text-slate-800 dark:text-slate-200">{notification.message}</p>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (notification.type === 'FRIEND_REQUEST') {
              handleDeclineFriend()
            } else {
              deleteNotification(notification.id)
            }
          }}
          className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          title="Delete"
        >
          ×
        </button>
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(notification.createdAt).toLocaleString()}</span>

      {notification.type === 'FRIEND_REQUEST' && actionStatus !== 'success' && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleAcceptFriend()
            }}
            disabled={actionStatus === 'loading'}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700"
          >
            Accept
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDeclineFriend()
            }}
            disabled={actionStatus === 'loading'}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
          >
            Decline
          </button>
        </div>
      )}

      {notification.type === 'MATCH_INVITE' ? (
        <div className="mt-2 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleGameInvite()
            }}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-700"
          >
            Join
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default NotificationItem
