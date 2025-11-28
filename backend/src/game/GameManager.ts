import { GameEngine } from './engine';
import { WebSocket } from 'ws';
import { AIDifficulty } from './ai';
import { prisma } from '../utils/prisma';

export class GameManager {
  private static instance: GameManager;
  private games: Map<string, GameEngine> = new Map();

  private constructor() {}

  static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  createGame(sessionId: string): GameEngine {
    if (this.games.has(sessionId)) {
      return this.games.get(sessionId)!;
    }
    const game = new GameEngine(sessionId, undefined, (result) => {
      this.handleGameEnd(sessionId, result);
    });
    this.games.set(sessionId, game);
    return game;
  }

  private async handleGameEnd(sessionId: string, result: { winner: 'p1' | 'p2'; score: { p1: number; p2: number }; p1Id?: number; p2Id?: number; startedAt?: Date }) {
    this.games.delete(sessionId);

    if (!result.p1Id) {
      // AI game or incomplete
      return;
    }

    // If p2Id is missing, it might be AI.
    // But for now let's assume we only save PvP or handle AI if we have a "bot user" or nullable playerB.
    // The schema requires playerBId.
    // If it's AI, we might need a dummy user or handle it differently.
    // For now, let's only save if both are real users.
    if (!result.p2Id) {
       console.log('Game ended against AI or missing player, skipping DB save for now');
       return;
    }

    try {
      const winnerId = result.winner === 'p1' ? result.p1Id : result.p2Id;
      const loserId = result.winner === 'p1' ? result.p2Id : result.p1Id;

      await prisma.$transaction(async (tx) => {
        // Create Match
        await tx.match.create({
          data: {
            playerAId: result.p1Id!,
            playerBId: result.p2Id!,
            winnerId,
            mode: 'STANDARD',
            status: 'FINISHED',
            startedAt: result.startedAt || new Date(),
            endedAt: new Date(),
            results: {
              create: [
                { userId: result.p1Id!, outcome: result.winner === 'p1' ? 'WIN' : 'LOSS', score: result.score.p1 },
                { userId: result.p2Id!, outcome: result.winner === 'p2' ? 'WIN' : 'LOSS', score: result.score.p2 }
              ]
            }
          }
        });

        // Update Stats for Winner
        await tx.userStats.upsert({
          where: { userId: winnerId },
          create: { userId: winnerId!, wins: 1, matchesPlayed: 1, pointsScored: result.score[result.winner], pointsAgainst: result.score[result.winner === 'p1' ? 'p2' : 'p1'] },
          update: {
            wins: { increment: 1 },
            matchesPlayed: { increment: 1 },
            pointsScored: { increment: result.score[result.winner] },
            pointsAgainst: { increment: result.score[result.winner === 'p1' ? 'p2' : 'p1'] }
          }
        });

        // Update Stats for Loser
        await tx.userStats.upsert({
          where: { userId: loserId },
          create: { userId: loserId!, losses: 1, matchesPlayed: 1, pointsScored: result.score[result.winner === 'p1' ? 'p2' : 'p1'], pointsAgainst: result.score[result.winner] },
          update: {
            losses: { increment: 1 },
            matchesPlayed: { increment: 1 },
            pointsScored: { increment: result.score[result.winner === 'p1' ? 'p2' : 'p1'] },
            pointsAgainst: { increment: result.score[result.winner] }
          }
        });
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

  createPrivateGame(): { game: GameEngine; sessionId: string } {
    const sessionId = `game_private_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return { game: this.createGame(sessionId), sessionId };
  }

  createLocalGame(): { game: GameEngine; sessionId: string } {
    const sessionId = `game_local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return { game: this.createGame(sessionId), sessionId };
  }
}
