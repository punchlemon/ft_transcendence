# ft_transcendence

Fastify + Prisma で実装するバックエンドと、Vite + React + Tailwind で構成されたフロントエンドから成る Pong 風 SPA プロジェクトです。Docker を前提にした単一コマンド起動と、ローカル開発の両方をサポートします。

## 必要条件
- Docker / Docker Compose
- Node.js 18 系と npm（ローカル開発を行う場合）
- `.env` にバックエンド/フロントエンドのポートや API ベース URL を設定しておくこと

## 推奨起動フロー（Docker Compose）
プロジェクトルートで以下を実行すると、backend と frontend をまとめて立ち上げられます。

```bash
# ルートディレクトリで実行
docker compose up --build
```

- backend: Fastify が `BACKEND_PORT` (デフォルト 3000) で起動します。
- frontend: Vite Dev Server が `FRONTEND_PORT` (デフォルト 5173) で起動し、`/api` 経由で backend にアクセスします。
- 停止する際は別ターミナルで `docker compose down` を実行してください。

## ローカル開発モード
Docker を使わずに確認したい場合は、2 つのターミナルを用いて手動で起動します。

```bash
# ターミナル1 (backend)
cd backend
npm install
npm run dev

# ターミナル2 (frontend)
cd frontend
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開き、`Home` / `Health` ページからバックエンドの `/api/health` 動作を確認できます。

## テスト / Lint / Build
- backend: `npm run lint`, `npm run test`, `npm run build`
- frontend: `npm run lint`, `npm run test`, `npm run build`

GitHub Actions (`.github/workflows/ci.yml`) でも同じ手順を行うよう構成されています。
