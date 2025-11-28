import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'
import { FastifyPluginAsync } from 'fastify'
import { prisma } from '../utils/prisma'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  await prisma.$connect()

  fastify.decorate('prisma', prisma)

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
}

export default fp(dbPlugin)

/*
解説:

1) import fp ... FastifyPluginAsync
  - `fastify-plugin` を使うことでプラグインを一度だけ初期化できるようにする。
  - PrismaClient 型と Fastify 用のプラグイン型を読み込む。

2) declare module 'fastify' { ... }
  - FastifyInstance に `prisma` プロパティを追加する型拡張。以後 `server.prisma` の参照で型エラーが出ない。

3) const dbPlugin = async (fastify) => { ... }
  - PrismaClient を生成し、DB に接続。接続済みクライアントを Fastify に `decorate` して共有する。

4) fastify.addHook('onClose', ...)
  - サーバー終了時に PrismaClient の接続をクリーンに切断。ホットリロードやテスト時の資源リークを防ぐ。

5) export default fp(dbPlugin)
  - Fastify が理解できる形式でプラグインをエクスポート。`server.register(dbPlugin)` で利用できる。
*/
