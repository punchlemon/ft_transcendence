import path from 'node:path'
import Fastify from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import cors from '@fastify/cors'
import dbPlugin from './plugins/db'
import jwtPlugin from './plugins/jwt'
import usersRoutes from './routes/users'
import tournamentsRoutes from './routes/tournaments'
import authRoutes from './routes/auth'

if (!process.env.DATABASE_URL) {
  const sqlitePath = path.resolve(process.cwd(), 'prisma', 'dev.db')
  process.env.DATABASE_URL = `file:${sqlitePath}`
}

export const buildServer = async () => {
  const server = Fastify({ logger: true })

  await server.register(cors, { origin: true })
  await server.register(swagger, {
    swagger: {
      info: { title: 'ft_transcendence API', version: '0.1.0' }
    }
  })
  await server.register(swaggerUi, { routePrefix: '/docs' })
  await server.register(dbPlugin)
  await server.register(jwtPlugin)
  await server.register(authRoutes)
  await server.register(usersRoutes)
  await server.register(tournamentsRoutes)

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

if (process.env.VITEST !== 'true') {
  void start()
}

/*
解説:

1) import path / Fastify ... dbPlugin
  - Node.js の `path` で SQLite ファイルの絶対パスを算出し、Fastify と Swagger/CORS/Prisma プラグインを読み込む。

2) export const buildServer = async () => { ... }
  - `buildServer` をモジュール外へ公開し、テストや CLI からインスタンスを直接生成できるようにする。

3) const server = Fastify({ logger: true })
  - ロガーを有効にした Fastify インスタンスを生成。以後この server に機能を追加していく。

4) await server.register(cors, { origin: true })
  - どのオリジンからでもアクセスできるように CORS を許可。Vite 開発サーバー (http://localhost:5173) からAPIを叩ける。

5) await server.register(swagger, { ... }) / swaggerUi
  - Swagger のメタ情報 (タイトル/バージョン) を登録し、Swagger UI を `/docs` で公開。ブラウザで API ドキュメントを参照できる。

6) await server.register(dbPlugin)
  - PrismaClient を初期化し、Fastify インスタンスに `prisma` プロパティを追加。以後 `server.prisma` で DB 操作が可能。

7) server.get('/api/health', ...)
  - ヘルスチェックエンドポイント。`status: 'ok'` と現在時刻を返すことでバックエンド稼働を確認する。

8) return server
  - プラグイン登録済みの Fastify インスタンスを戻し、後段の start() で使う。

9) const start = async () => { ... }
  - `buildServer()` を呼んでサーバーを取得。`.env` からポートを読み、`server.listen` で 0.0.0.0:3000 を待ち受けに設定。
  - 起動成功時はログを出力し、失敗時はエラー原因を表示してプロセスを終了。

10) if (!process.env.DATABASE_URL) { ... }
  - 環境変数が未定義の場合でも Prisma が `prisma/dev.db` を参照できるよう、絶対パスで SQLite URL を生成してフォールバックを用意する。

11) if (process.env.VITEST !== 'true') { void start() }
  - Vitest 実行時には自動起動を抑止し、テストから `buildServer` を直接呼べるようにする。
*/
