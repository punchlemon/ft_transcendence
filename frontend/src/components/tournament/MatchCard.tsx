import React, { useEffect, useState } from 'react'
import type { TournamentDetail } from '../../lib/api'
import UserAvatar from '../ui/UserAvatar'
import { fetchUserProfile, baseURL } from '../../lib/api'

const PlayerAvatarAndLabel: React.FC<{
  userId?: number | null
  alias?: string | null
  fallbackAvatarUrl?: string | null
  isPlaceholder: boolean
  isAI: boolean
  isWinner: boolean
}> = ({ userId = null, alias, fallbackAvatarUrl = null, isPlaceholder, isAI, isWinner }) => {
  const [meta, setMeta] = useState<{ id: number; displayName: string; avatarUrl?: string | null; login?: string; status?: string | null } | null>(null)

  useEffect(() => {
    let mounted = true
    if (!userId) {
      // avoid synchronous setState in effect body
      Promise.resolve().then(() => { if (mounted) setMeta(null) })
      return () => { mounted = false }
    }

    const idStr = String(userId)
    fetchUserProfile(idStr)
      .then((res) => {
        if (!mounted) return
        setMeta({ id: res.id, displayName: res.displayName, avatarUrl: res.avatarUrl ?? null, login: res.login, status: res.status ?? null })
      })
      .catch(() => { if (mounted) setMeta(null) })

    return () => { mounted = false }
  }, [userId])

  // Resolve avatar URL to absolute backend URL when necessary so we don't rely on nginx root routing
  const resolvedAvatar = (() => {
    const candidate = (meta?.avatarUrl ?? fallbackAvatarUrl) ?? null
    if (!candidate || typeof candidate !== 'string') return null
    const s = candidate.trim()
    if (s.length === 0) return null
    const lower = s.toLowerCase()
    if (lower === 'null' || lower === 'undefined' || lower === 'false') return null

    // Absolute URLs should be used as-is
    if (s.startsWith('http://') || s.startsWith('https://')) return s

    // For origin-relative paths (e.g. "/uploads/...") use them directly
    // Do NOT prefix with api baseURL ("/api") because static uploads are served at origin '/uploads/'
    if (s.startsWith('/')) return s

    // Otherwise treat as relative to origin root
    return `/${s}`
  })()
  const avatarUser: any = meta ? { ...meta, avatarUrl: resolvedAvatar ?? meta.avatarUrl, status: meta.status ?? 'OFFLINE' } : { id: userId ?? -1, displayName: alias ?? 'Unknown', avatarUrl: resolvedAvatar ?? null, login: undefined, status: 'OFFLINE' }

  return (
    <div className="flex items-center gap-2 w-full">
      <UserAvatar user={avatarUser as any} size="sm" linkToProfile={false} />
      <span className={`truncate text-xs font-bold ${isWinner ? 'text-indigo-700 dark:text-indigo-400' : (isPlaceholder && !isAI ? 'text-slate-400 italic dark:text-slate-500' : 'text-slate-700 dark:text-slate-300')}`}>
        {isPlaceholder ? (isAI ? 'AI' : 'Waiting...') : (meta ? meta.displayName : (alias ?? 'Unknown'))}
      </span>
    </div>
  )
}

type MatchCardProps = {
  match: TournamentDetail['matches'][0]
  onRemovePlayer?: (alias: string) => void
  playerGap: number
  playerWidth?: number
  currentUserAlias?: string
  isLeaf?: boolean
  participantLookup?: Record<number, TournamentDetail['participants'][0]>
}

