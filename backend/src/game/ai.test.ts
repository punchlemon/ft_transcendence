import { describe, it, expect } from 'vitest';
import { AIOpponent } from './ai';
import { DEFAULT_CONFIG, GameState } from './types';

describe('AIOpponent', () => {
  const config = DEFAULT_CONFIG;
  
  it('should initialize with correct difficulty', () => {
    const ai = new AIOpponent(config, 'HARD');
    expect(ai).toBeDefined();
  });

  it('should generate inputs based on snapshot', () => {
    const ai = new AIOpponent(config, 'NORMAL');
    const state: GameState = {
      tick: 0,
      ball: { x: 400, y: 225, dx: 4, dy: 0 }, // Moving right towards AI
      paddles: { p1: 185, p2: 185 },
      score: { p1: 0, p2: 0 },
      status: 'PLAYING'
    };

    ai.processSnapshot(state);
    
    // Should have queued inputs
    const input = ai.getNextInput();
    expect(input).toBeDefined();
    expect(input?.tick).toBe(0);
  });

  it('should move paddle towards predicted ball position', () => {
    const ai = new AIOpponent(config, 'HARD'); // Less delay
    // Ball moving to top right corner
    const state: GameState = {
      tick: 0,
      ball: { x: 400, y: 225, dx: 10, dy: -5 }, 
      paddles: { p1: 185, p2: 400 }, // AI is at bottom (400)
      score: { p1: 0, p2: 0 },
      status: 'PLAYING'
    };

    ai.processSnapshot(state);
    
    // Skip reaction delay (HARD is ~10 ticks)
    for (let i = 0; i < 15; i++) ai.getNextInput();
    
    // Next inputs should be moving UP (-1) because ball is going to y < 225 and paddle is at 400
    const input = ai.getNextInput();
    expect(input?.axis).toBe(-1);
  });
});
