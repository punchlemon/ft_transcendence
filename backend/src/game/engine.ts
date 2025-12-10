import { WebSocket } from 'ws';
import { prisma } from '../utils/prisma';
import { userService } from '../services/user';
import { GameState, GameConfig, DEFAULT_CONFIG, PlayerInput } from './types';
import { AIOpponent, AIDifficulty } from './ai';

export type FinishReason = 'SCORE' | 'FORFEIT' | 'ABORT';

export class GameEngine {
  public readonly sessionId: string;
  // If set, the userId of the player who created this private session.
  public creatorUserId?: number;
  // If true, this session was created as a private room and should be
  // torn down when the creator leaves to avoid orphaned private rooms.
  public isPrivate: boolean = false;
  // If true, this is a local/demo session (not an online match).
  public isLocal: boolean = false;
  // Prevent re-entrant destruction logic when we programmatically close sockets
  // during teardown.
  private isBeingDestroyed: boolean = false;
  // Timer used to delay teardown when the last player disconnects to avoid
  // immediately marking freshly-created sessions as expired due to racey
  // connect/disconnect events. If a new player joins during the grace window
  // the timer will be cleared.
  private teardownTimer?: NodeJS.Timeout;
  private state: GameState;
  private config: GameConfig;
  private clients: { p1?: WebSocket; p2?: WebSocket } = {};
  private players: { p1?: number; p2?: number } = {};
  private playersAliases: { p1?: string; p2?: string } = {};
  private loopId?: NodeJS.Timeout;
  public startedAt?: Date;
  
  // AI
  private aiOpponent?: AIOpponent;
  private isAIEnabled: boolean = false;

  // Input buffers
  private inputQueue: { p1: PlayerInput[]; p2: PlayerInput[] } = { p1: [], p2: [] };
  private lastMoves: { p1: number; p2: number } = { p1: 0, p2: 0 };

  // Flag to indicate whether the most recent finished match has been
  // persisted to the database. This prevents double-persist when
  // restartMatch triggers persistence of the previous match.
  private lastResultPersisted: boolean = false;

  private onGameEnd?: (result: { winner: 'p1' | 'p2'; score: { p1: number; p2: number }; p1Id?: number; p2Id?: number; p1Alias?: string; p2Alias?: string; startedAt?: Date; reason?: FinishReason; meta?: Record<string, unknown> }) => Promise<void> | void;
  private onEmpty?: () => void;

  constructor(
    sessionId: string,
    config: GameConfig = DEFAULT_CONFIG,
    onGameEnd?: (result: { winner: 'p1' | 'p2'; score: { p1: number; p2: number }; p1Id?: number; p2Id?: number; p1Alias?: string; p2Alias?: string; startedAt?: Date; reason?: FinishReason; meta?: Record<string, unknown> }) => Promise<void> | void,
    onEmpty?: () => void
  ) {
    this.sessionId = sessionId;
    this.config = config;
    this.onGameEnd = onGameEnd;
    this.onEmpty = onEmpty;
    this.state = {
      tick: 0,
      ball: { 
        x: config.width / 2, 
        y: config.height / 2, 
        dx: config.ballSpeed, 
        dy: config.ballSpeed 
      },
      paddles: { 
        p1: (config.height - config.paddleHeight) / 2, 
        p2: (config.height - config.paddleHeight) / 2 
      },
      score: { p1: 0, p2: 0 },
      status: 'WAITING'
    };
  }

  isWaitingForPlayers(): boolean {
    if (this.isAIEnabled) {
      // If AI is enabled, we are waiting if the OTHER slot is empty
      const aiSlot = (this as any).aiSlot;
      if (aiSlot === 'p1') return !this.clients.p2;
      return !this.clients.p1;
    }
    return this.state.status === 'WAITING' && (!this.clients.p1 || !this.clients.p2);
  }

  isPlayer(userId: number): boolean {
    return this.players.p1 === userId || this.players.p2 === userId;
  }

