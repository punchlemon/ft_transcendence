# Pong Logic & Networking Design

> Status: Design phase. This document drives the implementation of the authoritative Pong engine that satisfies the Remote Players, AI Opponent, and Live Chat modules. All concepts map back to Prisma models (`GameSession`, `GamePlayer`, `GameEvent`) and API contracts defined in `docs/api/api_design.md`.

## 1. Guiding Principles
- **Authoritative server**: Game physics and scoring run inside the backend (Fastify worker) to prevent cheating and to synchronize remote players.
- **Deterministic ticks**: Fixed 120 Hz physics loop with interpolation on the client to maintain smooth rendering at 60 FPS.
- **Input buffering**: Clients send normalized paddle inputs (\-1, 0, +1) with timestamps. Server applies them during the next tick and echoes authoritative state deltas.
- **Resilience**: WebSocket reconnection window of 5 seconds. During downtime inputs queue locally and are dropped if stale.
- **Extensibility**: The engine exposes hooks for power-ups / customization (even if module not yet selected) without affecting base gameplay.

## 2. Session Lifecycle
| Phase | Description | API / WS hooks |
| --- | --- | --- |
| MATCHING | Waiting for opponent (or AI). | REST: `POST /games`, WS not connected yet. |
| COUNTDOWN | Both clients connected, latency balanced, 3-second countdown. | WS `countdown:start`, `countdown:tick`. |
| PLAYING | Physics loop running, score updates broadcast. | WS `state:update`, `score:update`. |
| PAUSED | Manual pause or disconnect. | WS `pause:set`, `pause:clear`. |
| FINISHED | Winning score reached or surrender. | WS `match:finished`, REST `POST /matches/:id/report`. |

State transitions align with `GameStatus` enum in the schema. All transitions are logged as `GameEvent` rows for auditing.

## 3. WebSocket Channels
### 3.1 Endpoints
- `/ws/game?session=CHANNEL_CODE&token=SHORT_LIVED_JWT`
- `/ws/chat?thread=ID&token=...` (covered elsewhere, but game channel can forward chat events when overlay is open).

### 3.2 Message Types
| Direction | Event | Payload | Notes |
| --- | --- | --- | --- |
| Client → Server | `input` | `{ tick, axis, boost }` | `axis` in \[-1, 1], `boost` boolean for future accelerations. |
| Client → Server | `ready` | `{ latencyMs }` | Sent after socket open; server uses to calibrate countdown. |
| Server → Client | `state:update` | `{ tick, ball, paddles, velocities }` | Snapshots for interpolation. |
| Server → Client | `score:update` | `{ left, right }` | Broadcast immediately when a point is scored. |
| Server → Client | `match:event` | `{ type, payload }` | Generic events (pause, resume, reconnect). |

Each payload includes `tick` so clients can reconcile late packets. Clients send keep-alives every 2s; server disconnects after 5s of silence.

## 4. Physics & Tick Loop
```
const TICK_RATE = 120; // Hz
const FRAME_TIME = 1000 / TICK_RATE; // ~8.33ms

loop() {
  const now = performance.now();
  const delta = now - lastTick;
  if (delta < FRAME_TIME) return; // busy wait or setTimeout remainder

  lastTick = now;
  currentTick++;
  applyBufferedInputs(currentTick);
  integratePhysics(delta);
  detectCollisions();
  if (scoreChange) broadcastScore();
  if (currentTick % SNAPSHOT_INTERVAL === 0) broadcastState();
  recordGameEventIfNeeded();
}
```

### 4.1 Paddle Handling
`applyBufferedInputs` consumes a queue per player. If no fresh input, last known axis is used (with decay to 0 after 150 ms to avoid stuck paddles). Movement speed is constant (subject requirement) and identical for AI and humans.

### 4.2 Ball & Collision
- Ball velocity is represented as `Vector2`. Upon paddle impact, angle deflects proportionally to paddle offset to maintain skill ceiling.
- Wall collisions invert Y velocity.
- Score is triggered when ball crosses left/right bounds. Ball resets to center with randomized initial direction.

