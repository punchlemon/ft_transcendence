import type { TournamentDetail } from '../../lib/api'

type BracketViewProps = {
  matches: TournamentDetail['matches']
  currentMatchIndex: number
}

const BracketView = ({ matches, currentMatchIndex }: BracketViewProps) => {
  if (!matches || matches.length === 0) return null

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
    <div className="mt-6 overflow-auto">
      <div className="flex gap-6 items-start">
        {rounds.map((roundNum) => (
          <div key={roundNum} className="min-w-[200px]">
            <div className="mb-3 text-xs font-semibold uppercase text-slate-500">ラウンド {roundNum}</div>
            <div className="space-y-3">
              {roundsMap[roundNum].map((m, i) => {
                const idx = matches.findIndex((mm) => mm.id === m.id)
                const isCurrent = idx === currentMatchIndex
                const winnerId = m.winnerId
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      isCurrent ? 'border-brand bg-brand/5' : 'border-slate-200 bg-white'
                    }`}
                    aria-current={isCurrent ? 'true' : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className={`truncate ${m.playerA && winnerId === m.playerA.participantId ? 'font-bold text-green-700' : ''}`}>
                          {m.playerA?.alias ?? '---'}
                        </div>
                        <div className={`truncate text-xs text-slate-500 ${m.playerB && winnerId === m.playerB.participantId ? 'font-bold text-green-700' : ''}`}>
                          {m.playerB?.alias ?? 'シード'}
                        </div>
                      </div>
                      <div className="ml-3 text-xs text-slate-400">#{m.id}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default BracketView
