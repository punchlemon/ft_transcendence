import { WebSocket } from 'ws'

export type SocketWithSessionId = WebSocket & { __sessionId?: number }

class ConnectionIndex {
  // userId -> set of sockets
  private connections: Map<number, Set<SocketWithSessionId>> = new Map()
  // sessionId -> set of sockets
  private sessionSockets: Map<number, Set<SocketWithSessionId>> = new Map()

  addSocket(userId: number, sessionId: number, socket: SocketWithSessionId) {
    if (typeof sessionId === 'number') {
      let s = this.sessionSockets.get(sessionId)
      if (!s) {
        s = new Set()
        this.sessionSockets.set(sessionId, s)
      }
      s.add(socket)
      socket.__sessionId = sessionId
    }

    let userSet = this.connections.get(userId)
    if (!userSet) {
      userSet = new Set()
      this.connections.set(userId, userSet)
    }
    userSet.add(socket)
  }

  removeSocket(userId: number, sessionId: number, socket: SocketWithSessionId) {
    if (typeof sessionId === 'number') {
      const ss = this.sessionSockets.get(sessionId)
      if (ss) {
        ss.delete(socket)
        if (ss.size === 0) this.sessionSockets.delete(sessionId)
      }
    }

    const us = this.connections.get(userId)
    if (us) {
      us.delete(socket)
      if (us.size === 0) this.connections.delete(userId)
    }
  }

  getSocketsByUser(userId: number): Set<SocketWithSessionId> | undefined {
    return this.connections.get(userId)
  }

  // Iterator over all user socket sets (useful for broadcasts)
  *getAllUserSockets(): IterableIterator<Set<SocketWithSessionId>> {
    yield* this.connections.values()
  }

  getSocketsBySession(sessionId: number): Set<SocketWithSessionId> | undefined {
    return this.sessionSockets.get(sessionId)
  }

  async closeSocketsBySession(sessionId: number): Promise<number> {
    let count = 0
    const sockets = this.sessionSockets.get(sessionId)
    if (sockets) {
      for (const ws of sockets) {
        try {
          ws.close && ws.close(4000, 'session_revoked')
          count++
        } catch (e) {
          // ignore individual close errors
        }
      }
      this.sessionSockets.delete(sessionId)
    }
    return count
  }

  getConnectionCount(userId: number): number {
    const set = this.connections.get(userId)
    return set ? set.size : 0
  }
}

const connectionIndex = new ConnectionIndex()
export default connectionIndex
