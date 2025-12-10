import { GameEngine, FinishReason } from './engine';
import { notificationService } from '../services/notification';
import { WebSocket } from 'ws';
import { AIDifficulty } from './ai';
import { prisma } from '../utils/prisma';

export class GameManager {
  private static instance: GameManager;
  private games: Map<string, GameEngine> = new Map();
  // waitingSlots hold sockets/users who are waiting for an opponent.
  // Keyed by sessionId (e.g. game_wait_<ts>), value contains socket and optional user metadata.
  private waitingSlots: Map<string, { socket: any; userId?: number; displayName?: string; createdAt: number }> = new Map();
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
        // When a game becomes empty, remove it. For most online matches
        // we also mark the session as expired so the same sessionId cannot
        // be re-used. For local/demo sessions and local tournament matches
        // we intentionally avoid marking expired to allow a quick "Play
        // Again" reconnect using the same URL/session id.
        try {
          try {
            console.info(`[game-manager] Handling empty game: ${sessionId}`);
          } catch (e) {
            // ignore logging failures
          }

          // If this is NOT a local/demo session, mark expired and broadcast
          // a session_expired event so other clients' invite UI is invalidated.
          if (!sessionId.startsWith('game_local_') && !sessionId.startsWith('local-match-')) {
            try {
              this.expiredSessions.add(sessionId);
            } catch (e) {
              // swallow
            }

            try {
              notificationService.emit('session_expired', { sessionId });
            } catch (e) {
              // swallow
            }
          } else {
            try {
              console.info(`[game-manager] Local session ${sessionId} not marked expired to allow Play Again`);
            } catch (e) {}
          }
        } catch (e) {
          // swallow
        }

