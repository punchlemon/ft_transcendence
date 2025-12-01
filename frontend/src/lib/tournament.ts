export interface MatchQueueItem {
  id: string
  players: [string, string | null]
  participantIds?: [number, number | null]
}

const MATCH_PREFIX = 'match-'

export const normalizeAlias = (alias: string): string => alias.trim().replace(/\s+/g, ' ')

export const aliasExists = (players: string[], candidate: string): boolean => {
  const normalizedCandidate = normalizeAlias(candidate).toLowerCase()
  return players.some((entry) => normalizeAlias(entry).toLowerCase() === normalizedCandidate)
}

export const buildMatchQueue = (players: string[]): MatchQueueItem[] => {
  const normalizedPlayers: string[] = []
  const seen = new Set<string>()

  players.forEach((player) => {
    const normalized = normalizeAlias(player)
    if (!normalized) {
      return
    }
    const key = normalized.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      normalizedPlayers.push(normalized)
    }
  })

  const queue: MatchQueueItem[] = []
  for (let index = 0; index < normalizedPlayers.length; index += 2) {
    queue.push({
      id: `${MATCH_PREFIX}${queue.length + 1}`,
      players: [normalizedPlayers[index], normalizedPlayers[index + 1] ?? null]
    })
  }

  return queue
}

export const findNextMatch = (queue: MatchQueueItem[], currentIndex: number): MatchQueueItem | null => {
  if (!queue.length || currentIndex < 0 || currentIndex >= queue.length) {
    return null
  }
  return queue[currentIndex]
}

export const advanceToNextMatch = (queue: MatchQueueItem[], currentIndex: number): number => {
  if (!queue.length) {
    return -1
  }
  const nextIndex = currentIndex + 1
  return nextIndex < queue.length ? nextIndex : -1
}

// Helper to generate seed indices (same as backend)
const getSeededIndices = (n: number): number[] => {
  if (n === 0) return []
  let size = 1
  while (size < n) size *= 2

  let seeds = [0]
  let currentSize = 1
  while (currentSize < size) {
    const nextSeeds = []
    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i]
      nextSeeds.push(seed)
      nextSeeds.push((currentSize * 2) - 1 - seed)
    }
    seeds = nextSeeds
    currentSize *= 2
  }
  return seeds.filter(s => s < n)
}

// Generate preview matches for BracketView
export const generatePreviewMatches = (players: string[]) => {
  if (players.length < 2) return []

  // 1. Pad with Byes to power of 2
  let size = 1
  while (size < players.length) size *= 2
  
  const paddedPlayers: (string | null)[] = [...players]
  while (paddedPlayers.length < size) {
    paddedPlayers.push(null)
  }

  // 2. Apply seeding
  // Backend logic: getSeededPlayerList distributes nulls (Byes) to the lowest seeds.
  // The backend implementation of getSeededPlayerList takes the padded array and reorders it.
  // Let's replicate that.
  
  // Re-implement getSeededPlayerList logic locally
  const seeds = getSeededIndices(size)
  const seededPlayers = seeds.map(i => paddedPlayers[i])

  // 3. Create Round 1 matches
  const matches = []
  let matchIdCounter = 1

  // Round 1
  const round1Matches = []
  for (let i = 0; i < seededPlayers.length; i += 2) {
    const p1 = seededPlayers[i]
    const p2 = seededPlayers[i+1]
    
    round1Matches.push({
      id: matchIdCounter++,
      round: 1,
      status: 'PENDING',
      scheduledAt: null,
      playerA: p1 ? { participantId: -1, alias: p1 } : null,
      playerB: p2 ? { participantId: -1, alias: p2 } : null,
      winnerId: null
    })
  }
  matches.push(...round1Matches)

  // Generate subsequent rounds (empty placeholders)
  let currentRoundMatches = round1Matches
  let round = 2
  while (currentRoundMatches.length > 1) {
    const nextRoundMatches = []
    for (let i = 0; i < currentRoundMatches.length; i += 2) {
      nextRoundMatches.push({
        id: matchIdCounter++,
        round: round,
        status: 'PENDING',
        scheduledAt: null,
        playerA: null, // TBD
        playerB: null, // TBD
        winnerId: null
      })
    }
    matches.push(...nextRoundMatches)
    currentRoundMatches = nextRoundMatches
    round++
  }

  return matches
}
