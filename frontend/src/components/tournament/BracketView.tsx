import type { TournamentDetail } from '../../lib/api'
import { MatchCard } from './MatchCard'

type BracketViewProps = {
  matches: TournamentDetail['matches']
  currentMatchIndex: number
  onRemovePlayer?: (alias: string) => void
  currentUserAlias?: string
}

const BracketView = ({ matches, onRemovePlayer, currentUserAlias }: BracketViewProps) => {
  if (!matches || matches.length === 0) return null

  // Group by round
  const roundsMap: Record<number, typeof matches> = {}
  matches.forEach((m) => {
    const r = m.round ?? 0
    if (!roundsMap[r]) roundsMap[r] = []
    roundsMap[r].push(m)
  })

  const rounds = Object.keys(roundsMap)
    .map((k) => parseInt(k, 10))
    .sort((a, b) => b - a) // Sort descending (Root to Leaves) for correct z-index stacking

  // Sort matches within rounds by ID to ensure correct order
  rounds.forEach(r => {
    roundsMap[r].sort((a, b) => a.id - b.id)
  })

  // Layout Constants
  const PLAYER_WIDTH = 100
  const BASE_GAP = 20 // Gap between players in Round 1
  const MATCH_MARGIN = 40 // Gap between matches in Round 1
  
  const D0 = 2 * PLAYER_WIDTH + BASE_GAP + MATCH_MARGIN

  const getPlayerGap = (roundIdx: number) => {
    // roundIdx is now inverted (0 is Root, N is Leaves)
    // We need the original round index (0-based from leaves)
    // rounds is [3, 2, 1]. roundIdx 0 -> Round 3.
    // Original logic assumed roundIdx 0 -> Round 1.
    
    // Let's calculate "height" from bottom.
    // rounds[roundIdx] is the round number (e.g. 3).
    // Assuming Round 1 is bottom.
    const roundNum = rounds[roundIdx]
    const heightFromBottom = roundNum - 1 // 0 for Round 1
    
    if (heightFromBottom === 0) return BASE_GAP
    return D0 * Math.pow(2, heightFromBottom - 1) - PLAYER_WIDTH
  }

  return (
    <div className="mt-1 flex flex-col items-center gap-0 overflow-x-auto pb-2 pt-4">
      {rounds.map((roundNum, roundIdx) => {
        const roundMatches = roundsMap[roundNum]
        const heightFromBottom = roundNum - 1
        const playerGap = getPlayerGap(roundIdx)
        
        const matchMargin = heightFromBottom === 0 
            ? MATCH_MARGIN 
            : (D0 * Math.pow(2, heightFromBottom) - (2 * PLAYER_WIDTH + playerGap))

        return (
          <div key={roundNum} className="flex justify-center" style={{ gap: `${matchMargin}px` }}>
            {roundMatches.map((match) => (
              <MatchCard 
                key={match.id}
                match={match}
                onRemovePlayer={onRemovePlayer}
                playerGap={playerGap}
                playerWidth={PLAYER_WIDTH}
                currentUserAlias={currentUserAlias}
                isLeaf={roundNum === 1}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default BracketView
