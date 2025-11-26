/**
 * なぜテストが必要か:
 * - `/api/health` エンドポイントが 200 と正しい JSON スキーマを返すかを検証し、監視に使う指標を守る。
 * - Fastify サーバーの組み立て (プラグイン登録/DI) がテスト環境でも正しく完了するかを継続的にチェックする。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from './app'

describe('GET /api/health', () => {
  let server: FastifyInstance | undefined

  beforeAll(async () => {
    server = await buildServer()
  })

  afterAll(async () => {
    if (server) {
      await server.close()
    }
  })

  it('returns ok payload with ISO timestamp', async () => {
    const response = await server!.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)

    const payload = response.json<{ status: string; timestamp: string }>()
    expect(payload.status).toBe('ok')
    expect(() => new Date(payload.timestamp)).not.toThrow()
  })
})

/*
解説:

1) ファイル冒頭コメント
  - `/api/health` のレスポンス保証とプラグイン初期化を監視する目的を明記する。

2) import { describe, ... } / buildServer
  - Vitest の BDD API に加えて FastifyInstance 型と `buildServer` を読み込み、実サーバーを構築した上で統合テストを行う。

3) beforeAll / afterAll
  - テスト開始時にサーバーを組み立て、終了時に `server.close()` して Prisma 接続を解放する。

4) it('returns ok payload with ISO timestamp')
  - `server.inject` で `/api/health` を呼び出し、HTTP ステータスと JSON フィールド (status/timestamp) を検証する。
*/
