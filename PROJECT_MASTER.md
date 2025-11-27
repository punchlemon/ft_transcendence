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
- `/auth/refresh` と `/auth/logout` を実装し、セッションローテーション/失効の仕様を API 設計と統合テストへ反映。リフレッシュトークンの UUID プレースホルダーでも将来の JWT へ移行できる構造を整えた。
- `@fastify/jwt` ベースのアクセストークンを導入し、`issueAccessToken` プラグインで `userId`/`sessionId` を含む 15 分 TTL の JWT を発行。`/api/users` は Authorization ヘッダー必須に変更し、mutual friends 算出も JWT 由来の viewer ID へ移行した。
- `/api/tournaments` (POST/GET) を追加し、トーナメント作成・一覧 API と Prisma モデル/マイグレーション、統合テストを整備。
- `MfaChallenge` テーブルと `otplib` を導入し、 `/auth/mfa/setup` `/auth/mfa/verify` `/auth/mfa`(DELETE) `/auth/mfa/challenge` を Fastify ルートとして実装。TOTP による 2FA を本番ワークフローへ組み込み、統合テストでチャレンジ→トークン発行まで網羅した。
- `/auth/login` は 2FA 有効時に 423 + `challengeId` を返す JWT ベースのチャレンジ・レスポンス方式へ更新。API 設計書と Prisma スキーマ草案もアップデート済み。
- `/auth/mfa/backup-codes` を追加し、Argon2id でハッシュ化した 10 個のワンタイムコードを再生成・残数照会できるようにした。`/auth/mfa/challenge` では TOTP かバックアップコードのどちらかで認証でき、使用済みコードは DB 上で不可逆的に無効化する。
- `TwoFactorBackupCode` テーブル/リレーションを Prisma スキーマ＆マイグレーションに追加し、Vitest で 2FA + バックアップコードの統合テスト、既存 `/api/users` `/api/tournaments` のクリーンアップを調整して回帰を防止した。
- OAuth 連携に向けて `OAuthAccount`/`OAuthState` モデルとマイグレーションを追加し、Fastify ルートで PKCE 付き認可 URL 発行とコールバック処理（プロバイダトークン交換、アカウントリンク、自動セッション発行）を実装。`auth.test.ts` で undici モックを用いた統合テストを整備し、`.env.example` に必要な `OAUTH_*` 変数を定義した。
- フロントエンドに `/login` ページを追加し、メール+パスワードと OAuth (42/Google) の UI/テストを実装。`sessionStorage` へアクセストークンや `state` を保存し、バックエンドの JWT/OAuth ルートと接続した。
- **方針変更**: 実装の手戻りを防ぐため、コードを書く前に `docs/` 配下の設計ドキュメント（DBスキーマ、API仕様、UI設計）を確定させる「設計ファースト」プロセスを導入。

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
| 🔄 | **認証・ユーザー管理機能** | `/auth/register` `/auth/login` `/auth/refresh` `/auth/logout` に加え、`/auth/mfa/setup|verify|challenge|delete|backup-codes` と OAuth 認可 URL/コールバック、およびフロントエンド `/login` ページ (Vitest 付き) を実装。残課題: OAuth プロバイダ追加ガイド、セッション一覧/失効 UI、OAuth コールバック画面と 2FA ページの連携。 |
| 🔄 | **ユーザー検索 API** | `/api/users` 実装済み。mutualFriends 算出は JWT ビューア ID で動作。残課題: 認可ロール/ソート機能の拡張。 |
| 🔄 | **トーナメント API** | `/api/tournaments` (POST/GET) 実装済み。残課題: 認証・参加者編集・マッチ生成ロジック。 |
|