### 4.3 Latency Compensation
- Each incoming `input` contains `tick`. Server compares to `currentTick`. If difference <= 4 ticks (~33 ms) input is applied immediately; else it is clamped to prevent rewinding.
- Server echoes `tick` in `state:update` to help clients interpolate between authoritative frames.

## 5. AI Opponent Module
### 5.1 Behavior (1 Hz Vision Constraint)
- AI operates as a pseudo-client inside the server loop but **may only refresh its view once per second** as mandated by the subject.
- Implementation flow per second:
  1. Every 1000 ms the engine captures the current authoritative `GameState` (ball vector, paddle positions, velocities) and hands this snapshot to the AI agent.
  2. The AI runs an internal projector that simulates the next second of ball travel based solely on that snapshot (no mid-second updates). It predicts impact points and desired paddle positions for each 33 ms slice.
  3. Based on the projection it precomputes a queue of discrete paddle commands (\-1, 0, +1) for the upcoming second and pushes them into the normal `applyBufferedInputs` pipeline. Once queued, the AI **cannot revise commands** until the next snapshot tick.
- Difficulty presets affect prediction fidelity and intentional delay:
  - `EASY`: adds ±200 ms reaction lag before queuing commands, injects ±15 px positioning noise, and only simulates straight-line ball travel.
  - `NORMAL`: 150 ms lag, limited to two predicted bounces, smaller noise.
  - `HARD`: 80 ms lag, anticipates up to three bounces and applies slight paddle acceleration but still bound by queued commands.
- To avoid perfect play despite deterministic projections, the AI inserts random mistakes every 8–12 points (drops a queued command or offsets its aim).

### 5.2 Data Flow
- When `mode === VS_AI`, server spawns an AI controller bound to the RIGHT paddle slot. No additional WebSocket is opened.
- Snapshot cadence is driven by a 1 Hz timer. Between snapshots, the AI relies entirely on its precomputed command queue; if the match state changes drastically (e.g., pause, score), the queue is flushed and rebuilt on the next snapshot.
- AI controller uses the same `applyBufferedInputs` pipeline as human players, ensuring identical movement speed and rule enforcement.

## 6. Disconnect & Reconnect Flow
1. Detect missing pings for >5s → mark player as `DISCONNECTED`.
2. Pause match, broadcast `match:event` with `{ type: "PLAYER_DISCONNECTED", slot }`.
3. Start grace timer (default 15s). If player reconnects (auth token still valid) resume countdown.
4. If timer elapses, opponent wins by forfeit; record `GameEvent` and update tournament match result.

## 7. Surrender / Pause
- **Pause**: Either player can request pause (limited to 2 per match). Server acknowledges if both players (or AI) agree. Timer stops but sockets remain open.
- **Surrender**: `PATCH /games/:id` with `{ action: "SURRENDER" }` sets status to `FINISHED`, awarding win to opposite slot.

## 8. Data Persistence
- On match finish, server writes:
  - `GameSession.status = FINISHED`, `startedAt`, `finishedAt`.
  - `GameEvent` rows for each score, pause, disconnect to facilitate replay.
  - `GamePlayer.score` final tallies.
- Background worker aggregates stats into `UserProfile` (wins/losses, streaks).

## 9. Security Considerations
- All WebSocket tokens are short-lived (60s) and tied to `sessionId + userId` to prevent hijacking.
- Input rate limit: max 200 messages per 5 seconds. Excess inputs drop and log a warning.
- Physics loop never trusts client ball positions; only server adjusts positions.

## 10. Integration Touchpoints
- **UI**: `Game Room` uses `state:update` for canvas rendering, `match:event` for overlays.
- **API**: `POST /matches/:id/report` triggered automatically after authoritative finish; manual override available for admins.
- **Notifications**: Disconnection or invite events raise `Notification` entries consumed by header dropdown.

## 11. Open Questions
1. Do we need spectator sockets in MVP? (If yes, add read-only mode broadcasting snapshots at lower rate.)
2. Should AI difficulty be user-selectable in `/games` (currently design allows it but UI decision pending).
3. For future blockchain module, should `GameEvent` capture deterministic seed for on-chain verification?

---
This document must stay in sync with DB/API changes. Any adjustment to states or message types should be reflected in `GameStatus`, `GameEventType`, and the WebSocket gateway implementation.
