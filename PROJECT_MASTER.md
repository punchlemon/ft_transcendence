# PROJECT_MASTER

## 進捗サマリ
- **ステータス**: Phase 1 (Foundation) 完了 → Phase 2 (Design & Core Logic) へ移行中
- Docker / Fastify / React / Prisma の最小構成は動作確認済み。
- Prisma のバイナリ問題を解消し、バックエンド/フロントエンドともに `docker-compose up --build` で起動可能な状態を維持。
- ソースファイル末尾に日本語の解説ブロックを追加し始めた。残りの主要ファイルにも順次適用する必要がある。
- AI 支援ループに必要なルール類 (.ai ディレクトリ) を取り込み済み。
- ESLint / Prettier / Vitest を導入し、CI (GitHub Actions) での自動テストパイプラインを構築済み。
- フロントエンドの基盤コンポーネント（Button等）とHealthCheckページの実装・テストが完了。
- `docs/ui/ui_design.md` に Home / HealthCheck / Tournament の状態遷移とテスト観点を整理し、UI 変更前の合意形成プロセスを整備した。
- 同 UI 設計書にサイトマップ / Layout / Auth / Profile / Game / Chat の骨格を追記し、選択モジュール要件を満たすための画面・導線を明文化した。
- `docs/schema/prisma_draft.md` を追加し、User / Tournament / Game / Chat など全ドメインの Prisma モデル草案を確定。
- `backend/prisma/schema.prisma` を草案に沿って大幅拡張（SQLite 制約に合わせ enum / JSON は String 保存へ変更）し、Prisma Client を再生成。
- `docs/api/api_design.md` に REST + WS エンドポイント、リクエスト/レスポンス例、通知フローを整理。
- `docs/game/pong_logic.md` でサーバ権威の Pong ループ・WebSocket イベント・AI (1 Hz 視界制約) のロジックを設計。
- `/api/users` 検索エンドポイントを Fastify + Prisma で実装し、ページング・フィルタ・除外 ID をサポートする統合テストを追加。mutualFriends は `Friendship` から算出し、暫定的に `X-User-Id` ヘッダーを viewer ID として扱う仕様を確立。
- `/auth/register` を実装し、Zod バリデーション・Argon2id ハッシュ化・UUID ベース仮トークンを返す Fastify ルートと統合テストを追加。API設計書に検証ルールを反映。
- `/auth/login` を実装し、Argon2id 検証・`Session` テーブルへのリフレッシュトークン保存・ユーザーステータス更新・統合テストを追加。MFA フローは後続タスクとして `MFA_REQUIRED` エラーを返す。
- `/api/tournaments` (POST/GET) を追加し、トーナメント作成・一覧 API と Prisma モデル/マイグレーション、統合テストを整備。
- `/api/tournaments/:id` で参加者・試合詳細を返すエンドポイントと統合テストを追加し、UI 設計書のコンポーネント要件と整合させた。
- HealthCheck ページに Vitest + React Testing Library でローディング/成功/失敗/導線を検証する UI テストを追加した。
- Tournament ページの `TournamentAliasPanel` / `TournamentEntryPanel` / `TournamentProgressPanel` に対する React Testing Library + Vitest の単体テストを追加し、フォーム/一覧/進行カードの各状態を自動検証できるようにした。
- GitHub Actions の backend ジョブに Prisma マイグレーション実行と SQLite `DATABASE_URL=file:./prisma/dev.db` 設定を追加し、CI でもテスト用テーブルが確実に生成されるようにした。
- **方針変更**: 実装の手戻りを防ぐため、コードを書く前に `docs/` 配下の設計ドキュメント（DBスキーマ、API仕様、UI設計）を確定させる「設計ファースト」プロセスを導入。

## エピックとタスク

### Epic A: インフラ・開発基盤
| 状態 | タスク | メモ |
| :---: | --- | --- |
| ✅ | Docker Compose で backend/frontend を同時起動 | `node:22-bullseye` ベース |
| ✅ | Prisma バイナリを Linux 用に再生成 | `debian-openssl-1.1.x` |
| ✅ | ESLint / Prettier / Vitest の設定 | 共通化完了 |
| ✅ | CI (GitHub Actions) で lint/test | `ci.yml` 稼働中 |
| 🔄 | 主要コードファイルの解説ブロック整備 | `frontend/src/main.tsx`, `pages/*` 等進行中。残りは都度対応 |

### Epic B: 詳細設計 (Design Phase) 🚀 Current Focus
*実装前にここを確定させることで、AIの実装精度を最大化する*

| 状態 | タスク | メモ |
| :---: | --- | --- |
| ✅ | **DBスキーマ設計** | `docs/schema/prisma_draft.md` 作成済み。User, Game, Friend 等のリレーション定義と未決事項を明文化。 |
| ✅ | **APIインターフェース設計** | `docs/api/api_design.md` 作成済み。エンドポイント、Req/Res 型、通知ポリシーを定義。 |
| 🔄 | **UIコンポーネント設計** | `docs/ui/ui_design.md` にサイトマップ / Layout / Auth / Profile / Game / Chat を追記済み。今後の画面詳細・テスト観点を継続精緻化。 |
| ✅ | **ゲームロジック設計** | `docs/game/pong_logic.md` 作成済み。ステート管理、WebSocket 通信、AI 1Hz 視界制約を設計。 |

### Epic C: アプリ機能実装 (Implementation Phase)
*Epic B の設計承認後に着手*

| 状態 | タスク | メモ |
| :---: | --- | --- |
| ✅ | `/api/health` 実装 & テスト | 疎通確認用 |
| 🔄 | **認証・ユーザー管理機能** | `/auth/register` `/auth/login` を実装。残課題: セッション失効/更新・2FA・OAuth。 |
| 🔄 | **ユーザー検索 API** | `/api/users` 実装済み。mutualFriends 算出完了。残課題: 認証実装とトークン連携。 |
| 🔄 | **トーナメント API** | `/api/tournaments` (POST/GET) 実装済み。残課題: 認証・参加者編集・マッチ生成ロジック。 |
|