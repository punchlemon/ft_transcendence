import Fastify from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import cors from '@fastify/cors'
import dbPlugin from './plugins/db'

const buildServer = async () => {
  const server = Fastify({ logger: true })

  await server.register(cors, { origin: true })
  await server.register(swagger, {
    swagger: {
      info: { title: 'ft_transcendence API', version: '0.1.0' }
    }
  })
  await server.register(swaggerUi, { routePrefix: '/docs' })
  await server.register(dbPlugin)

  server.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  return server
}

const start = async () => {
  try {
    const server = await buildServer()
    const port = Number(process.env.BACKEND_PORT || 3000)
    const host = '0.0.0.0'
    await server.listen({ port, host })
    server.log.info(`Server listening on ${host}:${port}`)
  } catch (err) {
    console.error('Failed to start server', err)
    process.exit(1)
  }
}

void start()

/*
解説:

1) import Fastify ... dbPlugin
  - Fastify 本体と、Swagger / Swagger UI / CORS の公式プラグイン、および Prisma を組み込む独自プラグインを読み込む。

2) const server = Fastify({ logger: true })
  - ロガーを有効にした Fastify インスタンスを生成。以後この server に機能を追加していく。

3) await server.register(cors, { origin: true })
  - どのオリジンからでもアクセスできるように CORS を許可。Vite 開発サーバー (http://localhost:5173) からAPIを叩ける。

4) await server.register(swagger, { ... }) / swaggerUi
  - Swagger のメタ情報 (タイトル/バージョン) を登録し、Swagger UI を `/docs` で公開。ブラウザで API ドキュメントを参照できる。

5) await server.register(dbPlugin)
  - PrismaClient を初期化し、Fastify インスタンスに `prisma` プロパティを追加。以後 `server.prisma` で DB 操作が可能。

6) server.get('/api/health', ...)
  - ヘルスチェックエンドポイント。`status: 'ok'` と現在時刻を返すことでバックエンド稼働を確認する。

7) return server
  - プラグイン登録済みの Fastify インスタンスを戻し、後段の start() で使う。

8) const start = async () => { ... }
  - `buildServer()` を呼んでサーバーを取得。`.env` からポートを読み、`server.listen` で 0.0.0.0:3000 を待ち受けに設定。
  - 起動成功時はログを出力し、失敗時はエラー原因を表示してプロセスを終了。

9) void start()
  - 上記 start() を即座に実行し、アプリケーション起動フローを開始するエントリーポイント。
*/
