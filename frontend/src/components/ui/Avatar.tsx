import React from 'react'

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
  const initial = alt.charAt(0).toUpperCase()
  
  // Generate a consistent background color based on the name
  const getBgColor = (name: string) => {
    const colors = [
      'bg-red-500',
      'bg-orange-500',
      'bg-amber-500',
      'bg-yellow-500',
      'bg-lime-500',
      'bg-green-500',
      'bg-emerald-500',
      'bg-teal-500',
      'bg-cyan-500',
      'bg-sky-500',
      'bg-blue-500',
      'bg-indigo-500',
      'bg-violet-500',
      'bg-purple-500',
      'bg-fuchsia-500',
      'bg-pink-500',
      'bg-rose-500',
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  const baseClasses = `inline-flex items-center justify-center rounded-full object-cover border border-slate-200 ${sizeClasses[size]} ${className}`

  if (src) {
    return <img src={src} alt={alt} className={baseClasses} />
  }

  return (
    <div className={`${baseClasses} ${getBgColor(alt)} text-white font-bold`}>
      {initial}
    </div>
  )
}

export default Avatar
