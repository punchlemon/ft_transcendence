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
    if (this.getConnectionCountImpl) return this.getConnectionCountImpl(userId)
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

/*
解説:

1) 目的
  - `chatWs` などの既存コードが期待する `presenceService` の最小実装を提供する。

2) 実装
  - `setCloseSocketsBySession` / `setGetConnectionCount` を外部から登録可能にすることで、WS 層がコネクション数管理やソケット閉鎖処理を差し替えられる。
  - `getConnectionCount` が未登録の場合は DB の `user.status` フィールドを参照する簡易フォールバックを行う。

3) 利用方法
  - `chatWs` は起動時に実実装を `setCloseSocketsBySession` / `setGetConnectionCount` で登録する。
  - その他のサービスは `presenceService.isOnline(userId)` を呼出してオンライン判定ができる。
*/