  addPlayer(socket: WebSocket, userId?: number, alias?: string): 'p1' | 'p2' | null {
    const aiSlot = (this as any).aiSlot;
    // If a player joins while a previous empty-game teardown was scheduled,
    // cancel that teardown — the game is active again.
    try {
      if (this.teardownTimer) {
        clearTimeout(this.teardownTimer);
        this.teardownTimer = undefined;
      }
    } catch (e) {
      // swallow
    }

    // Reconnection logic: if the user is already a player in this game,
    // update their socket connection.
    if (userId) {
      if (this.players.p1 === userId) {
        // Close old socket if it's different
        if (this.clients.p1 && this.clients.p1 !== socket) {
          try { this.clients.p1.close(); } catch (e) {}
        }
        this.clients.p1 = socket;
        // Ensure status is IN_GAME (in case it was set to ONLINE on disconnect)
        prisma.user.update({ where: { id: userId }, data: { status: 'IN_GAME' } }).catch(() => {});
        try { userService.emitStatusChange(userId, 'IN_GAME'); } catch (e) {}
        
        this.checkStart();
        return 'p1';
      } else if (this.players.p2 === userId) {
        // Close old socket if it's different
        if (this.clients.p2 && this.clients.p2 !== socket) {
          try { this.clients.p2.close(); } catch (e) {}
        }
        this.clients.p2 = socket;
        // Ensure status is IN_GAME
        prisma.user.update({ where: { id: userId }, data: { status: 'IN_GAME' } }).catch(() => {});
        try { userService.emitStatusChange(userId, 'IN_GAME'); } catch (e) {}

        this.checkStart();
        return 'p2';
      }
    }

    if (!this.clients.p1 && aiSlot !== 'p1') {
      this.clients.p1 = socket;
      if (userId) {
        this.players.p1 = userId;

        // Mark the user as being in a valid (non-destroyed) room.
        prisma.user.update({ where: { id: userId }, data: { status: 'IN_GAME' } })
          .catch((e) => console.error('[engine] Failed to set user status IN_GAME on addPlayer', e));
        try {
          userService.emitStatusChange(userId, 'IN_GAME');
        } catch (e) {
          console.error('[engine] Failed to emit status change for IN_GAME on addPlayer', e);
        }
      }
      if (alias) this.playersAliases.p1 = alias;
      this.checkStart();
      return 'p1';
    } else if (!this.clients.p2 && aiSlot !== 'p2') {
      this.clients.p2 = socket;
      if (userId) {
        this.players.p2 = userId;

        // Mark the user as being in a valid (non-destroyed) room.
        prisma.user.update({ where: { id: userId }, data: { status: 'IN_GAME' } })
          .catch((e) => console.error('[engine] Failed to set user status IN_GAME on addPlayer', e));
        try {
          userService.emitStatusChange(userId, 'IN_GAME');
        } catch (e) {
          console.error('[engine] Failed to emit status change for IN_GAME on addPlayer', e);
        }
      }
      if (alias) this.playersAliases.p2 = alias;
      this.checkStart();
      return 'p2';
    }
    return null; // Spectator?
  }

  addAIPlayer(difficulty: AIDifficulty = 'NORMAL', preferredSlot?: 'p1' | 'p2') {
    // Check if AI is already enabled
    if (this.isAIEnabled) return;

    // Determine slot for AI
    let slot: 'p1' | 'p2' | null = null;

    if (preferredSlot) {
        if (preferredSlot === 'p1' && !this.clients.p1) slot = 'p1';
        else if (preferredSlot === 'p2' && !this.clients.p2) slot = 'p2';
    } else {
        // Default: Prefer P2 (Standard User vs AI)
        if (!this.clients.p2) slot = 'p2';
        else if (!this.clients.p1) slot = 'p1';
    }

    if (!slot) return; // No slot available

    this.isAIEnabled = true;
    this.aiOpponent = new AIOpponent(this.config, difficulty);
    
    // Label AI opponent
    this.playersAliases[slot] = `AI (${difficulty})`;
    
    // Store AI slot for tick processing
    (this as any).aiSlot = slot;

    this.checkStart();
  }

