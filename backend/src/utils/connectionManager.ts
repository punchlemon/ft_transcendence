type ConnRecord = {
  socket: any
  connectedAt: number
  authSessionId?: number | null
}

const connectionMap = new Map<string, ConnRecord>()

const makeKey = (userId: number, sessionId: string) => `${userId}:${sessionId}`

export function registerConnection(userId: number, sessionId: string, socket: any, authSessionId?: number | null) {
  if (!userId || !sessionId) return
  const key = makeKey(userId, sessionId)
  const prev = connectionMap.get(key)
  if (prev && prev.socket && prev.socket !== socket) {
    try {
      // attempt graceful close, then terminate
      if (typeof prev.socket.close === 'function') prev.socket.close()
      else if (typeof prev.socket.terminate === 'function') prev.socket.terminate()
    } catch (e) {
      // ignore
    }
  }

  connectionMap.set(key, { socket, connectedAt: Date.now(), authSessionId })
}

export function unregisterConnection(userId: number, sessionId: string, socket: any) {
  if (!userId || !sessionId) return
  const key = makeKey(userId, sessionId)
  const rec = connectionMap.get(key)
  if (rec && rec.socket === socket) {
    connectionMap.delete(key)
  }
}

export function getConnection(userId: number, sessionId: string) {
  return connectionMap.get(makeKey(userId, sessionId))
}

export function terminateAllForSession(sessionId: string) {
  for (const [k, v] of connectionMap.entries()) {
    if (k.endsWith(`:${sessionId}`)) {
      try {
        if (typeof v.socket.close === 'function') v.socket.close()
        else if (typeof v.socket.terminate === 'function') v.socket.terminate()
      } catch (e) {}
      connectionMap.delete(k)
    }
  }
}

export default { registerConnection, unregisterConnection, getConnection, terminateAllForSession }
