# Types & Socket Design

This document explains where socket event types, enums and connection helpers live, and how they should be used.

Files introduced:

- `backend/src/types/protocol.ts` — central place for socket event names (`SocketEvent`) and payload shapes (`ChatMessagePayload`, `GameMovePayload`, etc). Use this file when defining or updating the shape of messages exchanged over WebSocket.
- `backend/src/lib/SocketManager.ts` — lightweight helper that provides room-based broadcast helpers and convenience lookup functions. It was added to give a place to centralize room-level send logic.
- `backend/src/lib/socketFacade.ts` — migration-friendly facade that keeps the original `connectionIndex` (session/user mapping) and the new `SocketManager` synchronized. Prefer calling the facade's `registerSocket` and `unregisterSocket` from new code.
- `backend/src/chat/connectionIndex.ts` — legacy, authoritative store for user/session sockets. It remains in use for user/session counting and many existing flows; do not remove it without migrating callers.

Migration guidance
------------------

1. New code should prefer `socketFacade.registerSocket(socket, { userId, sessionId, roomId })` so both `connectionIndex` and `SocketManager` stay synchronized.
2. Read-only operations (getting sockets by user, broadcasting to all user sockets) can continue to call `connectionIndex` functions until callers are migrated.
3. When migrating a module to use `SocketManager` features (room broadcast, metadata), ensure registration also stores `roomId` in the facade call.

Why the two-layer approach?
---------------------------

- `connectionIndex` was the original source-of-truth for socket lifecycle and session management and is used widely across the codebase. Removing or rewriting it in one large change is risky.
- `SocketManager` provides helpful room-based utilities that make broadcast logic simpler and clearer.
- `socketFacade` lets us incrementally migrate code: new modules call the facade, tests verify behavior, and then old modules can be swapped over in small, safe steps.

Recommended next steps
----------------------

- Migrate the chat and game WebSocket handlers to call `socketFacade.registerSocket` on connect and `unregisterSocket` on close (ChatSocketHandler has been partially migrated as an example).
- Consider adding a small adapter or shared package so frontend and backend types can be imported from the same source in the future (monorepo or npm package).
- Document the official event names in `docs/api/api_design.md` or link to `backend/src/types/protocol.ts` for the canonical definitions.

Example usage
-------------

```ts
import { registerSocket, unregisterSocket } from '../lib/socketFacade'

// on connect
registerSocket(ws, { userId: 123, sessionId: 456, roomId: 'room-1' })

// on close
unregisterSocket(ws, { userId: 123, sessionId: 456 })
```

If you have questions or find mismatches between current usage and these helpers, open a small PR migrating one module at a time and run tests between changes.
