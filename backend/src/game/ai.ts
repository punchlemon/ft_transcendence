import { GameState, GameConfig, PlayerInput } from './types';

export type AIDifficulty = 'EASY' | 'NORMAL' | 'HARD';

export class AIOpponent {
  private config: GameConfig;
  private difficulty: AIDifficulty;
  private inputQueue: PlayerInput[] = [];
  
  // Difficulty settings
  private reactionDelayTicks: number;
  private errorMargin: number;

  constructor(config: GameConfig, difficulty: AIDifficulty = 'NORMAL') {
    this.config = config;
    this.difficulty = difficulty;

    switch (difficulty) {
      case 'EASY':
        this.reactionDelayTicks = 24; // ~200ms
        this.errorMargin = 30; // pixels
        break;
      case 'HARD':
        this.reactionDelayTicks = 10; // ~80ms
        this.errorMargin = 5;
        break;
      case 'NORMAL':
      default:
        this.reactionDelayTicks = 18; // ~150ms
        this.errorMargin = 15;
        break;
    }
  }

  // Called by engine every tick to get the next input
  getNextInput(): PlayerInput | null {
    return this.inputQueue.shift() || null;
  }

  // Called by engine every 1s (120 ticks)
  processSnapshot(state: GameState) {
    this.inputQueue = []; // Clear previous queue
    
    // 1. Predict where the ball will be when it reaches our paddle (P2 is on the right)
    // We simulate the ball for up to 1 second (120 ticks)
    
    const targetY = this.predictTargetY(state);
    
    // 2. Generate inputs to move towards targetY
    // We need to fill 120 ticks worth of inputs
    
    let currentPaddleY = state.paddles.p2;
    
    for (let i = 0; i < 120; i++) {
      // Apply reaction delay
      if (i < this.reactionDelayTicks) {
        this.inputQueue.push({ tick: state.tick + i, axis: 0, boost: false });
        continue;
      }

      // Simple P-controller
      const diff = targetY - (currentPaddleY + this.config.paddleHeight / 2);
      let axis = 0;
      
      if (Math.abs(diff) > this.config.paddleSpeed) {
        axis = diff > 0 ? 1 : -1;
      }
      
      // Apply movement to our local simulation of paddle
      currentPaddleY += axis * this.config.paddleSpeed;
      // Clamp
      const maxY = this.config.height - this.config.paddleHeight;
      currentPaddleY = Math.max(0, Math.min(maxY, currentPaddleY));

      this.inputQueue.push({ tick: state.tick + i, axis, boost: false });
    }
  }

  private predictTargetY(state: GameState): number {
    // Clone ball state
    let { x, y, dx, dy } = state.ball;
    const { width, height, ballRadius, paddleWidth } = this.config;
    const paddleX = width - paddleWidth - ballRadius; // Target X for P2

    // If ball is moving away from us (dx < 0), return center or stay put
    // For 'HARD', maybe return center. For 'EASY', stay put.
    if (dx < 0) {
      return height / 2;
    }

    // Simulate up to 120 ticks
    for (let i = 0; i < 120; i++) {
      x += dx;
      y += dy;

      // Wall collisions
      if (y - ballRadius <= 0) {
        y = ballRadius;
        dy *= -1;
      } else if (y + ballRadius >= height) {
        y = height - ballRadius;
        dy *= -1;
      }

      // Check if we reached the paddle plane
      if (x >= paddleX) {
        // Add some error/noise based on difficulty
        const noise = (Math.random() - 0.5) * 2 * this.errorMargin;
        return y + noise;
      }
    }

    // If we didn't reach the paddle in 1s, return the last y
    return y;
  }
}
