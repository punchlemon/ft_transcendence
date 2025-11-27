import { WebSocket } from 'ws';

interface GameState {
  ball: { x: number; y: number; dx: number; dy: number };
  paddles: { p1: number; p2: number };
  score: { p1: number; p2: number };
}

export class GameEngine {
  private state: GameState;
  private clients: { p1?: WebSocket; p2?: WebSocket } = {};
  private intervalId?: NodeJS.Timeout;

  constructor() {
    this.state = {
      ball: { x: 400, y: 225, dx: 4, dy: 4 },
      paddles: { p1: 185, p2: 185 }, // Center y (450/2 - 80/2)
      score: { p1: 0, p2: 0 }
    };
  }

  addPlayer(socket: WebSocket, slot: 'p1' | 'p2') {
    this.clients[slot] = socket;
    // For now, auto-start if p1 joins (single player test) or wait for p2?
    // Let's just start for p1 for testing
    if (this.clients.p1) {
      this.startGame();
    }
  }

  removePlayer(socket: WebSocket) {
    if (this.clients.p1 === socket) {
      this.clients.p1 = undefined;
    } else if (this.clients.p2 === socket) {
      this.clients.p2 = undefined;
    }
    
    if (!this.clients.p1 && !this.clients.p2) {
      this.stopGame();
    }
  }

  startGame() {
    if (this.intervalId) return;
    
    this.broadcast({ event: 'match:event', payload: { type: 'START', message: 'Game Started' } });

    this.intervalId = setInterval(() => {
      this.update();
      this.broadcast({ event: 'state:update', payload: this.state });
    }, 1000 / 60); // 60 Hz
  }

  stopGame() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  update() {
    // Simple physics
    const { ball } = this.state;
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall collision (Top/Bottom)
    if (ball.y <= 0 || ball.y >= 450) ball.dy *= -1;
    
    // Wall collision (Left/Right) - should be score, but bounce for now
    if (ball.x <= 0 || ball.x >= 800) ball.dx *= -1;
  }

  broadcast(message: any) {
    const data = JSON.stringify(message);
    [this.clients.p1, this.clients.p2].forEach(client => {
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}
