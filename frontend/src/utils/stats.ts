/**
 * Shared statistics calculation utilities
 * Used across Profile and Users pages to ensure consistency
 */

export interface UserStats {
  wins: number
  losses: number
  totalMatches: number
  winRate: number
}

/**
 * Calculate win rate percentage from wins and total matches
 * Returns integer percentage (0-100) with Math.round()
 */
export function calculateWinRate(wins: number, totalMatches: number): number {
  return totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0
}

/**
 * Format win rate for display (integer percentage with % symbol)
 */
export function formatWinRate(winRate: number): string {
  return `${winRate}%`
}

/**
 * Format games count for display (number only, no unit)
 */
export function formatGamesCount(count: number): string {
  return String(count)
}
