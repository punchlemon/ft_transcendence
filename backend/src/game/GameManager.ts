import { GameEngine } from './engine';
import { WebSocket } from 'ws';
import { AIDifficulty } from './ai';

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
    const game = new GameEngine(sessionId);
    this.games.set(sessionId, game);
    return game;
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
}
