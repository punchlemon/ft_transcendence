import { prisma } from '../utils/prisma'
import { notificationService } from '../services/notification'

type MatchResult = {
  winner: 'p1' | 'p2'
  score: { p1: number; p2: number }
  p1Id?: number
  p2Id?: number
  p1Alias?: string
  p2Alias?: string
  startedAt?: Date
}

export async function persistMatchResult(result: MatchResult) {
  try {
    const winnerId = result.winner === 'p1' ? result.p1Id : result.p2Id
    const loserId = result.winner === 'p1' ? result.p2Id : result.p1Id

    let createdMatchId: number | null = null
    let createdMatchSummary: any = null
    await prisma.$transaction(async (tx) => {
      const created = await tx.match.create({
        data: {
          playerAId: result.p1Id ?? null,
          playerBId: result.p2Id ?? null,
          playerAAlias: result.p1Alias ?? null,
          playerBAlias: result.p2Alias ?? null,
          winnerId: winnerId ?? null,
          mode: 'STANDARD',
          status: 'FINISHED',
          startedAt: result.startedAt || new Date(),
          endedAt: new Date(),
          results: {
            create: [
              { userId: result.p1Id ?? null, outcome: result.winner === 'p1' ? 'WIN' : 'LOSS', score: result.score.p1 },
              { userId: result.p2Id ?? null, outcome: result.winner === 'p2' ? 'WIN' : 'LOSS', score: result.score.p2 }
            ]
          }
        }
      })
      createdMatchId = created.id
      createdMatchSummary = {
        id: created.id,
        playerAId: created.playerAId,
        playerBId: created.playerBId,
        playerAAlias: created.playerAAlias,
        playerBAlias: created.playerBAlias,
        winnerId: created.winnerId,
        startedAt: created.startedAt,
        endedAt: created.endedAt,
        scoreA: result.score.p1,
        scoreB: result.score.p2,
        mode: 'standard'
      }

      // Update Stats only for real users (userId present)
      if (typeof winnerId === 'number') {
        await tx.userStats.upsert({
          where: { userId: winnerId },
          create: { userId: winnerId, wins: 1, matchesPlayed: 1, pointsScored: result.score[result.winner], pointsAgainst: result.score[result.winner === 'p1' ? 'p2' : 'p1'] },
          update: {
            wins: { increment: 1 },
            matchesPlayed: { increment: 1 },
            pointsScored: { increment: result.score[result.winner] },
            pointsAgainst: { increment: result.score[result.winner === 'p1' ? 'p2' : 'p1'] }
          }
        })
      }

      if (typeof loserId === 'number') {
        await tx.userStats.upsert({
          where: { userId: loserId },
          create: { userId: loserId, losses: 1, matchesPlayed: 1, pointsScored: result.score[result.winner === 'p1' ? 'p2' : 'p1'], pointsAgainst: result.score[result.winner] },
          update: {
            losses: { increment: 1 },
            matchesPlayed: { increment: 1 },
            pointsScored: { increment: result.score[result.winner === 'p1' ? 'p2' : 'p1'] },
            pointsAgainst: { increment: result.score[result.winner] }
          }
        })
      }
    })

    try {
      const participantIds = [result.p1Id, result.p2Id].filter((v) => typeof v === 'number') as number[]
      for (const uid of participantIds) {
        try {
          notificationService.emit('match_history', { userId: uid, match: createdMatchSummary })
        } catch (e) {
          console.error('[matchPersistence] Failed to emit match_history for user', uid, e)
        }
      }
    } catch (e) {
      console.error('[matchPersistence] Error emitting match_history updates', e)
    }

    try {
      notificationService.emit('match_history_public', { match: createdMatchSummary })
    } catch (e) {
      console.error('[matchPersistence] Failed to emit match_history_public', e)
    }
  } catch (e) {
    console.error('[matchPersistence] Failed to save match result', e)
  }
}

export default persistMatchResult
