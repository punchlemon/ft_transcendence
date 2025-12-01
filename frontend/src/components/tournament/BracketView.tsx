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
      className={`relative w-64 rounded-lg border bg-white shadow-sm transition-all ${
        isCurrent ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200'
      }`}
    >
      <div className="divide-y divide-slate-100">
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
      <div className="bg-slate-50 px-3 py-1 text-[10px] text-slate-400 flex justify-between">
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

  return (
    <div className="mt-6 overflow-x-auto pb-8">
      <div className="flex min-w-max">
        {rounds.map((roundNum, roundIdx) => {
          const roundMatches = roundsMap[roundNum]
          // Sort matches by ID to ensure correct visual order (1 vs 8, 4 vs 5, etc.)
          // Assuming match IDs are generated in order of the bracket flow
          // Actually, for the tree to look right, we need to order them by their position in the bracket.
          // The backend generates matches in order.
          
          return (
            <div key={roundNum} className="flex">
              {/* Round Column */}
              <div className="flex flex-col justify-around gap-8 px-4">
                <div className="text-center text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {roundNum === rounds[rounds.length - 1] ? 'Finals' : `Round ${roundNum}`}
                </div>
                {roundMatches.map((m) => {
                  const idx = matches.findIndex((mm) => mm.id === m.id)
                  const isCurrent = idx === currentMatchIndex
                  return (
                    <div key={m.id} className="relative flex items-center">
                      {/* Connector to previous round (Left) */}
                      {roundIdx > 0 && (
                        <div className="absolute -left-4 w-4 border-b-2 border-slate-300" />
                      )}
                      
                      <MatchCard 
                        match={m} 
                        isCurrent={isCurrent} 
                        totalScores={totalScores}
                        onRemovePlayer={onRemovePlayer}
                      />

                      {/* Connector to next round (Right) */}
                      {roundIdx < rounds.length - 1 && (
                        <div 
                            className={`absolute -right-4 w-4 border-r-2 border-slate-300 ${
                                // Logic to determine if this match connects up or down
                                // This is tricky without knowing the exact tree structure index.
                                // Simple heuristic: Even index goes down, Odd index goes up?
                                // Matches are usually paired: (0,1) -> Next 0. (2,3) -> Next 1.
                                // So even index in the current round list connects to the "top" of the next match.
                                // Odd index connects to the "bottom".
                                roundMatches.indexOf(m) % 2 === 0 
                                    ? 'top-1/2 h-[calc(50%+2rem)] border-t-2 rounded-tr-lg translate-y-1/2' // Down
                                    : 'bottom-1/2 h-[calc(50%+2rem)] border-b-2 rounded-br-lg -translate-y-1/2' // Up
                            }`}
                            style={{
                                // Adjust height based on gap. 
                                // Since we use flex justify-around, the gap is dynamic.
                                // This CSS-only connector is fragile.
                                // A better way is to use a fixed grid or SVG.
                                // Let's try a simpler visual: just a line out.
                                // The curved connectors are hard with just flexbox.
                                // Let's stick to simple straight lines for now or improve if possible.
                                display: 'none' // Disabling complex connectors for now, will use simple lines
                            }}
                        />
                      )}
                      
                      {/* Simple Line Connector attempt */}
                      {roundIdx < rounds.length - 1 && (
                          <div className={`absolute -right-8 w-8 h-px bg-slate-300 top-1/2`} />
                      )}
                      
                      {/* Vertical Bracket Lines */}
                      {roundIdx < rounds.length - 1 && roundMatches.indexOf(m) % 2 === 0 && (
                          <div 
                            className="absolute -right-8 w-px bg-slate-300"
                            style={{
                                top: '50%',
                                height: '100%', // This assumes the next match is exactly centered below. 
                                // In flex justify-around, the distance between pair items depends on the container height.
                                // This is the hard part of CSS brackets.
                                // Let's try to rely on the fact that we have max 8 players.
                                // We can force a specific height.
                            }}
                          />
                      )}
                    </div>
                  )
                })}
              </div>
              
              {/* Spacer/Connector Column */}
              {roundIdx < rounds.length - 1 && (
                  <div className="w-8 flex flex-col justify-around relative">
                      {/* We can draw lines here if we knew positions */}
                  </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default BracketView