  removePlayer(socket: WebSocket) {
    // Short-circuit if we are already tearing this game down.
    if (this.isBeingDestroyed) return;
    let removedSlot: 'p1' | 'p2' | null = null;
    let disconnectMessage: string | null = null;
    if (this.clients.p1 === socket) {
      this.clients.p1 = undefined;
      removedSlot = 'p1';
      disconnectMessage = 'Player 1 disconnected';
    } else if (this.clients.p2 === socket) {
      this.clients.p2 = undefined;
      removedSlot = 'p2';
      disconnectMessage = 'Player 2 disconnected';
    }

    const isTournamentMatch = this.sessionId.startsWith('local-match-');
    let handledForfeit = false;
    if (removedSlot && isTournamentMatch) {
      handledForfeit = this.handleTournamentForfeit(removedSlot);
    }

    if (removedSlot && !handledForfeit && disconnectMessage) {
      this.pauseGame(disconnectMessage);
    }

    // Immediately mark the removed player as ONLINE in the DB and emit
    // a status change so other clients see the update without waiting for
    // the whole-room teardown logic. This helps when a single player
    // leaves but the room remains for others (or when the client navigates away).
    try {
      if (removedSlot) {
        const removedUserId = this.players[removedSlot]
        if (typeof removedUserId === 'number') {
          prisma.user.update({ where: { id: removedUserId }, data: { status: 'ONLINE' } })
            .catch((e) => console.error('[engine] Failed to set user status ONLINE on removePlayer', e));
          try {
            userService.emitStatusChange(removedUserId, 'ONLINE');
          } catch (e) {
            console.error('[engine] Failed to emit status change for ONLINE on removePlayer', e);
          }
        }
        // We do NOT clear the stored player ID here. This ensures that if the
        // user reconnects (e.g. after page reload or navigation), isPlayer(userId)
        // returns true, allowing them to rejoin the session.
        // try { delete this.players[removedSlot] } catch (e) {}
        // try { delete this.playersAliases[removedSlot] } catch (e) {}
      }
    } catch (e) {
      // swallow
    }

    // If the removed player's userId matches the creator of this private room,
    // log this event for audit/monitoring purposes.
    try {
      if (removedSlot) {
        const removedUserId = this.players[removedSlot]
        if (typeof this.creatorUserId === 'number' && removedUserId === this.creatorUserId) {
          // Use console.info to ensure the message appears in logs; the Fastify
          // request instance isn't available here.
          console.info(`[game:${this.sessionId}] Creator user ${removedUserId} has left the room (slot=${removedSlot})`)
        }
      }
    } catch (e) {
      // swallow logging errors
    }
    
    // If this is a private room and the creator left, tear down the room
    // immediately to avoid leaving an orphaned private session for other
    // players to join. Notify remaining clients, attempt to close their
    // sockets, and invoke onEmpty so the manager removes the game.
    try {
      if (removedSlot) {
        const removedUserId = this.players[removedSlot]
        if (this.isPrivate && typeof this.creatorUserId === 'number' && removedUserId === this.creatorUserId) {
          // Notify remaining participants that the room was closed by the creator.
          this.broadcast({ event: 'match:event', payload: { type: 'CLOSED_BY_CREATOR', message: 'Creator closed the private room' } });

          // Attempt to close remaining sockets (if any). It's okay if this
          // triggers their close handlers — removePlayer is idempotent enough.
          try {
            if (this.clients.p1 && this.clients.p1 !== socket) {
              this.clients.p1.close();
            }
          } catch (e) {
            // ignore
          }
          try {
            if (this.clients.p2 && this.clients.p2 !== socket) {
              this.clients.p2.close();
            }
          } catch (e) {
            // ignore
          }

          // Mark destruction in progress so subsequent removePlayer calls
          // triggered by socket close events are no-ops.
          this.isBeingDestroyed = true;

          // Stop the engine and notify manager that the game is empty.
          try {
            this.stop();
          } catch (e) {
            // swallow
          }
          try {
            try { console.info(`[game:${this.sessionId}] calling onEmpty (creator left)`); } catch (e) {}
            if (this.onEmpty) this.onEmpty();
          } catch (e) {
            // swallow
          }

          // We're done — return early so normal empty-game logic doesn't run twice.
          return;
        }
      }
    } catch (e) {
      // swallow
    }

    // Public online PvP behavior: if this is a non-private, non-local, non-AI
    // online match and one player leaves, immediately tear down the room and
    // force remaining players out. This avoids leaving a half-empty public
    // match that other players could incorrectly join.
    /*
    try {
      if (removedSlot) {
        const removedUserId = this.players[removedSlot]
        if (!this.isPrivate && !this.isLocal && !this.isAIEnabled) {
          // Notify remaining participants that the room is closed because a
          // participant left.
          this.broadcast({ event: 'match:event', payload: { type: 'CLOSED', message: 'Player left; match closed' } });

          // Prevent re-entrant cleanup
          this.isBeingDestroyed = true;

          try {
            if (this.clients.p1 && this.clients.p1 !== socket) this.clients.p1.close();
          } catch (e) {}
          try {
            if (this.clients.p2 && this.clients.p2 !== socket) this.clients.p2.close();
          } catch (e) {}

          try { this.stop(); } catch (e) {}
          try { if (this.onEmpty) this.onEmpty(); } catch (e) {}
          return;
        }
      }
    } catch (e) {
      // swallow
    }
    */
    
    if (!this.clients.p1 && (!this.clients.p2 && !this.isAIEnabled)) {
      // No players left: schedule a delayed teardown rather than immediately
      // calling onEmpty. This prevents transient disconnects or immediate
      // re-checks (caused by e.g. the client refreshing or modal flows)
      // from causing the session to be marked expired right away.
      if (!this.teardownTimer) {
        try {
          this.teardownTimer = setTimeout(() => {
            this.teardownTimer = undefined;
            try { this.stop(); } catch (e) {}
            try {
              if (this.onEmpty) this.onEmpty();
            } catch (e) {
              // swallow
            }
          }, 1000);
        } catch (e) {
          // fallback: immediate teardown
          try { this.stop(); } catch (err) {}
          try { if (this.onEmpty) this.onEmpty(); } catch (err) {}
        }
      }
    }
  }

