export type PresenceStatus = 'ONLINE' | 'OFFLINE'
export type PresenceBroadcastFn = (userId: number, status: PresenceStatus) => Promise<void>
export type CloseSocketsFn = (userId: number) => Promise<number>

let broadcastImpl: PresenceBroadcastFn = async () => {}
let closeSocketsImpl: CloseSocketsFn = async () => 0
let closeSocketsBySessionImpl: (sessionId: number) => Promise<number> = async () => 0

export const presenceService = {
  setBroadcast(fn: PresenceBroadcastFn) {
    broadcastImpl = fn
  },
  setCloseSockets(fn: CloseSocketsFn) {
    closeSocketsImpl = fn
  },
  setCloseSocketsBySession(fn: (sessionId: number) => Promise<number>) {
    closeSocketsBySessionImpl = fn
  },
  async broadcast(userId: number, status: PresenceStatus) {
    await broadcastImpl(userId, status)
  },
  async closeUserSockets(userId: number) {
    return closeSocketsImpl(userId)
  }
  ,
  async closeSocketsBySession(sessionId: number) {
    return closeSocketsBySessionImpl(sessionId)
  }
}
