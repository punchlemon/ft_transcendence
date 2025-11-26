# PROJECT_MASTER

## 進捗サマリ
- Docker / Fastify / React / Prisma の最小構成は動作確認済み。
- Prisma のバイナリ問題を解消し、バックエンド/フロントエンドともに `docker-compose up --build` で起動可能な状態を維持。
- ソースファイル末尾に日本語の解説ブロックを追加し始めた。残りの主要ファイルにも順次適用する必要がある。
- AI 支援ループに必要なルール類 (.ai ディレクトリ) を取り込み済み。`PROJECT_MASTER.md` と `.ai/tech_stack.md` を整備し、ディレクトリ構造説明 (`README_ARCHITECTURE.md`) も最新化した。

## エピックとタスク

### Epic A: インフラ・開発基盤
| 状態 | タスク | メモ |
| --- | --- | --- |
| ✅ | Docker Compose で backend/frontend を同時起動 | `node:18-bullseye` ベースで安定化済み |
| ✅ | Prisma バイナリを Linux 用に再生成 | `npx prisma generate` で `debian-openssl-1.1.x` を追加 |
| ⬜️ | ESLint / Prettier / Vitest の設定 | ルール確定後に repository へ追加 |
| ⬜️ | CI (GitHub Actions) で lint/test | lint 設定完了後に導入 |

### Epic B: ドキュメント & ナレッジ
| 状態 | タスク | メモ |
| --- | --- | --- |
| ✅ | `.ai/` ディレクトリ一式をコミット | ルール・ループ・Git方針を管理 |
| ✅ | `PROJECT_MASTER.md` 作成 | 本ファイル。進捗サマリとタスク一覧を管理 |
| ✅ | `README_ARCHITECTURE.md` で各ディレクトリの役割を説明 | ルート/ backend / frontend / docs の構造を定義 |
| ⬜️ | 主要コードファイルの解説ブロック整備 | `frontend/src/main.tsx` に追記済み。残りの画面/ユーティリティへ展開する |

### Epic C: アプリ機能 (MVP)
| 状態 | タスク | メモ |
| --- | --- | --- |
| ✅ | `/api/health` を Fastify で提供 | Swagger UI `/docs` から参照可 |
| ✅ | React + Tailwind の基本レイアウトとヘルスページ | ルーティング最小構成を実装済み |
| ⬜️ | Pong ゲームロジックの設計 | Game モジュールの要件整理から着手 |
| ⬜️ | トーナメント・マッチメイキング仕様策定 | UI/バックエンドの責務分割を定義 |
| ⬜️ | 認証/ユーザ管理モジュール検討 | OAuth 2.0 (例: 42, GitHub) を想定 |

## 次のアクション (Short-Term)
1. ESLint / Prettier / Vitest のセットアッププランをまとめ、必要な設定ファイルを追加する。
2. Pong MVP の仕様 (画面構成、エンドポイント、DB スキーマ) を PROJECT_MASTER 上で詳細化する。
3. 主要ソースファイル (frontend/main.tsx など) に解説ブロックを追加し、Epic B の残タスクを消化する。