  private handleTournamentForfeit(loserSlot: 'p1' | 'p2'): boolean {
    if (this.state.status === 'FINISHED') {
      return true;
    }
    if (this.state.status !== 'PLAYING' && this.state.status !== 'COUNTDOWN') {
      return false;
    }

    const winnerSlot: 'p1' | 'p2' = loserSlot === 'p1' ? 'p2' : 'p1';
    if (!winnerSlot) return false;

    const loserAlias = this.playersAliases[loserSlot];
    const winnerAlias = this.playersAliases[winnerSlot];

    const loserScore = this.state.score[loserSlot];
    const winnerScore = this.state.score[winnerSlot];
    const adjustedWinnerScore = Math.max(winnerScore ?? 0, (loserScore ?? 0) + 1, 1);
    this.state.score[winnerSlot] = adjustedWinnerScore;

    const message = loserAlias ? `${loserAlias} forfeited the match.` : 'Opponent forfeited the match.';
    const meta = {
      forfeit: {
        loserSlot,
        winnerSlot,
        loserAlias: loserAlias ?? null,
        winnerAlias: winnerAlias ?? null
      }
    };

    this.finishGame(winnerSlot, { reason: 'FORFEIT', message, meta })
      .catch((err) => console.error('[engine] Failed to finish tournament forfeit', err));
    return true;
  }

  private checkStart() {
    // Check if both slots are filled (either by client or AI)
    const p1Ready = this.clients.p1 || (this.isAIEnabled && (this as any).aiSlot === 'p1');
    const p2Ready = this.clients.p2 || (this.isAIEnabled && (this as any).aiSlot === 'p2');

    if (p1Ready && p2Ready && this.state.status === 'WAITING') {
      this.state.status = 'COUNTDOWN';
      this.broadcast({ event: 'match:event', payload: { type: 'COUNTDOWN', duration: 3 } });
      setTimeout(() => this.startGame(), 3000);
    }
  }

  startGame() {
    if (this.state.status === 'PLAYING') return;
    this.state.status = 'PLAYING';
    this.startedAt = new Date();
    
    // 120Hz loop
    this.loopId = setInterval(() => this.tick(), 1000 / 120);
    
    // Mark real user players as IN_GAME so other clients see presence change.
    try {
      Object.values(this.players).forEach((uid) => {
        if (typeof uid === 'number') {
          // fire-and-forget DB update and status event so chat WS can broadcast
          prisma.user.update({ where: { id: uid }, data: { status: 'IN_GAME' } })
            .catch((e) => console.error('[engine] Failed to set user status IN_GAME', e));
          try {
            userService.emitStatusChange(uid, 'IN_GAME');
          } catch (e) {
            console.error('[engine] Failed to emit status change for IN_GAME', e);
          }
        }
      });
    } catch (e) {
      console.error('[engine] Error while broadcasting IN_GAME status', e);
    }

    this.broadcast({ event: 'match:event', payload: { type: 'START' } });
  }

  stop() {
    if (this.loopId) {
      clearInterval(this.loopId);
      this.loopId = undefined;
    }
    this.state.status = 'FINISHED';
  }

  pauseGame(reason: string) {
    this.state.status = 'PAUSED';
    if (this.loopId) {
      clearInterval(this.loopId);
      this.loopId = undefined;
    }
    this.broadcast({ event: 'match:event', payload: { type: 'PAUSE', reason } });
  }

  processInput(slot: 'p1' | 'p2', input: PlayerInput) {
    if (this.state.status !== 'PLAYING') return;
    this.inputQueue[slot].push(input);
  }

