import React from 'react'
import { User } from 'lucide-react'

interface AvatarProps {
  src?: string | null
  alt: string
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

const sizeClasses = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-24 w-24 text-3xl',
  '2xl': 'h-32 w-32 text-4xl',
}

const Avatar: React.FC<AvatarProps> = ({ src, alt, className = '', size = 'md' }) => {
  const baseClasses = `inline-flex items-center justify-center rounded-full object-cover border border-slate-200 ${sizeClasses[size]} ${className}`

  if (src) {
    return <img src={src} alt={alt} className={baseClasses} />
  }

  return (
    <div className={`${baseClasses} bg-slate-200 text-slate-400`}>
      <User className="h-1/2 w-1/2" />
    </div>
  )
}

export default Avatar
