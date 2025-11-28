import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useNotificationStore, type Notification } from '../../stores/notificationStore'
import { acceptFriendRequest, removeFriend } from '../../lib/api'

const NotificationItem = ({ notification, onClose }: { notification: Notification; onClose: () => void }) => {
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
      // Optionally delete notification or update text
      deleteNotification(notification.id)
    } catch (error) {
      console.error(error)
      setActionStatus('error')
    }
  }

  const handleDeclineFriend = async () => {
    // Assuming we can just delete the notification or call a decline API
    // For now, just delete the notification which ignores the request
    deleteNotification(notification.id)
  }

  const handleGameInvite = () => {
    const gameId = notification.data?.gameId || notification.data?.sessionId
    if (gameId) {
      navigate(`/game/${gameId}`)
      onClose()
    }
  }

  return (
    <div
      className={`relative flex flex-col gap-2 border-b border-slate-100 p-4 text-sm hover:bg-slate-50 ${
        !notification.read ? 'bg-indigo-50/50' : ''
      }`}
      onClick={handleClick}
    >
      <div className="flex justify-between gap-2">
        <p className="text-slate-800">{notification.message}</p>
        <button
          onClick={(e) => {
            e.stopPropagation()
            deleteNotification(notification.id)
          }}
          className="text-slate-400 hover:text-slate-600"
          title="削除"
        >
          ×
        </button>
      </div>
      <span className="text-xs text-slate-500">{new Date(notification.createdAt).toLocaleString()}</span>

      {notification.type === 'FRIEND_REQUEST' && actionStatus !== 'success' && (
        <div className="mt-1 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleAcceptFriend()
            }}
            disabled={actionStatus === 'loading'}
            className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            承認
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDeclineFriend()
            }}
            disabled={actionStatus === 'loading'}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            拒否
          </button>
        </div>
      )}

      {notification.type === 'MATCH_INVITE' ? (
        <div className="mt-1 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleGameInvite()
            }}
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
          >
            参加する
          </button>
        </div>
      ) : null}
    </div>
  )
}

const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false)
  const notifications = useNotificationStore((state) => state.notifications)
  const unreadCount = useNotificationStore((state) => state.unreadCount)
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications)
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-6 w-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 origin-top-right rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="font-semibold text-slate-900">通知</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-xs text-indigo-600 hover:text-indigo-500"
              >
                すべて既読にする
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">通知はありません</div>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onClose={() => setIsOpen(false)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
