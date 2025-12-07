import { prisma } from '../utils/prisma'

type CloseSocketsFn = (sessionId: number) => Promise<number>
type GetConnectionCountFn = (userId: number) => Promise<number>

class PresenceService {
  private closeSocketsBySessionImpl: CloseSocketsFn | null = null
  private getConnectionCountImpl: GetConnectionCountFn | null = null

  setCloseSocketsBySession(fn: CloseSocketsFn) {
    this.closeSocketsBySessionImpl = fn
  }

  setGetConnectionCount(fn: GetConnectionCountFn) {
    this.getConnectionCountImpl = fn
  }

  async closeSocketsBySession(sessionId: number) {
    if (this.closeSocketsBySessionImpl) return this.closeSocketsBySessionImpl(sessionId)
    return 0
  }

  async getConnectionCount(userId: number) {
    let count = 0
    if (this.getConnectionCountImpl) {
      count = await this.getConnectionCountImpl(userId)
    }
    if (count > 0) return count

    // fallback: check user.status field
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } })
    return user && user.status === 'ONLINE' ? 1 : 0
  }

  async isOnline(userId: number) {
    const cnt = await this.getConnectionCount(userId)
    return cnt > 0
  }
}

export const presenceService = new PresenceService()
