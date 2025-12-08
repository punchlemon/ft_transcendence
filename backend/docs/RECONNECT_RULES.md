# IN_GAME Lock & WebSocket Reconnection Rules

This document describes the server-side behavior implemented to enforce `IN_GAME` locks and safe reconnection semantics for the game websocket.

Summary
- REST: users with `status === 'IN_GAME'` are blocked from non-GET REST operations with `409 Conflict`.
- WS: when a client connects to `/ws/game` and later identifies itself (sends a `ready` event with a valid token), the server will register the connection for the tuple `(userId, sessionId)`.
- If another connection already exists for the same `(userId, sessionId)`, the previous socket is closed and the new one becomes authoritative ("後勝ち").

Files
- `backend/src/plugins/authGuard.ts`: Fastify plugin that enforces the REST rule via a `preHandler` hook. Registered from `app.ts` after JWT plugin so `req.user` is available.
- `backend/src/utils/connectionManager.ts`: lightweight in-memory map of active connections. Provides `registerConnection` and `unregisterConnection` helpers.
- `backend/src/routes/game.ts`: at `ready` event handling the server registers connection via `registerConnection(userId, sessionId, socket)` and unregisters on socket close.

Notes & Testing
- To test REST blocking: authenticate a user, set their `status` to `IN_GAME` in DB (or join a game), then attempt a POST request to `/api/users/...` — should respond `409`.
- To test reconnection: open a WS to `/api/ws/game?sessionId=...`, send `ready` with token; then open a second connection with same token/sessionId — the first connection should be closed by the server and the second remains.

Limitations
- Connection tracking is in-memory and will not survive multi-instance deployments. For horizontal scaling, replace the map with a shared store (Redis/pubsub) and a coordination protocol.
- The current implementation attempts graceful `close()` first; if the remote socket does not close, it falls back to `terminate()` where supported.