export const MatchCard = ({ 
  match, 
  onRemovePlayer,
  playerGap,
  playerWidth = 100,
  currentUserAlias,
  isLeaf = true
  , participantLookup
}: MatchCardProps) => {
  if (!match) return null

  const { playerA, playerB, scoreA, scoreB, winnerId } = match
  
  const isWinnerA = !!(winnerId && playerA && winnerId === playerA.participantId)
  const isWinnerB = !!(winnerId && playerB && winnerId === playerB.participantId)
  const hasWinner = !!winnerId

  const renderPlayer = (player: typeof playerA, isWinner: boolean) => {
    if (!isLeaf) {
      // For non-leaf nodes, we don't render the player box or the div legs here.
      // The legs are now handled by the SVG in the parent container to ensure
      // seamless connection and correct length/width.
      // We return a placeholder to maintain the flex layout spacing.
      return (
        <div style={{ width: `${playerWidth}px`, height: '0px' }} />
      )
    }

    // Only for Round 1 (Leaf)
    const isMissingRound1 = !player && match.round === 1
    // Fix: Don't label empty slots as AI unless they are explicitly AI
    const isAI = player?.alias === 'AI'
    const isPlaceholder = !player || player.inviteState === 'PLACEHOLDER'
    const showRemove = !!onRemovePlayer && !!player?.alias && !winnerId && player.alias !== currentUserAlias && !isAI

    return (
      <div 
        className={`relative flex flex-col items-center justify-center rounded-md border bg-white p-2 shadow-sm transition-all dark:bg-slate-800 ${
          isWinner ? 'border-indigo-500 ring-1 ring-indigo-500 dark:border-indigo-400 dark:ring-indigo-400' : 'border-slate-200 dark:border-slate-700'
        }`}
        style={{ width: `${playerWidth}px`, height: '40px' }}
      >
        <PlayerAvatarAndLabel
          userId={
            (player as any)?.userId ?? (player as any)?.user?.id ??
            // Try resolving via participantLookup when match player only has participantId
            (participantLookup && player?.participantId ? participantLookup[player.participantId]?.userId ?? null : null)
          }
          alias={player?.alias}
          fallbackAvatarUrl={(player as any)?.avatarUrl ?? null}
          isPlaceholder={isPlaceholder}
          isAI={isAI}
          isWinner={isWinner}
        />
        
        {isAI && (
          <span className="absolute -top-1 -right-1 rounded bg-amber-100 px-1 text-[8px] font-bold text-amber-600 dark:bg-amber-900/50 dark:text-amber-300">AI</span>
        )}

        {showRemove && (
          <button 
            onClick={(e) => {
              e.stopPropagation()
              onRemovePlayer!(player!.alias)
            }}
            className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 shadow-sm hover:text-red-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:text-red-400"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
      </div>
    )
  }

  // SVG Coordinates
  // For non-leaf nodes, we extend the SVG downwards to form the "legs"
  // connecting to the previous round.
  const legHeight = isLeaf ? 0 : 4 // Length of the legs for non-leaf nodes
  const connectorHeight = 12 // Height of the T-shape connector
  const totalHeight = connectorHeight + legHeight
  
  const midY = connectorHeight / 2
  const midA = playerWidth / 2
  const midB = playerWidth * 1.5 + playerGap
  const center = playerWidth + playerGap / 2

  return (
    <div className="flex flex-col items-center">
      {/* T-Shape Connector (SVG) */}
      <div className="relative flex flex-col items-center w-full" style={{ height: `${totalHeight}px` }}>
        <svg 
            width={playerWidth * 2 + playerGap} 
            height={totalHeight} 
            viewBox={`0 0 ${playerWidth * 2 + playerGap} ${totalHeight}`}
            className="overflow-visible"
        >
            {/* 
               Path Logic:
               To avoid jagged overlaps at the T-junction, we draw continuous paths based on the winner.
               
               If A wins:
                 - Path A (Winner): Starts at bottom of leg A -> Up to midY -> Right to Center -> Up to Top
                 - Path B (Loser): Starts at bottom of leg B -> Up to midY -> Left to Center (Stops there)
               
               If B wins:
                 - Path B (Winner): Starts at bottom of leg B -> Up to midY -> Left to Center -> Up to Top
                 - Path A (Loser): Starts at bottom of leg A -> Up to midY -> Right to Center (Stops there)
               
               If No Winner:
                 - Path A: Leg A -> Center
                 - Path B: Leg B -> Center
                 - Stem: Center -> Top (Gray)
            */}

            {/* Base Gray Paths (Always drawn first for clean background) */}
            <path 
                d={`M ${midA} ${totalHeight} L ${midA} ${midY} L ${center} ${midY}`}
                fill="none"
                stroke="#cbd5e1" 
                className="dark:stroke-slate-600"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path 
                d={`M ${midB} ${totalHeight} L ${midB} ${midY} L ${center} ${midY}`}
                fill="none"
                stroke="#cbd5e1" 
                className="dark:stroke-slate-600"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path 
                d={`M ${center} ${midY} L ${center} 0`}
                fill="none"
                stroke="#cbd5e1" 
                className="dark:stroke-slate-600"
                strokeWidth="4"
                strokeLinecap="round"
            />

            {/* Colored Winner Path (Drawn on top) */}
            {isWinnerA && (
                <path 
                    d={`M ${midA} ${totalHeight} L ${midA} ${midY} L ${center} ${midY} L ${center} 0`}
                    fill="none"
                    stroke="#4f46e5" 
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            )}
            
            {isWinnerB && (
                <path 
                    d={`M ${midB} ${totalHeight} L ${midB} ${midY} L ${center} ${midY} L ${center} 0`}
                    fill="none"
                    stroke="#4f46e5" 
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            )}
        </svg>

        {/* Scores (Overlay) */}
        <div 
            className="absolute w-full flex justify-center text-xs font-bold z-10"
            style={{ top: `${midY - 15}px` }}
        >
            <span className={`mr-1.5 ${isWinnerA ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>{scoreA ?? '-'}</span>
            <span className={`ml-1.5 ${isWinnerB ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>{scoreB ?? '-'}</span>
        </div>
      </div>

      {/* Players Row (Bottom) */}
      <div className="flex" style={{ gap: `${playerGap}px` }}>
        {renderPlayer(playerA, isWinnerA)}
        {renderPlayer(playerB, isWinnerB)}
      </div>
    </div>
  )
}
