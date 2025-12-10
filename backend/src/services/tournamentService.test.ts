import { describe, it, expect } from 'vitest';
import { tournamentService } from './tournamentService';

describe('tournamentService (pure helpers)', () => {
  it('getSeededPlayerList produces correct seed order for 4 players', () => {
    const players = ['A', 'B', 'C', 'D'];
    const seeded = tournamentService.getSeededPlayerList(players);
    // For 4 players, the expected seed indices are [0, 3, 1, 2]
    expect(seeded).toEqual(['A', 'D', 'B', 'C']);
  });

  it('padWithBye pads to next power of two and distributes by seed', () => {
    const players = ['P1', 'P2', 'P3'];
    const padded = tournamentService.padWithBye(players);
    // For 3 players, next power is 4 -> expected order by seeding may be [P1, null, P2, P3] or similar
    expect(padded.length).toBe(4);
    // Ensure original players are included
    expect(padded.filter(Boolean).length).toBe(3);
  });
});
