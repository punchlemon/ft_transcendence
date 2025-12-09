import { EventEmitter } from 'events'

export type ConnectionType = 'game' | 'chat' | string

export type ConnRecord = {
  socket: any
  connectedAt: number
  authSessionId?: number | null
  sessionId: string
  type?: ConnectionType
}

// Map userId -> { game?: ConnRecord, chat?: ConnRecord }
const userConnections = new Map<number, Partial<Record<ConnectionType, ConnRecord>>>()

export const connectionEvents = new EventEmitter()

export function registerConnection(userId: number, sessionId: string, socket: any, type: ConnectionType = 'game', authSessionId?: number | null) {
  if (!userId || !sessionId) return
  let slots = userConnections.get(userId)
  if (!slots) {
    slots = {}
    userConnections.set(userId, slots)
  }

  const prev = slots[type]
  // Defensive: if previous record exists for this type, only evict when the
  // stored socket is different from the new socket. Also log a stacktrace to
  // help identify call sites causing evictions.
  if (prev && prev.socket) {
    if (prev.socket === socket) {
      // Re-registering same socket for same type/session: refresh metadata
      prev.connectedAt = Date.now()
      prev.authSessionId = authSessionId
      prev.sessionId = sessionId
      try { console.info(`[connectionManager] Refreshed ${type} connection for user ${userId} session=${sessionId}`) } catch (e) {}
      return
    }

    // If prev exists but its recorded type is different (shouldn't happen),
    // avoid evicting to prevent cross-type tear-downs. Log for diagnostics.
    if ((prev as any).type && (prev as any).type !== type) {
      try {
        console.warn(`[connectionManager] WARNING: previous connection type mismatch for user ${userId}: prevType=${(prev as any).type} newType=${type} (prevSession=${prev.sessionId} newSession=${sessionId}). Skipping eviction to avoid cross-type disruption.`)
      } catch (e) {}
      // still store the new slot under this type without evicting other slots
    } else {
      try {
        try { console.info(`[connectionManager] Evicting previous ${type} connection for user ${userId} (prevSession=${prev.sessionId}, newSession=${sessionId})`) } catch (e) {}
        // include a stack trace to identify the caller
        try { console.info(new Error('registerConnection called from:').stack) } catch (e) {}
        if (typeof prev.socket.close === 'function') prev.socket.close()
        else if (typeof prev.socket.terminate === 'function') prev.socket.terminate()
      } catch (e) {
        // ignore
      }
    }
  }

  const record: ConnRecord = { socket, connectedAt: Date.now(), authSessionId, sessionId, type }
  slots[type] = record
  try { console.info(`[connectionManager] Registered ${type} connection for user ${userId} session=${sessionId}`) } catch (e) {}
  try { connectionEvents.emit('registered', userId, record) } catch (e) {}
}

export function unregisterConnection(userId: number, sessionId: string, socket: any, type?: ConnectionType) {
  if (!userId || !sessionId) return
  const slots = userConnections.get(userId)
  if (!slots) return

  if (type) {
    const rec = slots[type]
    if (rec && rec.socket === socket && rec.sessionId === sessionId) {
      delete slots[type]
      try { connectionEvents.emit('unregistered', userId, rec) } catch (e) {}
    }
  } else {
    // remove any slot that matches both socket and sessionId
    for (const k of Object.keys(slots) as ConnectionType[]) {
      const rec = slots[k]
      if (rec && rec.socket === socket && rec.sessionId === sessionId) {
        delete slots[k]
        try { connectionEvents.emit('unregistered', userId, rec) } catch (e) {}
      }
    }
  }

  // clean up empty map
  if (Object.keys(slots).length === 0) userConnections.delete(userId)
}

export function debugUserSlots(userId: number) {
  const slots = userConnections.get(userId) || {}
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(slots)) {
    out[k] = v ? { sessionId: v.sessionId, connectedAt: v.connectedAt, authSessionId: v.authSessionId } : null
  }
  try { console.info(`[connectionManager] debug slots for user ${userId}: ${JSON.stringify(out)}`) } catch (e) {}
  return out
}

export function getConnection(userId: number, sessionId: string, type?: ConnectionType) {
  const slots = userConnections.get(userId)
  if (!slots) return undefined
  if (type) return slots[type]
  // if no type specified, return first matching sessionId
  for (const rec of Object.values(slots)) {
    if (rec && rec.sessionId === sessionId) return rec
  }
  return undefined
}

export function terminateAllForSession(sessionId: string) {
  for (const [userId, slots] of userConnections.entries()) {
    for (const [k, rec] of Object.entries(slots)) {
      if (rec && rec.sessionId === sessionId) {
        try {
          if (typeof rec.socket.close === 'function') rec.socket.close()
          else if (typeof rec.socket.terminate === 'function') rec.socket.terminate()
        } catch (e) {}
        try { connectionEvents.emit('terminated', userId, rec) } catch (e) {}
        delete (slots as any)[k]
      }
    }
    if (Object.keys(slots).length === 0) userConnections.delete(userId)
  }
}

export default { registerConnection, unregisterConnection, getConnection, terminateAllForSession, connectionEvents }
