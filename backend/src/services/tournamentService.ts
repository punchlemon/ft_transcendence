import { prisma } from '../utils/prisma';
import { Prisma } from '@prisma/client';

export const tournamentService = {
  async handleMatchResult(matchId: number, winnerUserId: number, scoreA?: number, scoreB?: number) {
    // Prevent saving a match result without both scores provided
    if (typeof scoreA === 'undefined' || typeof scoreB === 'undefined') {
      throw new Error('SCORES_REQUIRED')
    }

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
        return;
      }

      // Lock the tournament
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

      // 4. Advance winner to next round
      await this.advanceWinner(match, winnerParticipantId, tx);
    });
  },

  async advanceWinner(match: any, winnerId: number, tx: Prisma.TransactionClient) {
    const tournamentId = match.tournamentId;
    const currentRound = match.round;

    // Get all matches in the current round to determine index
    const currentRoundMatches = await tx.tournamentMatch.findMany({
      where: { tournamentId, round: currentRound },
      orderBy: { id: 'asc' }
    });

    const matchIndex = currentRoundMatches.findIndex(m => m.id === match.id);
    if (matchIndex === -1) return;

    // Calculate next match index
    const nextMatchIndex = Math.floor(matchIndex / 2);
    const isTopPosition = matchIndex % 2 === 0;

    // Find the next round match
    const nextRoundMatches = await tx.tournamentMatch.findMany({
      where: { tournamentId, round: currentRound + 1 },
      orderBy: { id: 'asc' }
    });

    if (nextRoundMatches.length === 0) {
      // No next round matches -> Tournament Completed?
      if (currentRoundMatches.length === 1) {
         // Tournament Completed
         const winnerParticipant = await tx.tournamentParticipant.findUnique({ where: { id: winnerId } });
         if (winnerParticipant && winnerParticipant.userId) {
             await tx.tournament.update({
                 where: { id: tournamentId },
                 data: {
                     status: 'COMPLETED',
                     winnerId: winnerParticipant.userId
                 }
             });
         }
      }
      return;
    }

    const targetMatch = nextRoundMatches[nextMatchIndex];
    if (!targetMatch) {
        return;
    }

    // Update the target match
    const updateData: any = {};
    if (isTopPosition) {
        updateData.playerAId = winnerId;
    } else {
        updateData.playerBId = winnerId;
    }

    const updatedMatch = await tx.tournamentMatch.update({
        where: { id: targetMatch.id },
        data: updateData,
        include: { playerA: true, playerB: true }
    });

    // Check if we can start the next match
    const pA = updatedMatch.playerA;
    const pB = updatedMatch.playerB;

    const isPlaceholderA = pA?.inviteState === 'PLACEHOLDER';
    const isPlaceholderB = pB?.inviteState === 'PLACEHOLDER';

    if (pA && pB && !isPlaceholderA && !isPlaceholderB) {
        await tx.tournamentMatch.update({
            where: { id: targetMatch.id },
            data: { status: 'PENDING' }
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
