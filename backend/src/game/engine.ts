import { WebSocket } from 'ws';
import { GameState, GameConfig, DEFAULT_CONFIG, PlayerInput } from './types';
import { AIOpponent, AIDifficulty } from './ai';

export class GameEngine {
  public readonly sessionId: string;
  private state: GameState;
  private config: GameConfig;
  private clients: { p1?: WebSocket; p2?: WebSocket } = {};
  private players: { p1?: number; p2?: number } = {};
  private loopId?: NodeJS.Timeout;
  
  // AI
  private aiOpponent?: AIOpponent;
  private isAIEnabled: boolean = false;

  // Input buffers
  private inputQueue: { p1: PlayerInput[]; p2: PlayerInput[] } = { p1: [], p2: [] };

  private onGameEnd?: (result: { winner: 'p1' | 'p2'; score: { p1: number; p2: number }; p1Id?: number; p2Id?: number }) => void;

  constructor(sessionId: string, config: GameConfig = DEFAULT_CONFIG, onGameEnd?: (result: { winner: 'p1' | 'p2'; score: { p1: number; p2: number }; p1Id?: number; p2Id?: number }) => void) {
    this.sessionId = sessionId;
    this.config = config;
    this.onGameEnd = onGameEnd;
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
      return this.state.status === 'WAITING' && !this.clients.p1;
    }
    return this.state.status === 'WAITING' && (!this.clients.p1 || !this.clients.p2);
  }

  addPlayer(socket: WebSocket, userId?: number): 'p1' | 'p2' | null {
    if (!this.clients.p1) {
      this.clients.p1 = socket;
      if (userId) this.players.p1 = userId;
      this.checkStart();
      return 'p1';
    } else if (!this.clients.p2 && !this.isAIEnabled) {
      this.clients.p2 = socket;
      if (userId) this.players.p2 = userId;
      this.checkStart();
      return 'p2';
    }
    return null; // Spectator?
  }

  addAIPlayer(difficulty: AIDifficulty = 'NORMAL') {
    if (this.clients.p2) return; // Slot taken
    this.isAIEnabled = true;
    this.aiOpponent = new AIOpponent(this.config, difficulty);
    this.checkStart();
  }

  removePlayer(socket: WebSocket) {
    if (this.clients.p1 === socket) {
      this.clients.p1 = undefined;
      this.pauseGame('Player 1 disconnected');
    } else if (this.clients.p2 === socket) {
      this.clients.p2 = undefined;
      this.pauseGame('Player 2 disconnected');
    }
    
    if (!this.clients.p1 && (!this.clients.p2 && !this.isAIEnabled)) {
      this.stop();
    }
  }

  private checkStart() {
    const p2Ready = this.clients.p2 || this.isAIEnabled;
    if (this.clients.p1 && p2Ready && this.state.status === 'WAITING') {
      this.state.status = 'COUNTDOWN';
      this.broadcast({ event: 'match:event', payload: { type: 'COUNTDOWN', duration: 3 } });
      setTimeout(() => this.startGame(), 3000);
    }
  }

  startGame() {
    if (this.state.status === 'PLAYING') return;
    this.state.status = 'PLAYING';
    
    // 120Hz loop
    this.loopId = setInterval(() => this.tick(), 1000 / 120);
    
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
      // 1Hz Snapshot (every 120 ticks)
      // We use modulo 120. If tick is 1, 121, 241...
      // Or just check if tick % 120 === 0
      if (this.state.tick % 120 === 0) {
        this.aiOpponent.processSnapshot(this.state);
      }
      
      const aiInput = this.aiOpponent.getNextInput();
      if (aiInput) {
        this.processInput('p2', aiInput);
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
    
    let move = 0;
    while(inputs.length > 0) {
      const input = inputs.shift();
      if (input) move = input.axis;
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
      this.finishGame(scorer);
    } else {
      this.resetBall(scorer === 'p1' ? 'p2' : 'p1'); // Serve to loser
    }
  }

  private finishGame(winner: 'p1' | 'p2') {
    this.state.status = 'FINISHED';
    this.stop();
    this.broadcast({ event: 'match:event', payload: { type: 'FINISHED', winner, score: this.state.score } });
    
    if (this.onGameEnd) {
      this.onGameEnd({ 
        winner, 
        score: this.state.score,
        p1Id: this.players.p1,
        p2Id: this.players.p2
      });
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
