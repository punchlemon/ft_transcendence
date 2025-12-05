import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { useUserStatus } from '../../hooks/useUserStatus'
import { DEFAULT_AVATARS } from '../../lib/avatars'

export interface UserAvatarProps {
  user: {
    id?: number
    displayName: string
    avatarUrl?: string | null
    status?: string // 'ONLINE', 'OFFLINE', 'IN_MATCH'
    login?: string
  }
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  className?: string
  linkToProfile?: boolean
}

const statusColors: Record<string, string> = {
  ONLINE: 'bg-green-500',
  IN_MATCH: 'bg-yellow-500',
  OFFLINE: 'bg-slate-400',
}

const statusSizes = {
  xs: 'h-2 w-2',
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
  xl: 'h-5 w-5',
  '2xl': 'h-6 w-6',
}

const UserAvatar: React.FC<UserAvatarProps> = ({ user, size = 'md', className = '', linkToProfile = true }) => {
  const status = useUserStatus(user.id, user.status)
  const statusColor = statusColors[status || 'OFFLINE'] || statusColors.OFFLINE
  const statusSize = statusSizes[size]

  // avatarUrlがnull/undefinedの場合、loginベースのデフォルトアバターを使用
  const avatarSrc = useMemo(() => {
    if (user.avatarUrl) {
      return user.avatarUrl
    }
    // loginをシードにしてデフォルトアバターを選択
    if (user.login) {
      let hash = 0
      for (let i = 0; i < user.login.length; i += 1) {
        const char = user.login.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32bit integer
      }
      const index = Math.abs(hash) % DEFAULT_AVATARS.length
      return DEFAULT_AVATARS[index]
    }
    return null
  }, [user.avatarUrl, user.login])

  const content = (
    <div className={`relative inline-block ${className}`}>
      <Avatar src={avatarSrc} alt={user.displayName} size={size} />
      <span className={`absolute bottom-0 right-0 block ${statusSize} rounded-full ring-2 ring-white ${statusColor}`} />
    </div>
  )

  if (linkToProfile && user.login) {
    return (
      <Link to={`/${user.login}`} onClick={(e) => e.stopPropagation()}>
        {content}
      </Link>
    )
  }

  return content
}

export default UserAvatar
