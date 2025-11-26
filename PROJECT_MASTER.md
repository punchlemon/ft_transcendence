# PROJECT_MASTER

## 進捗サマリ
- Docker / Fastify / React / Prisma の最小構成は動作確認済み。
- Prisma のバイナリ問題を解消し、バックエンド/フロントエンドともに `docker-compose up --build` で起動可能な状態を維持。
- ソースファイル末尾に日本語の解説ブロックを追加し始めた。残りの主要ファイルにも順次適用する必要がある。
- AI 支援ループに必要なルール類 (.ai ディレクトリ) を取り込み済み。`PROJECT_MASTER.md` と `.ai/tech_stack.md` を整備し、ディレクトリ構造説明 (`README_ARCHITECTURE.md`) も最新化した。
- ESLint / Prettier / Vitest を backend・frontend 両方に導入し、ヘルスチェック統合テストで API 応答保証までカバーした。
- GitHub Actions (ci.yml) で backend/frontend の lint・test・build を自動実行するパイプラインを追加。
- フロントエンドの Home / HealthCheck / Button / API ユーティリティに解説ブロックを追加し、Button のビジュアル一貫性を守るテストを導入した。
- backend / frontend 双方の Dockerfile を `node:18-bullseye` ベースへ差し戻し、Subject と tech_stack に沿った root ユーザー構成を維持した。
- backend 側の Vitest を 1.6 系へ固定し、CI で発生していた Vite ESM 読み込みエラーを解消した。
- CI の Node.js バージョンを 22 へ更新し、ローカル環境と統一することで SharedArrayBuffer 関連の互換性問題を解決した。
- Subject で要求されるトーナメント登録/マッチメイクの最初の UI を `Tournament` ページとして実装し、純粋関数化したロジックとユニットテストで堅牢性を担保した。
- Tournament ページの UI 操作 (登録・重複検証・進行管理) を React Testing Library で自動化し、試合完了メッセージの表示条件も修正してユーザー体験を改善した。

## エピックとタスク

### Epic A: インフラ・開発基盤
| 状態 | タスク | メモ |
| --- | --- | --- |
| ✅ | Docker Compose で backend/frontend を同時起動 | `node:18-bullseye` ベースで安定化済み |
| ✅ | Prisma バイナリを Linux 用に再生成 | `npx prisma generate` で `debian-openssl-1.1.x` を追加 |
| ✅ | ESLint / Prettier / Vitest の設定 | 両モジュールにフラット ESLint と Vitest を導入、サンプルテスト完走 |
| ✅ | CI (GitHub Actions) で lint/test | `ci.yml` で backend/frontend の lint/test/build を検証 |

### Epic B: ドキュメント & ナレッジ
| 状態 | タスク | メモ |
| --- | --- | --- |
| ✅ | `.ai/` ディレクトリ一式をコミット | ルール・ループ・Git方針を管理 |
| ✅ | `PROJECT_MASTER.md` 作成 | 本ファイル。進捗サマリとタスク一覧を管理 |
| ✅ | `README_ARCHITECTURE.md` で各ディレクトリの役割を説明 | ルート/ backend / frontend / docs の構造を定義 |
| ⬜️ | 主要コードファイルの解説ブロック整備 | `frontend/src/main.tsx` / `pages/Home` / `pages/HealthCheck` / `components/ui/Button` / `lib/api` まで対応。残りの画面/ユーティリティへ展開する |

### Epic C: アプリ機能 (MVP)
| 状態 | タスク | メモ |
| --- | --- | --- |
| ✅ | `/api/health` を Fastify で提供 | Swagger UI `/docs` から参照可 |
| ✅ | React + Tailwind の基本レイアウトとヘルスページ | ルーティング最小構成を実装済み |
| ⬜️ | Pong ゲームロジックの設計 | Game モジュールの要件整理から着手 |
| ⬜️ | トーナメント・マッチメイキング仕様策定 | UI/バックエンドの責務分割を定義 |
| ⬜️ | 認証/ユーザ管理モジュール検討 | OAuth 2.0 (例: 42, GitHub) を想定 |

## 次のアクション (Short-Term)
1. Pong MVP の仕様 (画面構成、エンドポイント、DB スキーマ) を PROJECT_MASTER 上で詳細化する。
2. 主要ソースファイル (frontend/pages 配下や `components/` / `lib/` の残り) に解説ブロックを追加し、Epic B の残タスクを消化する。
3. 認証・トーナメント機能の要件整理を進め、Epic C の設計タスクに優先順位をつける。
