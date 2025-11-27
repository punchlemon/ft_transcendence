export interface GameConfig {
  width: number;
  height: number;
  paddleHeight: number;
  paddleWidth: number;
  ballRadius: number;
  paddleSpeed: number;
  ballSpeed: number;
  maxBallSpeed: number;
}

export interface GameState {
  tick: number;
  ball: { x: number; y: number; dx: number; dy: number };
  paddles: { p1: number; p2: number }; // y positions (center)
  score: { p1: number; p2: number };
  status: 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'FINISHED';
}

export interface PlayerInput {
  tick: number;
  axis: number; // -1, 0, 1
  boost: boolean;
}

export const DEFAULT_CONFIG: GameConfig = {
  width: 800,
  height: 450,
  paddleHeight: 80,
  paddleWidth: 10,
  ballRadius: 6,
  paddleSpeed: 5, // pixels per tick (at 120Hz? maybe too fast. 600px/s)
  ballSpeed: 4,
  maxBallSpeed: 12,
};
