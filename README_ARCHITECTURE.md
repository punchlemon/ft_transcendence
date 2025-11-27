# Project Directory Architecture

本ドキュメントはディレクトリ構造を「なぜ存在するか」「何を置くか」で説明する。構成変更時は必ず更新する。

## ルート直下
- `.ai/`: AI エージェント用のルール・ループ・Git 方針・技術スタック (`tech_stack.md`)・選択モジュール表 (`selected_modules.md`) を格納。AI 作業の文脈を一元管理する場所。
- `.github/`: GitHub Actions など CI/CD 構成を保持する。`workflows/ci.yml` で backend/frontend の lint/test/build を自動実行する。
- `backend/`: Fastify + Prisma で実装する API サーバー。Dockerfile、`package.json`、`prisma/`、`src/` などバックエンド一式を収める。
- `frontend/`: Vite + React + Tailwind の SPA。`src/` 以下にページ/コンポーネント/ライブラリを配置し、Vite 設定や Tailwind 設定ファイルもここに置く。
- `docs/`: 公式課題 (`subject.md`) など要件ドキュメントを保管。要件確認やレビュー時の参照用。
- `README_ARCHITECTURE.md`: 本ファイル。構造説明の単一情報源。
- `README.md`: 起動方法や Docker Compose コマンド、ローカル開発手順をまとめたクイックスタートガイド。
- `PROJECT_MASTER.md`: エピック/タスク/進捗サマリを日本語で管理するマスタードキュメント。
- `.env` / `.env.example`: Docker Compose から共有される環境変数ファイル。本番用秘密は `.env` のみに保持し git ignore する。
- `docker-compose.yml`: backend / frontend コンテナをまとめて起動する設定。環境変数マッピングとビルド手順を記述。
- `makefile`: AI 支援ループの実行 (`make ai`, `make ai-init`) に使うツール。必要なコンテキストをクリップボードにまとめる。

## backend/
- `Dockerfile`: Node.js 18 ベースで Fastify アプリをコンテナ化。`npm ci` と Prisma 生成を実行。
- `.dockerignore`: node_modules や Prisma の生成物を除外し、ビルドコンテキストを最小化。
- `package.json` / `package-lock.json`: バックエンドの依存関係管理。Fastify, Prisma, Swagger などを定義。
- `prisma/`: `schema.prisma` とマイグレーション/データベースファイル (`dev.db`) を格納。
- `src/`: TypeScript ソースコード。
	- `app.ts`: Fastify のエントリポイント。プラグイン登録と `/api/health` を提供。
	- `plugins/db.ts`: PrismaClient を初期化し Fastify にデコレートするプラグイン。
	- `plugins/jwt.ts`: `@fastify/jwt` を登録し、JWT 発行 (`issueAccessToken`) と `authenticate` デコレーターを提供する。
- `dist/`: `tsc` ビルド成果物。コンテナ起動時に参照する。

## frontend/
- `Dockerfile`: Node.js 18 + Vite ビルド用。`npm ci` と `npm run build` を実行し静的ファイルを提供。
- `.dockerignore`: キャッシュ/ビルド生成物を除外。
- `package.json` / `package-lock.json`: React / Vite / Tailwind などの依存を管理。
- `src/`: フロントエンドの TypeScript/TSX コード。
	- `main.tsx`: React エントリポイント。`App` を `#root` にマウント。
	- `App.tsx`: ルーターと共通レイアウトを定義。
	- `pages/`: 画面単位のコンポーネント (`Home`, `HealthCheck`, `Tournament` など)。`Tournament.tsx` はエイリアス登録やマッチ進行を管理するSPAの中核画面。
	- `components/`: 再利用コンポーネント群 (今後増加予定)。`tournament/__tests__/` 配下に TournamentAliasPanel / EntryPanel / ProgressPanel の UI 単体テストを配置し、画面分割コンポーネントごとに挙動を検証する。
	- `lib/`: API クライアントなどのユーティリティ。`tournament.ts` はトーナメントのマッチキュー生成や重複チェックなどの純粋関数を集約する。
	- `index.css`: Tailwind ベーススタイル。
- `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`: ビルド/スタイル設定。
- `dist/`: `npm run build` の成果物。

## docs/
- `subject.md`: 公式課題全文。モジュールや要件の参照に必須。
- `ui/ui_design.md`: SPA 各画面のUI/状態遷移を定義する設計ドキュメント。実装前の合意形成とテスト観点の共有に使用。
- 必要に応じて追加ドキュメント (設計資料・仕様書) をここへ配置する。

## 作業ルール
- 新しいディレクトリや主要ファイルを追加したら、まず `README_ARCHITECTURE.md` を更新して役割を明記する。
- 変更に伴うタスクやステータスは `PROJECT_MASTER.md` に反映し、チーム間で最新状況を共有する。