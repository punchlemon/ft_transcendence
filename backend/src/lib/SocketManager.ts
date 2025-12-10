/**
 * Lightweight SocketManager
 *
 * Purpose: centralize registration and lookup of sockets by userId / roomId.
 * This is intentionally minimal and non-invasive: it does not change connection
 * semantics, only provides utility helpers for other modules to call.
 */

type AnySocket = unknown;

interface SocketMeta {
  socket: AnySocket;
  userId?: number;
  roomId?: string;
}

export class SocketManager {
  private sockets = new Set<SocketMeta>();

  register(socket: AnySocket, opts?: { userId?: number; roomId?: string }) {
    const meta: SocketMeta = { socket, userId: opts?.userId, roomId: opts?.roomId };
    this.sockets.add(meta);
    return meta;
  }

  // Unregister returns the removed meta entries so callers can react to
  // the disconnect (e.g., perform room-level cleanup or application logic).
  unregister(metaOrSocket: SocketMeta | AnySocket): SocketMeta[] {
    const removed: SocketMeta[] = []
    if (!metaOrSocket) return removed;
    if ((metaOrSocket as SocketMeta).socket) {
      const meta = metaOrSocket as SocketMeta
      if (this.sockets.has(meta)) {
        this.sockets.delete(meta)
        removed.push(meta)
      }
      return removed
    }
    for (const m of Array.from(this.sockets)) {
      if (m.socket === metaOrSocket) {
        this.sockets.delete(m)
        removed.push(m)
      }
    }
    return removed
  }

  findByUserId(userId: number) {
    return Array.from(this.sockets).filter((m) => m.userId === userId).map((m) => m.socket);
  }

  findByRoomId(roomId: string) {
    return Array.from(this.sockets).filter((m) => m.roomId === roomId).map((m) => m.socket);
  }

  // Return raw meta entries for a room (includes userId, socket reference etc.)
  findMetaByRoomId(roomId: string) {
    return Array.from(this.sockets).filter((m) => m.roomId === roomId);
  }

  // Find meta entries for a specific user within a specific room
  findMetaByUserAndRoom(userId: number, roomId: string) {
    return Array.from(this.sockets).filter((m) => m.roomId === roomId && m.userId === userId);
  }

  broadcastToRoom(roomId: string, data: unknown) {
    const targets = this.findByRoomId(roomId);
    for (const s of targets) {
      try {
        // Best-effort send; runtime socket type may vary so guard with any
        // Consumers should adapt to their socket implementation.
        // @ts-ignore
        if (s && typeof (s as any).send === 'function') (s as any).send(JSON.stringify(data));
      } catch (err) {
        // swallow: this manager is a helper, not authoritative for error handling
      }
    }
  }

  allSockets() {
    return Array.from(this.sockets).map((m) => m.socket);
  }
}

const socketManager = new SocketManager();
export default socketManager;