  private tick() {
    this.state.tick++;
    
    // AI Logic
    if (this.isAIEnabled && this.aiOpponent) {
      const aiSlot = (this as any).aiSlot as 'p1' | 'p2' || 'p2'; // Default to p2 for backward compat

      // 1Hz Snapshot (every 120 ticks)
      if (this.state.tick % 120 === 0) {
        this.aiOpponent.processSnapshot(this.state);
      }
      
      const aiInput = this.aiOpponent.getNextInput();
      if (aiInput) {
        this.processInput(aiSlot, aiInput);
      }
    }

    // Process inputs
    this.processPlayerInputs('p1');
    this.processPlayerInputs('p2');

    // Physics
    this.updatePhysics();

    // Broadcast state every 2 ticks (60Hz)
    if (this.state.tick % 2 === 0) {
      this.broadcast({ event: 'state:update', payload: this.state });
    }
  }

  private processPlayerInputs(slot: 'p1' | 'p2') {
    const inputs = this.inputQueue[slot];
    // Simple: take the latest input for this tick or apply movement
    // For now, just drain queue and apply last known direction
    // Real implementation should handle timestamps
    
    let move = this.lastMoves[slot];
    if (inputs.length > 0) {
      while(inputs.length > 0) {
        const input = inputs.shift();
        if (input) move = input.axis;
      }
      this.lastMoves[slot] = move;
    }
    
    // Apply movement
    if (move !== 0) {
      const currentY = this.state.paddles[slot];
      const newY = currentY + (move * this.config.paddleSpeed);
      // Clamp
      const maxY = this.config.height - this.config.paddleHeight;
      this.state.paddles[slot] = Math.max(0, Math.min(maxY, newY));
    }
  }

  private updatePhysics() {
    const { ball } = this.state;
    
    // Move ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall collisions (Top/Bottom)
    if (ball.y - this.config.ballRadius <= 0) {
      ball.y = this.config.ballRadius;
      ball.dy *= -1;
    } else if (ball.y + this.config.ballRadius >= this.config.height) {
      ball.y = this.config.height - this.config.ballRadius;
      ball.dy *= -1;
    }

    // Paddle collisions
    // Left paddle (p1)
    if (ball.dx < 0 && ball.x - this.config.ballRadius <= this.config.paddleWidth) {
      if (this.checkPaddleCollision('p1')) {
        ball.dx *= -1;
        this.increaseSpeed();
      } else if (ball.x < 0) {
        this.score('p2');
      }
    }
    
    // Right paddle (p2)
    if (ball.dx > 0 && ball.x + this.config.ballRadius >= this.config.width - this.config.paddleWidth) {
      if (this.checkPaddleCollision('p2')) {
        ball.dx *= -1;
        this.increaseSpeed();
      } else if (ball.x > this.config.width) {
        this.score('p1');
      }
    }
  }

  private checkPaddleCollision(slot: 'p1' | 'p2'): boolean {
    const paddleY = this.state.paddles[slot];
    const ballY = this.state.ball.y;
    return ballY >= paddleY && ballY <= paddleY + this.config.paddleHeight;
  }

  private increaseSpeed() {
    const speed = Math.sqrt(this.state.ball.dx ** 2 + this.state.ball.dy ** 2);
    if (speed < this.config.maxBallSpeed) {
      this.state.ball.dx *= 1.05;
      this.state.ball.dy *= 1.05;
    }
  }

  private score(scorer: 'p1' | 'p2') {
    this.state.score[scorer]++;
    this.broadcast({ event: 'score:update', payload: this.state.score });

    if (this.state.score[scorer] >= (this.config.winningScore || 5)) {
      // Fire and forget finishGame, but catch errors
      this.finishGame(scorer, { reason: 'SCORE' }).catch(err => console.error('Error finishing game:', err));
    } else {
      this.resetBall(scorer === 'p1' ? 'p2' : 'p1'); // Serve to loser
    }
  }

  public async finishGame(winner: 'p1' | 'p2', options?: { reason?: FinishReason; message?: string; meta?: Record<string, unknown> }) {
    if (this.state.status === 'FINISHED') {
      return;
    }

    this.stop();

    const reason: FinishReason = options?.reason ?? 'SCORE';

    // Persist result first
    if (this.onGameEnd) {
      try {
        await this.onGameEnd({ 
          winner, 
          score: this.state.score,
          p1Id: this.players.p1,
          p2Id: this.players.p2,
          p1Alias: this.playersAliases.p1,
          p2Alias: this.playersAliases.p2,
          startedAt: this.startedAt,
          reason,
          meta: options?.meta
        });
        // Mark that we've persisted this match so restartMatch won't re-persist
        this.lastResultPersisted = true;
      } catch (e) {
        console.error('Failed to persist game result', e);
      }
    }

    // Then notify clients
    const payload: Record<string, unknown> = { type: 'FINISHED', winner, score: this.state.score, reason };
    if (options?.message) {
      payload.message = options.message;
    }
    if (options?.meta) {
      payload.meta = options.meta;
    }
    this.broadcast({ event: 'match:event', payload });
  }

