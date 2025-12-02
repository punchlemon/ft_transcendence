import { useMemo } from 'react'
import { TournamentDetail } from '../../lib/api'
import Button from '../ui/Button'

type TournamentRankingProps = {
  tournament: TournamentDetail
  onClose: () => void
}

type RankedParticipant = {
  alias: string
  rank: number
  totalScore: number
  isWinner: boolean
}

const TournamentRanking = ({ tournament, onClose }: TournamentRankingProps) => {
  const ranking = useMemo(() => {
    const participants = tournament.participants
    const matches = tournament.matches

    // Map participant ID to stats
    const stats = new Map<number, { alias: string; maxRound: number; totalScore: number; isWinner: boolean }>()

    participants.forEach((p) => {
      stats.set(p.id, { alias: p.alias, maxRound: 0, totalScore: 0, isWinner: false })
    })

    // Process matches to gather stats
    matches.forEach((m) => {
      if (m.status !== 'FINISHED') return

      // Update scores
      if (m.playerA && m.scoreA !== undefined && m.scoreA !== null) {
        const s = stats.get(m.playerA.participantId)
        if (s) s.totalScore += m.scoreA
      }
      if (m.playerB && m.scoreB !== undefined && m.scoreB !== null) {
        const s = stats.get(m.playerB.participantId)
        if (s) s.totalScore += m.scoreB
      }

      // Update max round
      if (m.playerA) {
        const s = stats.get(m.playerA.participantId)
        if (s && m.round > s.maxRound) s.maxRound = m.round
      }
      if (m.playerB) {
        const s = stats.get(m.playerB.participantId)
        if (s && m.round > s.maxRound) s.maxRound = m.round
      }
    })

    // Determine winner from tournament object if available
    const maxRound = Math.max(...matches.map(m => m.round))
    const finalMatch = matches.find(m => m.round === maxRound)
    
    if (finalMatch && finalMatch.winnerId) {
        const s = stats.get(finalMatch.winnerId)
        if (s) s.isWinner = true
    }

    // Convert to array, filter out placeholders, and sort
    const rankedList = Array.from(stats.values())
      .filter(p => p.alias !== 'TBD') // Filter out placeholders
      .sort((a, b) => {
        if (a.isWinner) return -1
        if (b.isWinner) return 1
        
        // Sort by max round (descending)
        if (b.maxRound !== a.maxRound) return b.maxRound - a.maxRound
        
        // Sort by total score (descending)
        return b.totalScore - a.totalScore
      })

    // Assign ranks (handling ties)
    const result: RankedParticipant[] = []
    let currentRank = 1
    for (let i = 0; i < rankedList.length; i++) {
      const p = rankedList[i]
      // If not first, check if tied with previous
      if (i > 0) {
        const prev = rankedList[i - 1]
        const isTied = !prev.isWinner && !p.isWinner && 
                       prev.maxRound === p.maxRound && 
                       prev.totalScore === p.totalScore
        
        if (isTied) {
            // Keep same rank
        } else {
            currentRank = i + 1
        }
      }
      result.push({ ...p, rank: currentRank })
    }

    return result
  }, [tournament])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-slate-900">🏆 Tournament Results</h2>
          <p className="text-slate-500 mt-2">{tournament.name}</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Rank</th>
                <th className="px-6 py-3 font-medium">Player</th>
                <th className="px-6 py-3 font-medium text-right">Total Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {ranking.map((p, i) => (
                <tr key={i} className={p.rank === 1 ? 'bg-yellow-50/50' : ''}>
                  <td className="px-6 py-4 font-bold text-slate-700">
                    {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {p.alias}
                    {p.isWinner && <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">Winner</span>}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-600">
                    {p.totalScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex justify-center">
          <Button onClick={onClose} className="min-w-[200px] py-3 text-lg">
            Return to Home
          </Button>
        </div>
      </div>
    </div>
  )
}

export default TournamentRanking
