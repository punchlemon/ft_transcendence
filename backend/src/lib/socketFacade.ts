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
import logger from '../utils/logger';
import { enqueuePrismaWork } from '../utils/prismaQueue';

export function registerSocket(socket: SocketWithSessionId, opts: { userId?: number; sessionId?: number; roomId?: string } = {}) {
  const { userId, sessionId, roomId } = opts;
  // Keep connectionIndex authoritative for user/session tracking when possible
  if (typeof userId === 'number' && typeof sessionId === 'number') {
    connectionIndex.addSocket(userId, sessionId, socket);
  }

  // Also register with socketManager for room-based helpers if a roomId is provided
  socketManager.register(socket, { userId, roomId });
}

export async function unregisterSocket(socket: SocketWithSessionId, opts: { userId?: number; sessionId?: number } = {}) {
  const { userId, sessionId } = opts;
  if (typeof userId === 'number' && typeof sessionId === 'number') {
    connectionIndex.removeSocket(userId, sessionId, socket);
  }

  // Unregister from socketManager and inspect any removed meta entries.
  const removed = socketManager.unregister(socket)
  try { logger.debug(`[socketFacade] unregisterSocket removed ${removed.length} meta entries for user=${userId} session=${sessionId}`) } catch (e) {}

  try {
    for (const meta of removed) {
      try {
        if (!meta) continue
        try { logger.debug('[socketFacade] processing removed meta', { userId: meta.userId, roomId: meta.roomId }) } catch (e) {}
        if (!meta.roomId || typeof meta.userId !== 'number') continue
        if (!meta.roomId.startsWith('tournament-room:')) continue

        // If the user still has other sockets in the same room, do not consider
        // this a full "participant left" event. This addresses multi-tab /
        // multi-socket clients.
        const remainingMeta = socketManager.findMetaByUserAndRoom(meta.userId, meta.roomId);
        if (remainingMeta && remainingMeta.length > 0) {
          // user still has at least one socket in room -> skip invalidation
          try { logger.debug('[socketFacade] user still has remaining meta in room, skipping invalidation', { userId: meta.userId, roomId: meta.roomId, remaining: remainingMeta.length }) } catch (e) {}
          continue
        }

        const roomIdStr = meta.roomId.replace('tournament-room:', '')
        const roomIdNum = Number(roomIdStr)
        if (isNaN(roomIdNum)) continue

        // Enqueue prisma work to avoid concurrent native engine calls
        enqueuePrismaWork(async () => {
          try {
            const { prisma } = await import('../utils/prisma')
            const room = await prisma.tournamentRoom.findUnique({ where: { id: roomIdNum }, include: { tournament: true } })
            if (!room || !room.tournament) return
            const tournamentId = room.tournamentId
            const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
            if (!tournament) return

            // If the tournament is RUNNING, invalidate it when any participant leaves
            if (tournament.status === 'RUNNING') {
              try { logger.info(`[socketFacade] invalidating tournament ${tournamentId} due to participant ${meta.userId} leaving room ${meta.roomId}`) } catch (e) {}
              await prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'CANCELLED' } })
              socketManager.broadcastToRoom(meta.roomId, { type: 'tournament_invalid', payload: { tournamentId, reason: 'participant_left', userId: meta.userId } })
            }
          } catch (err) {
            try { logger.error('Failed to handle tournament room leave', err) } catch {}
          }
        })
      } catch (err) {
        try { logger.error('Error processing removed meta entry', err) } catch {}
      }
    }
  } catch (err) {
    try { logger.error('Error in unregisterSocket tournament handling', err) } catch {}
  }
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
