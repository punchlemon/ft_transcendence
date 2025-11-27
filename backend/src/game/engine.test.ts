import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameEngine } from './engine';
import { WebSocket } from 'ws';

describe('GameEngine', () => {
  let game: GameEngine;
  let mockWs1: any;
  let mockWs2: any;

  beforeEach(() => {
    game = new GameEngine('test-session');
    mockWs1 = { send: vi.fn(), readyState: WebSocket.OPEN };
    mockWs2 = { send: vi.fn(), readyState: WebSocket.OPEN };
  });

  afterEach(() => {
    game.stop();
  });

  it('should initialize with waiting status', () => {
    expect(game.isWaitingForPlayers()).toBe(true);
    expect(game.sessionId).toBe('test-session');
  });

  it('should add players and start countdown', () => {
    vi.useFakeTimers();
    
    expect(game.addPlayer(mockWs1)).toBe('p1');
    expect(game.isWaitingForPlayers()).toBe(true);
    
    expect(game.addPlayer(mockWs2)).toBe('p2');
    expect(game.isWaitingForPlayers()).toBe(false);
    
    // Should trigger countdown
    expect(mockWs1.send).toHaveBeenCalledWith(expect.stringContaining('COUNTDOWN'));
    
    vi.advanceTimersByTime(3000);
    // Should start game
    expect(mockWs1.send).toHaveBeenCalledWith(expect.stringContaining('START'));
    
    vi.useRealTimers();
  });

  it('should process input and move paddle', () => {
    game.addPlayer(mockWs1);
    game.addPlayer(mockWs2);
    game.startGame();

    // Initial position
    // height 450, paddle 80 -> center 185
    const initialY = 185;
    
    // Send input for p1 (move down/positive)
    game.processInput('p1', { tick: 1, axis: 1, boost: false });
    
    // Force a tick
    (game as any).tick();
    
    // Paddle speed is 5
    // New Y should be 185 + 5 = 190
    const state = (game as any).state;
    expect(state.paddles.p1).toBe(190);
    expect(state.paddles.p2).toBe(185); // p2 didn't move
  });

  it('should update ball physics', () => {
    game.addPlayer(mockWs1);
    game.addPlayer(mockWs2);
    game.startGame();

    const state = (game as any).state;
    const initialX = state.ball.x;
    const initialY = state.ball.y;
    
    // Force a tick
    (game as any).tick();
    
    expect(state.ball.x).toBe(initialX + state.ball.dx);
    expect(state.ball.y).toBe(initialY + state.ball.dy);
  });

  it('should handle wall collision', () => {
    game.addPlayer(mockWs1);
    game.addPlayer(mockWs2);
    game.startGame();

    const state = (game as any).state;
    // Move ball to top edge
    state.ball.y = 0;
    state.ball.dy = -4;
    
    (game as any).updatePhysics();
    
    expect(state.ball.dy).toBe(4); // Should bounce down
  });

  it('should handle scoring', () => {
    game.addPlayer(mockWs1);
    game.addPlayer(mockWs2);
    game.startGame();

    const state = (game as any).state;
    // Move ball past left edge (p2 scores)
    state.ball.x = -10;
    state.ball.y = 0; // Top edge, paddle is at center (185)
    state.ball.dx = -4;
    
    (game as any).updatePhysics();
    
    expect(state.score.p2).toBe(1);
    expect(state.score.p1).toBe(0);
    // Ball should reset
    expect(state.ball.x).toBe(400);
  });
});
