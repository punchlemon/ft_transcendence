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
  onRemovePlayer,
  compact = false
}: { 
  match: TournamentDetail['matches'][0], 
  isCurrent: boolean,
  totalScores: Record<string, number>,
  onRemovePlayer?: (alias: string) => void,
  compact?: boolean
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
      <div className={`flex items-center justify-between px-3 ${compact ? 'py-1' : 'py-2'} ${isWinner ? 'bg-yellow-50/50' : ''}`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`truncate text-sm font-medium ${isWinner ? 'text-slate-900' : 'text-slate-600'} ${isPlaceholder ? 'text-slate-400 italic' : ''}`}>
            {player?.alias ?? (isPlaceholder ? 'Bye' : 'TBD')}
          </span>
          {player && !isPlaceholder && (
            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 rounded-full" title="Total Score">
              {totalScore}
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
      className={`relative w-64 ${compact ? 'h-20' : 'h-24'} rounded-lg border bg-white shadow-sm transition-all flex flex-col justify-between ${
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
      {!compact && (
        <div className="bg-slate-50 px-3 py-1 text-[10px] text-slate-400 flex justify-between rounded-b-lg">
          <span>Match #{match.id}</span>
          <span>{match.status}</span>
        </div>
      )}
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

  // Vertical Layout Constants
  const CARD_WIDTH = 256 // w-64 = 256px
  const CARD_HEIGHT = 80 // Reduced height for compactness
  const GAP_X = 32 // Horizontal gap between matches in the same round

  return (
    <div className="mt-4 overflow-x-auto pb-4 flex justify-center">
      <div className="flex flex-col items-center gap-12">
        {rounds.map((roundNum, roundIdx) => {
          const roundMatches = roundsMap[roundNum]
          
          // Calculate gap between matches in this round based on tree depth
          // Round 1 (idx 0): Gap is small
          // Round 2 (idx 1): Gap is larger to span across two Round 1 matches
          // Formula: Gap = (CardWidth + BaseGap) * (2^roundIdx) - CardWidth
          // Actually, simpler: Just use flex gap and let the tree structure emerge naturally?
          // No, we need precise alignment for connectors.
          
          // Let's use a grid-like approach or calculated margins.
          // In a vertical tree (Top-Down):
          // Round 1: [M1]   [M2]   [M3]   [M4]
          //            \     /       \     /
          // Round 2:     [M5]         [M6]
          //                \           /
          // Round 3:           [M7]
          
          // The distance between centers of matches in Round R is double the distance in Round R-1.
          
          return (
            <div key={roundNum} className="relative flex justify-center">
               {/* Round Label */}
               <div className="absolute -left-24 top-1/2 -translate-y-1/2 text-xs font-bold uppercase tracking-wider text-slate-400 w-20 text-right">
                  {roundNum === rounds[rounds.length - 1] ? 'Finals' : `Round ${roundNum}`}
               </div>

              <div className="flex" style={{ gap: `${GAP_X * Math.pow(2, roundIdx) + CARD_WIDTH * (Math.pow(2, roundIdx) - 1)}px` }}>
                {roundMatches.map((m) => {
                  const idx = matches.findIndex((mm) => mm.id === m.id)
                  const isCurrent = idx === currentMatchIndex
                  
                  return (
                    <div key={m.id} className="relative flex flex-col items-center">
                      {/* Connector from previous round (Top) */}
                      {roundIdx > 0 && (
                        <div className="absolute -top-6 h-6 w-0.5 bg-slate-300" />
                      )}

                      <MatchCard 
                        match={m} 
                        isCurrent={isCurrent} 
                        totalScores={totalScores}
                        onRemovePlayer={onRemovePlayer}
                        compact={true}
                      />

                      {/* Connectors to next round (Bottom) */}
                      {roundIdx < rounds.length - 1 && (
                        <>
                            {/* Vertical line down */}
                            <div className="absolute -bottom-6 h-6 w-0.5 bg-slate-300" />
                            
                            {/* Horizontal bar connecting children */}
                            {/* This logic is tricky in a loop. 
                                Instead of drawing from parent down, let's draw from children up?
                                Or draw the "fork" here.
                                A match in Round 1 connects to a match in Round 2.
                                Actually, in a single elimination bracket:
                                Round 1 matches (0,1) -> Round 2 match 0.
                                So Round 1 matches need to draw lines to meet in the middle.
                            */}
                            <div 
                                className={`absolute -bottom-6 h-0.5 bg-slate-300 ${
                                    roundMatches.indexOf(m) % 2 === 0 
                                        ? 'left-1/2 w-[calc(50%+var(--gap-half))]' // Even: draw right
                                        : 'right-1/2 w-[calc(50%+var(--gap-half))]' // Odd: draw left
                                }`}
                                style={{
                                    // We need to calculate the width to reach the midpoint
                                    // Distance to neighbor center = CARD_WIDTH + CurrentGap
                                    // Line length = (Distance) / 2
                                    // CurrentGap = GAP_X * 2^roundIdx + CARD_WIDTH * (2^roundIdx - 1)
                                    // Wait, the gap logic above is for the container.
                                    // Let's simplify.
                                    // The gap between THIS match and its sibling is:
                                    // gap = GAP_X * 2^roundIdx + CARD_WIDTH * (2^roundIdx - 1)
                                    // Half distance = (CARD_WIDTH + gap) / 2
                                    // So the line should extend by (gap / 2) + (CARD_WIDTH / 2)? 
                                    // No, the line starts from center.
                                    // It needs to go to the midpoint between this and neighbor.
                                    // Midpoint is at (CARD_WIDTH/2 + gap/2) from center.
                                    width: `calc(50% + ${(GAP_X * Math.pow(2, roundIdx) + CARD_WIDTH * (Math.pow(2, roundIdx) - 1)) / 2}px + 1px)`
                                }}
                            />
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default BracketView
