/**
 * socketFacade
 *
 * Purpose: provide a migration-friendly facade that keeps the existing
 * `connectionIndex` (which stores user/session mappings) in sync with the
 * newer `SocketManager` helper (which provides room-based broadcast helpers).
 *
 * New code should prefer calling `socketFacade.register()` and
 * `socketFacade.unregister()` so both systems remain coherent. Existing code
 * that still uses `connectionIndex` will continue to work during the
 * incremental migration.
 */

import connectionIndex, { SocketWithSessionId } from '../chat/connectionIndex';
import socketManager from './SocketManager';

export function registerSocket(socket: SocketWithSessionId, opts: { userId?: number; sessionId?: number; roomId?: string } = {}) {
  const { userId, sessionId, roomId } = opts;
  // Keep connectionIndex authoritative for user/session tracking when possible
  if (typeof userId === 'number' && typeof sessionId === 'number') {
    connectionIndex.addSocket(userId, sessionId, socket);
  }

  // Also register with socketManager for room-based helpers if a roomId is provided
  socketManager.register(socket, { userId, roomId });
}

export function unregisterSocket(socket: SocketWithSessionId, opts: { userId?: number; sessionId?: number } = {}) {
  const { userId, sessionId } = opts;
  if (typeof userId === 'number' && typeof sessionId === 'number') {
    connectionIndex.removeSocket(userId, sessionId, socket);
  }
  socketManager.unregister(socket);
}

export function findSocketsByUser(userId: number) {
  return connectionIndex.getSocketsByUser(userId) || new Set<SocketWithSessionId>();
}

export function closeSocketsBySession(sessionId: number) {
  return connectionIndex.closeSocketsBySession(sessionId);
}

export function broadcastToRoom(roomId: string, data: unknown) {
  socketManager.broadcastToRoom(roomId, data);
}

export default {
  registerSocket,
  unregisterSocket,
  findSocketsByUser,
  closeSocketsBySession,
  broadcastToRoom,
};
