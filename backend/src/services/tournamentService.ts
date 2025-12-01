import { prisma } from '../utils/prisma';
import { Prisma } from '@prisma/client';

export const tournamentService = {
  async handleMatchResult(matchId: number, winnerUserId: number, scoreA?: number, scoreB?: number) {
    await prisma.$transaction(async (tx) => {
      // 1. Get the match with participants
      const match = await tx.tournamentMatch.findUnique({
        where: { id: matchId },
        include: {
          playerA: true,
          playerB: true,
          tournament: true
        }
      });

      if (!match) {
        throw new Error('Match not found');
      }

      if (match.status === 'FINISHED') {
        // Already finished, maybe just return or throw
        return;
      }

      // Lock the tournament to prevent race conditions
      await tx.tournament.update({
        where: { id: match.tournamentId },
        data: { updatedAt: new Date() }
      });

      // 2. Identify the winner participant
      let winnerParticipantId: number;
      if (match.playerA.userId === winnerUserId || match.playerA.id === winnerUserId) {
        winnerParticipantId = match.playerA.id;
      } else if (match.playerB && (match.playerB.userId === winnerUserId || match.playerB.id === winnerUserId)) {
        winnerParticipantId = match.playerB.id;
      } else {
        throw new Error('Winner is not a participant of this match');
      }

      // 3. Update match status and winner
      await tx.tournamentMatch.update({
        where: { id: matchId },
        data: {
          status: 'FINISHED',
          winnerId: winnerParticipantId,
          scoreA: scoreA,
          scoreB: scoreB
        }
      });

      // 4. Check if all matches in the current round are finished
      const currentRound = match.round;
      const tournamentId = match.tournamentId;

      const unfinishedMatches = await tx.tournamentMatch.count({
        where: {
          tournamentId,
          round: currentRound,
          status: { not: 'FINISHED' }
        }
      });

      if (unfinishedMatches > 0) {
        return; // Round not finished yet
      }

      // 5. Round finished, proceed to next round
      await this.proceedToNextRound(tournamentId, currentRound, tx);
    });
  },

  async proceedToNextRound(tournamentId: number, currentRound: number, tx: Prisma.TransactionClient) {
    // Generate next round matches
    const nextRound = currentRound + 1;

    // Check if next round matches already exist to prevent duplicates
    const existingNextRoundMatches = await tx.tournamentMatch.count({
      where: {
        tournamentId,
        round: nextRound
      }
    });

    if (existingNextRoundMatches > 0) {
      return;
    }

    // Get all matches from the current round to determine winners
    const matches = await tx.tournamentMatch.findMany({
      where: {
        tournamentId,
        round: currentRound
      },
      orderBy: {
        id: 'asc' // Ensure consistent ordering for pairing
      },
      include: {
        winner: true
      }
    });

    const winners = [];
    for (const m of matches) {
      if (m.winner) {
        winners.push(m.winner);
      }
    }

    if (winners.length === 0) {
        return;
    }

    if (winners.length === 1) {
      // Tournament Completed
      const finalWinner = winners[0];
      if (finalWinner && finalWinner.userId) {
          await tx.tournament.update({
            where: { id: tournamentId },
            data: {
              status: 'COMPLETED',
              winnerId: finalWinner.userId
            }
          });
      }
      return;
    }

    const nextRoundMatches = [];

    for (let i = 0; i < winners.length; i += 2) {
      const playerA = winners[i];
      const playerB = winners[i+1]; // Can be undefined if odd number of winners

      if (playerB) {
        nextRoundMatches.push({
          tournamentId,
          round: nextRound,
          playerAId: playerA.id,
          playerBId: playerB.id,
          status: 'PENDING'
        });
      } else {
        // Odd number of winners, last one gets a Bye
        nextRoundMatches.push({
          tournamentId,
          round: nextRound,
          playerAId: playerA.id,
          playerBId: null, // Bye
          status: 'FINISHED',
          winnerId: playerA.id
        });
      }
    }
    
    if (nextRoundMatches.length > 0) {
      await tx.tournamentMatch.createMany({
        data: nextRoundMatches
      });
    }
  },

  padWithBye<T>(participants: T[]): (T | null)[] {
    const n = participants.length;
    if (n === 0) return [];

    let size = 1;
    while (size < n) {
      size *= 2;
    }

    const padded: (T | null)[] = [...participants];
    while (padded.length < size) {
      padded.push(null);
    }
    
    // Now we have [P1, P2, ..., Pn, null, null, ...]
    // We want to distribute nulls to the lowest seeds.
    // getSeededPlayerList does exactly that if we pass the padded array.
    // It puts index 0 (P1) vs index 7 (null/Bye) for size 8.
    
    return this.getSeededPlayerList(padded);
  },

  getSeededPlayerList<T>(participants: T[]): T[] {
    const n = participants.length;
    if (n === 0) return [];

    // Find next power of 2
    let size = 1;
    while (size < n) {
      size *= 2;
    }

    // Generate seed indices
    let seeds = [0];
    let currentSize = 1;
    while (currentSize < size) {
      const nextSeeds = [];
      for (let i = 0; i < seeds.length; i++) {
        const seed = seeds[i];
        nextSeeds.push(seed);
        nextSeeds.push((currentSize * 2) - 1 - seed);
      }
      seeds = nextSeeds;
      currentSize *= 2;
    }

    // Map seeds to participants
    const result = [];
    for (const seedIndex of seeds) {
      if (seedIndex < n) {
        result.push(participants[seedIndex]);
      }
    }
    return result;
  }
};