          try {
            // Before removing the in-memory game, mark any real user
            // participants as ONLINE since the room is being destroyed.
            try {
              const g = this.games.get(sessionId);
              if (g) {
                const players = (g as any).players as { p1?: number; p2?: number } | undefined;
                const clients = (g as any).clients as { p1?: any; p2?: any } | undefined;
                
                const setOnline = (uid: number) => {
                    try {
                        prisma.user.update({ where: { id: uid }, data: { status: 'ONLINE' } })
                          .catch((e) => console.error('[game-manager] Failed to set user status ONLINE on destroy', e));
                        try {
                          const { userService } = require('../services/user');
                          userService.emitStatusChange(uid, 'ONLINE');
                        } catch (e) {
                          console.error('[game-manager] Failed to emit status change for ONLINE on destroy', e);
                        }
                    } catch (e) {}
                };

                if (players) {
                    // Only set ONLINE if the client is still connected (meaning removePlayer wasn't called yet).
                    // If removePlayer WAS called, the user status was already set to ONLINE (or they are in a new game),
                    // so we shouldn't touch it.
                    if (players.p1 && clients?.p1) setOnline(players.p1);
                    if (players.p2 && clients?.p2) setOnline(players.p2);
                }
              }
            } catch (e) {
              // swallow
            }

            try {
              this.games.delete(sessionId);
            } catch (e) {
              // swallow delete errors
            }
          } catch (e) {
            // swallow
          }
      }
    );
    this.games.set(sessionId, game);
    try { console.info(`[game-manager] Game registered: ${sessionId} (games=${this.games.size})`) } catch (e) {}
    return game;
  }

  isExpired(sessionId: string) {
    try { console.info(`[game-manager] isExpired? ${sessionId} => ${this.expiredSessions.has(sessionId)}`) } catch (e) {}
    return this.expiredSessions.has(sessionId);
  }

  private async handleGameEnd(sessionId: string, result: { winner: 'p1' | 'p2'; score: { p1: number; p2: number }; p1Id?: number; p2Id?: number; p1Alias?: string; p2Alias?: string; startedAt?: Date; reason?: FinishReason; meta?: Record<string, unknown> }) {
    // Do not delete the game here. A match ending should not destroy the
    // underlying room — players may remain connected and want to play again
    // within the same session. Room destruction is handled by onEmpty/removeGame.

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

      let createdMatchId: number | null = null;
      let createdMatchSummary: any = null;
      await prisma.$transaction(async (tx) => {
        // Create Match with optional aliases and optional user IDs
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
        });
        createdMatchId = created.id;
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
          mode: 'standard',
          finishReason: result.reason ?? 'SCORE'
        };

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

      // Emit match history update via notificationService so connected
      // clients can update their match history UI in real time.
      try {
        const participantIds = [result.p1Id, result.p2Id].filter((v) => typeof v === 'number') as number[];
        for (const uid of participantIds) {
          try {
            notificationService.emit('match_history', { userId: uid, match: createdMatchSummary });
          } catch (e) {
            console.error('[game-manager] Failed to emit match_history for user', uid, e);
          }
        }
      } catch (e) {
        console.error('[game-manager] Error emitting match_history updates', e);
      }
      // Also emit a public match history event so viewers of a profile
      // (who are not necessarily participants) can receive updates in real time.
      try {
        notificationService.emit('match_history_public', { match: createdMatchSummary });
      } catch (e) {
        console.error('[game-manager] Failed to emit match_history_public', e);
      }
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

  // Waiting slot API
  createWaitingSlot(sessionId?: string, socket?: any, userId?: number, displayName?: string) {
    const id = sessionId ?? `game_wait_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.waitingSlots.set(id, { socket, userId, displayName, createdAt: Date.now() })
    try { console.info(`[game-manager] createWaitingSlot -> ${id} (user=${userId ?? 'anon'})`) } catch (e) {}
    try { console.info(`[game-manager] waitingSlots count=${this.waitingSlots.size}`) } catch (e) {}
    return id
  }

  hasWaitingSlot(): string | null {
    for (const key of this.waitingSlots.keys()) return key
    return null
  }

  takeWaitingSlot(sessionId?: string) {
    if (sessionId) {
      const v = this.waitingSlots.get(sessionId)
      if (!v) return null
      this.waitingSlots.delete(sessionId)
      try { console.info(`[game-manager] takeWaitingSlot explicit -> ${sessionId}`) } catch (e) {}
      try { console.info(`[game-manager] waitingSlots count=${this.waitingSlots.size}`) } catch (e) {}
      return { sessionId, ...v }
    }
    // take the first available
    for (const [key, value] of this.waitingSlots.entries()) {
      this.waitingSlots.delete(key)
      try { console.info(`[game-manager] takeWaitingSlot -> ${key}`) } catch (e) {}
      try { console.info(`[game-manager] waitingSlots count=${this.waitingSlots.size}`) } catch (e) {}
      return { sessionId: key, ...value }
    }
    return null
  }

  removeWaitingSlot(sessionId: string) {
    const existed = this.waitingSlots.delete(sessionId)
    try { console.info(`[game-manager] removeWaitingSlot ${sessionId} -> removed=${existed}`) } catch (e) {}
    try { console.info(`[game-manager] waitingSlots count=${this.waitingSlots.size}`) } catch (e) {}
  }

  getGame(sessionId: string): GameEngine | undefined {
    return this.games.get(sessionId);
  }

  removeGame(sessionId: string) {
    const game = this.games.get(sessionId);
    if (game) {
      try {
        // Stop engine but do not prematurely mark users ONLINE here;
        // markPlayersOnline will be invoked as part of the destroy flow
        // (or we call the same logic here to be safe).
        game.stop();

        // Mark players ONLINE because we're removing the game now.
        try {
          const players = (game as any).players as { p1?: number; p2?: number } | undefined;
          if (players) {
            Object.values(players).forEach((uid) => {
              if (typeof uid === 'number') {
                prisma.user.update({ where: { id: uid }, data: { status: 'ONLINE' } })
                  .catch((e) => console.error('[game-manager] Failed to set user status ONLINE on removeGame', e));
                try {
                  const { userService } = require('../services/user');
                  userService.emitStatusChange(uid, 'ONLINE');
                } catch (e) {
                  console.error('[game-manager] Failed to emit status change for ONLINE on removeGame', e);
                }
              }
            });
          }
        } catch (e) {
          // swallow
        }

        this.games.delete(sessionId);
      } catch (e) {
        // swallow
      }
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
