# Tech Stack (技術スタック)

プロジェクト全体で使用する技術要素を以下に固定する。以後の開発は本ドキュメントを唯一の参照源 (Single Source of Truth) として扱う。

## Backend
- **言語 / Runtime**: TypeScript (Node.js 22.x LTS)
- **Webフレームワーク**: Fastify 4系
- **ORM / DBアクセス**: Prisma 5系
- **データベース**: SQLite3 (ローカルファイル、`/app/prisma/dev.db`)
- **API設計**: REST (JSON)、Swagger(OpenAPI 3)で仕様公開
- **バリデーション**: Fastify組み込みのJSON Schema (必要に応じて Zod 併用)
- **認証/MFA**: Argon2id + JWT (`@fastify/jwt`) に加えて、TOTP 生成/検証は `otplib` を使用して 2FA を実装する。

## Frontend
- **ビルドツール**: Vite 5系
- **フレームワーク**: React 18 + TypeScript
- **スタイル**: Tailwind CSS 3系
- **状態管理**: React Hooksでの局所状態。グローバル状態が必要になった場合は Zustand を採用する (それ以外は禁止)。
- **通信**: Fetch API / Axios (現在は Axios)。

## Testing
- **共通テストランナー**: Vitest
- **フロントエンド**: Vitest + React Testing Library
- **バックエンド**: Vitest + Supertest (Fastify の inject() でも可)
- **E2E / ブラウザ**: Playwright (将来的に導入)
- **Lint / Format**: ESLint + Prettier (TypeScript対応設定を追加予定)

## DevOps / インフラ
- **コンテナ**: Docker / Docker Compose。Node公式 `node:18-bullseye` ベースを利用。
 - **コンテナ**: Docker / Docker Compose。Node公式 `node:22-bullseye` ベースを利用。
- **環境変数管理**: `.env` + Docker Compose でマッピング。
- **ドキュメント**: Markdown (日本語)。`README_ARCHITECTURE.md` と `PROJECT_MASTER.md` を常に更新。
- **CI/CD (予定)**: GitHub Actions で Lint / Test / Build を自動化。

## 補足ルール
- 新しいライブラリを追加する場合は本ドキュメントを先に更新し、整合性を確保する。
- 依存関係はできる限り軽量を維持し、モジュール指針に反するフレームワークは導入しない。
