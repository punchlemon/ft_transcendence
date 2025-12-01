import { useMemo } from 'react'
import type { TournamentDetail } from '../../lib/api'

type BracketViewProps = {
  matches: TournamentDetail['matches']
  currentMatchIndex: number
  onRemovePlayer?: (alias: string) => void // Optional callback for setup mode
}

const MatchCard = ({ 
  match, 
  isCurrent, 
  totalScores,
  onRemovePlayer
}: { 
  match: TournamentDetail['matches'][0], 
  isCurrent: boolean,
  totalScores: Record<string, number>,
  onRemovePlayer?: (alias: string) => void
}) => {
  const winnerId = match.winnerId
  
  // Helper to render a player row
  const PlayerRow = ({ 
    player, 
    score, 
    isWinner,
    isPlaceholder 
  }: { 
    player: typeof match.playerA, 
    score?: number | null, 
    isWinner: boolean,
    isPlaceholder: boolean
  }) => {
    const totalScore = player ? (totalScores[player.alias] ?? 0) : 0
    
    return (
      <div className={`flex items-center justify-between px-3 py-2 ${isWinner ? 'bg-yellow-50/50' : ''}`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`truncate text-sm font-medium ${isWinner ? 'text-slate-900' : 'text-slate-600'} ${isPlaceholder ? 'text-slate-400 italic' : ''}`}>
            {player?.alias ?? (isPlaceholder ? 'Bye' : 'TBD')}
          </span>
          {player && !isPlaceholder && (
            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 rounded-full" title="Total Score">
              {totalScore} pts
            </span>
          )}
        </div>
        {score !== undefined && score !== null && (
          <span className={`ml-3 font-mono font-bold ${isWinner ? 'text-slate-900' : 'text-slate-500'}`}>
            {score}
          </span>
        )}
        {/* Show remove button only if it's round 1, setup mode (onRemovePlayer exists), and player exists */}
        {onRemovePlayer && player && match.round === 1 && (
            <button 
                onClick={(e) => {
                    e.stopPropagation()
                    onRemovePlayer(player.alias)
                }}
                className="ml-2 text-slate-400 hover:text-red-500"
                title="Remove player"
            >
                ×
            </button>
        )}
      </div>
    )
  }

  return (
    <div 
      className={`relative w-64 h-24 rounded-lg border bg-white shadow-sm transition-all flex flex-col justify-between ${
        isCurrent ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200'
      }`}
    >
      <div className="divide-y divide-slate-100 flex-1 flex flex-col justify-center">
        <PlayerRow 
          player={match.playerA} 
          score={match.scoreA} 
          isWinner={!!(match.playerA && winnerId === match.playerA.participantId)}
          isPlaceholder={!match.playerA}
        />
        <PlayerRow 
          player={match.playerB} 
          score={match.scoreB} 
          isWinner={!!(match.playerB && winnerId === match.playerB.participantId)}
          isPlaceholder={!match.playerB}
        />
      </div>
      
      {/* Match ID / Status footer */}
      <div className="bg-slate-50 px-3 py-1 text-[10px] text-slate-400 flex justify-between rounded-b-lg">
        <span>Match #{match.id}</span>
        <span>{match.status}</span>
      </div>
    </div>
  )
}

const BracketView = ({ matches, currentMatchIndex, onRemovePlayer }: BracketViewProps) => {
  if (!matches || matches.length === 0) return null

  // Calculate total scores
  const totalScores = useMemo(() => {
    const scores: Record<string, number> = {}
    matches.forEach(m => {
      if (m.playerA?.alias && m.scoreA) {
        scores[m.playerA.alias] = (scores[m.playerA.alias] || 0) + m.scoreA
      }
      if (m.playerB?.alias && m.scoreB) {
        scores[m.playerB.alias] = (scores[m.playerB.alias] || 0) + m.scoreB
      }
    })
    return scores
  }, [matches])

  // Group matches by round
  const roundsMap: Record<number, typeof matches> = {}
  matches.forEach((m) => {
    const r = m.round ?? 0
    if (!roundsMap[r]) roundsMap[r] = []
    roundsMap[r].push(m)
  })

  const rounds = Object.keys(roundsMap)
    .map((k) => parseInt(k, 10))
    .sort((a, b) => a - b)

  const CARD_HEIGHT = 96 // h-24 = 96px
  const BASE_GAP = 32 // gap-8 = 32px

  return (
    <div className="mt-6 overflow-x-auto pb-8">
      <div className="flex min-w-max">
        {rounds.map((roundNum, roundIdx) => {
          const roundMatches = roundsMap[roundNum]
          
          // Calculate layout metrics for this round
          // Gap between matches in this round
          const gap = CARD_HEIGHT * (Math.pow(2, roundIdx) - 1) + BASE_GAP * Math.pow(2, roundIdx)
          
          // Top offset to align the first match with the center of the previous round's pair
          let offset = 0
          for (let i = 0; i < roundIdx; i++) {
             const prevGap = CARD_HEIGHT * (Math.pow(2, i) - 1) + BASE_GAP * Math.pow(2, i)
             offset += (CARD_HEIGHT + prevGap) / 2
          }

          return (
            <div key={roundNum} className="flex">
              {/* Round Column */}
              <div 
                className="flex flex-col px-4 relative"
                style={{ rowGap: `${gap}px`, paddingTop: `${offset}px` }}
              >
                <div className="absolute top-0 left-0 w-full text-center text-xs font-bold uppercase tracking-wider text-slate-400 -mt-6">
                  {roundNum === rounds[rounds.length - 1] ? 'Finals' : `Round ${roundNum}`}
                </div>
                
                {roundMatches.map((m) => {
                  const idx = matches.findIndex((mm) => mm.id === m.id)
                  const isCurrent = idx === currentMatchIndex
                  
                  // Connector metrics
                  const verticalArmLength = (CARD_HEIGHT + gap) / 2
                  
                  return (
                    <div key={m.id} className="relative flex items-center h-24">
                      <MatchCard 
                        match={m} 
                        isCurrent={isCurrent} 
                        totalScores={totalScores}
                        onRemovePlayer={onRemovePlayer}
                      />

                      {/* Connectors to next round */}
                      {roundIdx < rounds.length - 1 && (
                        <>
                            {/* Horizontal line out */}
                            <div className="absolute -right-8 w-8 h-0.5 bg-slate-300 top-1/2" />
                            
                            {/* Vertical line */}
                            <div 
                                className={`absolute -right-8 w-0.5 bg-slate-300 ${
                                    roundMatches.indexOf(m) % 2 === 0 
                                        ? 'top-1/2' // Even: goes down
                                        : 'bottom-1/2' // Odd: goes up
                                }`}
                                style={{
                                    height: `${verticalArmLength}px`
                                }}
                            />
                        </>
                      )}
                      
                      {/* Connector from previous round (Horizontal in) */}
                      {roundIdx > 0 && (
                        <div className="absolute -left-8 w-8 h-0.5 bg-slate-300 top-1/2" />
                      )}
                    </div>
                  )
                })}
              </div>
              
              {/* Spacer Column */}
              <div className="w-16" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default BracketView