  // Abort the game and save current score as final (winner determined by current score)
  public abortGame() {
    const { p1, p2 } = this.state.score
    let winner: 'p1' | 'p2' = 'p1'
    if (p2 > p1) winner = 'p2'
    this.finishGame(winner, { reason: 'ABORT' }).catch(err => console.error('Error aborting game:', err));
  }

  // Restart the match in the same session. This resets scores/ball and
  // initiates a countdown -> start cycle while keeping connected clients
  // and player slots intact. Optional `params` can be used to update
  // player aliases (e.g. when front-end requests new names for local matches).
  public restartMatch(params?: { p1Name?: string; p2Name?: string; mode?: string }) {
    try {
      if (params?.p1Name) this.playersAliases.p1 = params.p1Name;
      if (params?.p2Name) this.playersAliases.p2 = params.p2Name;
      // If there is an in-progress/finished score, persist it first so
      // match results are not lost when restarting.
      try {
        const { p1, p2 } = this.state.score;
        const anyScore = (p1 || p2) && (p1 !== 0 || p2 !== 0);
        // Only persist the previous match if it hasn't already been persisted
        // (finishGame sets `lastResultPersisted = true`). This avoids duplicate
        // match records when finish->restart sequencing overlaps.
        if (anyScore && this.onGameEnd && !this.lastResultPersisted) {
          // Determine winner by score (fallback to p1 if tie)
          const winner: 'p1' | 'p2' = p2 > p1 ? 'p2' : 'p1';
          try {
            void this.onGameEnd({
              winner,
              score: { p1, p2 },
              p1Id: this.players.p1,
              p2Id: this.players.p2,
              p1Alias: this.playersAliases.p1,
              p2Alias: this.playersAliases.p2,
              startedAt: this.startedAt,
              reason: 'SCORE'
            });
            // Mark persisted so subsequent restart attempts won't persist again
            this.lastResultPersisted = true;
          } catch (e) {
            console.error('[engine] Failed to persist previous match result on restart', e);
          }
        }
      } catch (e) {
        console.error('[engine] Error while attempting to persist previous match on restart', e);
      }

      // Stop any existing play loop and reset runtime state
      try { this.stop(); } catch (e) {}

      // Reset score, paddles, ball, and input buffers so paddles start centered
      this.state.score = { p1: 0, p2: 0 };
      this.state.paddles = {
        p1: (this.config.height - this.config.paddleHeight) / 2,
        p2: (this.config.height - this.config.paddleHeight) / 2
      };
      this.state.ball.x = this.config.width / 2;
      this.state.ball.y = this.config.height / 2;
      this.state.ball.dx = this.config.ballSpeed * (Math.random() > 0.5 ? 1 : -1);
      this.state.ball.dy = this.config.ballSpeed * (Math.random() > 0.5 ? 1 : -1);

      // Clear input buffers and last moves
      this.inputQueue = { p1: [], p2: [] };
      this.lastMoves = { p1: 0, p2: 0 };

      // Start countdown then startGame
      this.state.status = 'COUNTDOWN';
      this.broadcast({ event: 'match:event', payload: { type: 'COUNTDOWN', duration: 3 } });
      // Reset the persisted flag because we're starting a fresh match
      this.lastResultPersisted = false;
      setTimeout(() => this.startGame(), 3000);
    } catch (e) {
      console.error('[engine] Failed to restart match', e);
    }
  }

  private resetBall(server: 'p1' | 'p2') {
    this.state.ball.x = this.config.width / 2;
    this.state.ball.y = this.config.height / 2;
    this.state.ball.dx = (server === 'p1' ? -1 : 1) * this.config.ballSpeed;
    this.state.ball.dy = (Math.random() > 0.5 ? 1 : -1) * this.config.ballSpeed;
  }

  private broadcast(message: any) {
    const data = JSON.stringify(message);
    [this.clients.p1, this.clients.p2].forEach(client => {
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}
