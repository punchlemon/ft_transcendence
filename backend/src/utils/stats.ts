import type { PrismaClient } from '@prisma/client'

/**
 * User statistics calculation utilities
 * Provides consistent statistics across all endpoints
 */

export interface UserMatchStats {
  wins: number
  losses: number
  matchesPlayed: number
  winRate: number
}

/**
 * Calculate user statistics from matches
 * This is the source of truth for all user statistics
 */
export async function calculateUserStats(
  prisma: PrismaClient,
  userId: number
): Promise<UserMatchStats> {
  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { playerAId: userId },
        { playerBId: userId }
      ],
      status: 'FINISHED'
    },
    select: {
      playerAId: true,
      playerBId: true,
      winnerId: true
    }
  })

  let wins = 0
  let losses = 0
  const matchesPlayed = matches.length

  for (const match of matches) {
    if (match.winnerId === userId) {
      wins++
    } else {
      // If winnerId is not this user (including null for AI/Guest wins), it's a loss
      losses++
    }
  }

  const winRate = matchesPlayed > 0 ? wins / matchesPlayed : 0

  return {
    wins,
    losses,
    matchesPlayed,
    winRate
  }
}

/**
 * Calculate statistics for multiple users in batch
 * More efficient than calling calculateUserStats multiple times
 */
export async function calculateMultipleUserStats(
  prisma: PrismaClient,
  userIds: number[]
): Promise<Map<number, UserMatchStats>> {
  if (userIds.length === 0) {
    return new Map()
  }

  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { playerAId: { in: userIds } },
        { playerBId: { in: userIds } }
      ],
      status: 'FINISHED'
    },
    select: {
      playerAId: true,
      playerBId: true,
      winnerId: true
    }
  })

  // Initialize stats for all users
  const statsMap = new Map<number, UserMatchStats>()
  for (const userId of userIds) {
    statsMap.set(userId, {
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      winRate: 0
    })
  }

  // Count wins and matches for each user
  for (const match of matches) {
    if (match.playerAId && statsMap.has(match.playerAId)) {
      const stats = statsMap.get(match.playerAId)!
      stats.matchesPlayed++
      if (match.winnerId === match.playerAId) {
        stats.wins++
      } else {
        stats.losses++
      }
    }

    if (match.playerBId && statsMap.has(match.playerBId)) {
      const stats = statsMap.get(match.playerBId)!
      stats.matchesPlayed++
      if (match.winnerId === match.playerBId) {
        stats.wins++
      } else {
        stats.losses++
      }
    }
  }

  // Calculate win rates
  for (const stats of statsMap.values()) {
    stats.winRate = stats.matchesPlayed > 0 ? stats.wins / stats.matchesPlayed : 0
  }

  return statsMap
}
