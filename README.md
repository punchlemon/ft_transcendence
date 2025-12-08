# ft_transcendence

Fastify + Prisma で実装するバックエンドと、Vite + React + Tailwind で構成されたフロントエンドから成る Pong 風 SPA プロジェクトです。Docker を前提にした単一コマンド起動と、ローカル開発の両方をサポートします。

## 必要条件
- Docker / Docker Compose
- Node.js 18 系と npm（ローカル開発を行う場合）
- `.env` にバックエンド/フロントエンドのポートや API ベース URL を設定しておくこと

## SSL証明書の準備 (Docker起動時)
本プロジェクトでは Nginx を使用して HTTPS 通信を行います。
`nginx/ssl/` ディレクトリは `.gitignore` に含まれているため、初回起動前に以下の手順で自己署名証明書を作成してください。

1. ディレクトリの作成
   ```bash
   mkdir -p nginx/ssl
   ```

2. 証明書の生成 (OpenSSL)
   ```bash
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
     -keyout nginx/ssl/nginx.key \
     -out nginx/ssl/nginx.crt \
     -subj "/C=JP/ST=Tokyo/L=Minato/O=42Tokyo/OU=Student/CN=localhost"
   ```

## 推奨起動フロー（Docker Compose）
プロジェクトルートで以下を実行すると、backend と frontend をまとめて立ち上げられます。

```bash
# ルートディレクトリで実行
docker compose up --build
```

- backend: Fastify が `BACKEND_PORT` (デフォルト 3000) で起動します（外部非公開）。
- frontend: Vite Dev Server が `FRONTEND_PORT` (デフォルト 5173) で起動します（外部非公開）。
- nginx: リバースプロキシとして 443 (HTTPS) ポートで起動し、frontend と backend への通信を振り分けます。
- 停止する際は別ターミナルで `docker compose down` を実行してください。

ブラウザで https://localhost を開いてください。
※自己署名証明書を使用しているため、警告が表示されますが続行してください。

## ローカル開発モード
Docker を使わずに確認したい場合は、2 つのターミナルを用いて手動で起動します。
※この場合、HTTPS ではなく HTTP での接続となります。

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

#### 一時コンテナ（起動後に自動で削除されるコンテナ）でテストやビルドを実行する例:

- backend を一時コンテナで実行 (lint → test → build)
```bash
docker compose run --rm backend sh -c "npx prisma generate && npm run lint && npm run test && npm run build"
```

- frontend を一時コンテナで実行 (lint → test → build)
```bash
docker compose run --rm frontend sh -c "npm run lint && npm run test && npm run build"
```

GitHub Actions (`.github/workflows/ci.yml`) でも同じ手順を行うよう構成されています。

## データベース管理 (Docker環境)
Docker で起動している場合、ホスト側のコマンドではなく、コンテナ内でコマンドを実行する必要があります。

- **マイグレーションをデータベースに適用**
```
docker compose exec backend npx prisma migrate deploy
```
- **データを全消去 (リセット)**:
  ```bash
  docker compose exec backend npm run db:reset
  ```

- **ユーザー一覧確認**:
  ```bash
  docker compose exec backend npm run db:users
  ```

## データベース管理 (ローカル開発環境)
Docker を使わず `npm run dev` で起動している場合は以下を使用します。
`backend` ディレクトリで実行してください。

- **データを全消去 (リセット)**:
  ```bash
  npm run db:reset
  ```

- **ユーザー一覧確認**:
  ```bash
  npm run db:users
  ```

## OAuth 設定
OAuth 認証（Google）を利用するには、`.env` に以下の変数を設定してください。

```env
# OAuth Configuration (Backend)
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
OAUTH_REDIRECT_WHITELIST=https://localhost/oauth/callback

# OAuth Configuration (Frontend)
VITE_OAUTH_REDIRECT_URI=https://localhost/oauth/callback
```

**重要:** Google の開発者コンソールで Web アプリ用 OAuth クライアントを作成し、`Authorized redirect URI` に `http://localhost:5173/oauth/callback` を必ず登録してください。上記プレースホルダー値のままでは Google 側で `invalid_client` エラーになります。

プロバイダを追加する場合は `backend/src/routes/auth.ts` と `frontend/src/pages/Login.tsx` を拡張してください。

## 便利なコマンド

### ログイン中のユーザー一覧を確認
現在データベース上で「ログイン中（ONLINE / IN_GAME）」と判定されているユーザーを表示します。
※ ログアウトしたはずなのに ONLINE と表示される場合は、サーバー側でセッションが正常に削除されていない可能性があります。

```bash
docker compose exec backend npm run db:users
```

### 強制ログアウト（ステータス修正）
特定のユーザーのセッションを全削除し、ステータスを OFFLINE に強制変更します。
開発中にステータスが不整合を起こした場合に使用してください。

```bash
# メールアドレスを指定して実行
docker compose exec backend npm run db:force-logout test2@test.com
```
