import { GameEngine } from './engine';
import { notificationService } from '../services/notification';
import { WebSocket } from 'ws';
import { AIDifficulty } from './ai';
import { prisma } from '../utils/prisma';

export class GameManager {
  private static instance: GameManager;
  private games: Map<string, GameEngine> = new Map();
  // Track session IDs that have been removed/expired so they cannot be
  // re-created or re-joined using the same ID. This prevents recreated
  // rooms from appearing after a room was intentionally destroyed.
  private expiredSessions: Set<string> = new Set();

  private constructor() {}

  static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  createGame(sessionId: string): GameEngine {
    try {
      try { console.info(`[game-manager] createGame called for ${sessionId}`) } catch (e) {}
      if (this.expiredSessions.has(sessionId)) {
        try { console.info(`[game-manager] createGame refused: session expired ${sessionId}`) } catch (e) {}
        throw new Error('SessionExpired');
      }
    } catch (e) {
      // rethrow after logging
      throw e;
    }
    if (this.games.has(sessionId)) {
      return this.games.get(sessionId)!;
    }
    const game = new GameEngine(
      sessionId,
      undefined,
      (result) => {
        this.handleGameEnd(sessionId, result);
      },
      // onEmpty: remove the game from the registry when no players remain
      () => {
        // When a game becomes empty, remove it and mark the session as
        // expired so that it cannot be re-joined or re-created with the
        // same sessionId. Also emit a lightweight event so chat WS clients
        // can update invite UI (join buttons) in real time.
        try {
          // Diagnostic logging to help debug cases where sessions appear
          // to remain joinable after a creator leaves.
          try {
            console.info(`[game-manager] Marking session expired: ${sessionId}`);
          } catch (e) {
            // ignore logging failures
          }

          this.expiredSessions.add(sessionId);

          // Emit an event for other services (chat WS) to broadcast.
          try {
            notificationService.emit('session_expired', { sessionId });
          } catch (e) {
            // swallow
          }
        } catch (e) {
          // swallow
        }

        try {
          this.games.delete(sessionId);
        } catch (e) {
          // swallow delete errors
        }
      }
    );
    this.games.set(sessionId, game);
    return game;
  }

  isExpired(sessionId: string) {
    try { console.info(`[game-manager] isExpired? ${sessionId} => ${this.expiredSessions.has(sessionId)}`) } catch (e) {}
    return this.expiredSessions.has(sessionId);
  }

  private async handleGameEnd(sessionId: string, result: { winner: 'p1' | 'p2'; score: { p1: number; p2: number }; p1Id?: number; p2Id?: number; p1Alias?: string; p2Alias?: string; startedAt?: Date }) {
    this.games.delete(sessionId);

    // Require at least one identifier (userId or alias) for each side to consider persisting.
    const hasP1 = typeof result.p1Id === 'number' || !!result.p1Alias
    const hasP2 = typeof result.p2Id === 'number' || !!result.p2Alias
    if (!hasP1 && !hasP2) {
      // Nothing meaningful to persist
      return;
    }

    // Defensive: if both player IDs exist and are identical, skip persisting the match.
    if (result.p1Id && result.p2Id && result.p1Id === result.p2Id) {
      return;
    }

    // Check if this is a tournament match (format: local-match-{id})
    const tournamentMatchMatch = sessionId.match(/^local-match-(\d+)$/);
    if (tournamentMatchMatch) {
      const tournamentMatchId = parseInt(tournamentMatchMatch[1], 10);
      await this.handleTournamentMatchEnd(tournamentMatchId, result);
    }

    try {
      const winnerId = result.winner === 'p1' ? result.p1Id : result.p2Id;
      const loserId = result.winner === 'p1' ? result.p2Id : result.p1Id;

      await prisma.$transaction(async (tx) => {
        // Create Match with optional aliases and optional user IDs
        await tx.match.create({
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
        });

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
          });
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
          });
        }
      });
    } catch (e) {
      console.error('Failed to save match result', e);
    }
  }

  createAIGame(difficulty: AIDifficulty = 'NORMAL'): { game: GameEngine; sessionId: string } {
    const sessionId = `game_ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const game = this.createGame(sessionId);
    game.addAIPlayer(difficulty);
    return { game, sessionId };
  }

  getGame(sessionId: string): GameEngine | undefined {
    return this.games.get(sessionId);
  }

  removeGame(sessionId: string) {
    const game = this.games.get(sessionId);
    if (game) {
      game.stop();
      this.games.delete(sessionId);
    }
  }

  // Temporary matchmaking helper
  findOrCreatePublicGame(): { game: GameEngine; sessionId: string } {
    // Find a game waiting for players
    for (const [id, game] of this.games.entries()) {
      if (game.isWaitingForPlayers()) {
        return { game, sessionId: id };
      }
    }
    // Create new
    const sessionId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return { game: this.createGame(sessionId), sessionId };
  }

  createPrivateGame(creatorUserId?: number): { game: GameEngine; sessionId: string } {
    const sessionId = `game_private_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const game = this.createGame(sessionId);
    if (typeof creatorUserId === 'number') {
      game.creatorUserId = creatorUserId;
    }
    // Mark as a private session so the engine can apply private-room rules
    // (for example: destroy the session when the creator leaves).
    game.isPrivate = true;
    return { game, sessionId };
  }

  createLocalGame(): { game: GameEngine; sessionId: string } {
    const sessionId = `game_local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const game = this.createGame(sessionId);
    // Mark local/demo sessions so engine can treat them differently from
    // online public matches.
    game.isLocal = true;
    return { game, sessionId };
  }

  private async handleTournamentMatchEnd(matchId: number, result: { winner: 'p1' | 'p2' }) {
    try {
      const match = await prisma.tournamentMatch.findUnique({
        where: { id: matchId }
      });
      if (!match) return;

      const winnerParticipantId = result.winner === 'p1' ? match.playerAId : match.playerBId;

      await prisma.tournamentMatch.update({
        where: { id: matchId },
        data: {
          winnerId: winnerParticipantId,
          status: 'COMPLETED'
        }
      });
    } catch (e) {
      console.error('Failed to update tournament match', e);
    }
  }
}
