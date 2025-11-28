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
- トーナメント UI コンポーネント (Alias/Entry/Progress) と `TournamentPage` の Vitest を実行し、想定ユースケース (登録・削除・重複検知・マッチ進行) が全てグリーンであることを確認した。新たにボタン活性制御（参加者 2 名未満時の生成禁止）と BYE → リセットフローの UI テストも追加し、画面上の警告/完了メッセージまで検証範囲を拡張した。
- トーナメント管理ページに `localStorage` 永続化を実装し、ページリロード後も参加者/マッチキュー/進行状況を復元できるようにした。保存・復元の UI テストを追加して、シリアライズ形式の破損検知や info メッセージの一貫性を担保。React StrictMode で副作用が二重実行されてもデータが消えないようハイドレーションフラグを導入し、対応するテスト (StrictMode ダブルレンダー) も追加。
- **方針変更**: 実装の手戻りを防ぐため、コードを書く前に `docs/` 配下の設計ドキュメント（DBスキーマ、API仕様、UI設計）を確定させる「設計ファースト」プロセスを導入。
- フロントエンドに Zustand ベースの `authStore` を追加し、ログイン成功時のユーザースナップショット/トークン保存と、アプリ起動時の自動ハイドレーションを実現。`App` ナビゲーションからログアウトできるようにし、`Login` / `App` / `authStore` の各テストを整備した。
- `/auth/2fa` (MFA チャレンジ) ページを追加し、TOTP/バックアップコード送信で `submitMfaChallenge` → `authStore` を更新するフローと UI テストを実装。`Login` から 2FA 画面への導線も整備した。
- `/oauth/callback` ページを追加し、`completeOAuthCallback` API / OAuth コンテキストヘルパー (`lib/oauth.ts`) / 画面テストを実装。state/provider を検証し、成功時は `authStore` を更新、`mfaRequired` 時はチャレンジIDを保存して `/auth/2fa` に誘導するフローを確立した。
- `frontend/src/lib/api.ts` に axios リクエストインターセプタを追加し、Zustand `authStore` または `sessionStorage` からアクセストークンを読み出して全 API 呼び出しへ Authorization ヘッダーを自動付与する仕組みを導入。テスト (`frontend/src/lib/api.test.ts`) でヘッダー注入とトークン欠如時のフォールバックを検証し、`authStore.ts` へ `readAccessTokenFromStorage` ヘルパーを公開した。
- `frontend/src/pages/Profile.tsx` を実装し、ユーザー情報・戦績・対戦履歴・フレンドリストを表示する UI を作成。`useParams` で ID を取得し、モックデータを用いてローディング/エラー/成功状態を表現した。
- `frontend/src/pages/Profile.test.tsx` を追加し、プロフィールのレンダリング、自身のプロフィールでの「編集」ボタン表示、他人のプロフィールでの非表示、エラーハンドリングをテストした。
- `App.tsx` に `/profile/:id` ルートを追加し、ナビゲーションを有効化した。
- `frontend/src/pages/GameLobby.tsx` を実装し、Local/Remote/AI モード選択、Remote 時の Public/Private オプション、マッチング待機画面を作成した。
- `frontend/src/pages/GameLobby.test.tsx` を追加し、モード選択による UI 変化、Start ボタンの活性制御、マッチング待機・キャンセル動作を検証した。
- `App.tsx` に `/game/new` ルートとナビゲーションリンクを追加した。
- `frontend/src/pages/GameRoom.tsx` を実装し、Canvas による Pong ゲーム描画、スコア表示、Pause/Resume/Surrender 機能を実装した。
- `frontend/src/pages/GameRoom.test.tsx` を追加し、Canvas レンダリング、接続ステータス遷移、Pause トグル、Surrender 遷移を検証した。
- `App.tsx` に `/game/:id` ルートを追加した。
- `frontend/src/components/chat/ChatDrawer.tsx` を実装し、折りたたみ可能なチャットドロワー、スレッド一覧、メッセージ送受信（モック）、タブ切り替えを作成した。
- `frontend/src/components/chat/ChatDrawer.test.tsx` を追加し、開閉動作、メッセージ送信、画面遷移を検証した。
- `App.tsx` に `ChatDrawer` を追加し、ログイン時のみ表示されるようにした。

### Epic A: インフラ・開発基盤
| 状態 | タスク | メモ |
| :---: | --- | --- |
| ✅ | Docker Compose で backend/frontend を同時起動 | `node:22-bullseye` ベース |
| ✅ | Prisma バイナリを Linux 用に再生成 | `debian-openssl-1.1.x` |
| ✅ | ESLint / Prettier / Vitest の設定 | 共通化完了 |
| ✅ | CI (GitHub Actions) で lint/test | `ci.yml` 稼働中 |
| 🔄 | 主要コードファイルの解説ブロック整備 | `frontend/src/main.tsx`, `pages/*` 等進行中。残りは都度対応 |

### Epic B: 詳細設計 (Design Phase)
*実装前にここを確定させることで、AIの実装精度を最大化する*

| 状態 | タスク | メモ |
| :---: | --- | --- |
| ✅ | **DBスキーマ設計** | `docs/schema/prisma_draft.md` 作成済み。User, Game, Friend 等のリレーション定義と未決事項を明文化。 |
| ✅ | **APIインターフェース設計** | `docs/api/api_design.md` 作成済み。エンドポイント、Req/Res 型、通知ポリシーを定義。 |
| ✅ | **UIコンポーネント設計** | `docs/ui/ui_design.md` にサイトマップ / Layout / Auth / Profile / Game / Chat を追記済み。Auth セクションへ `authStore` とセッション再開フローも追加し、画面詳細・テスト観点を継続精緻化。 |
| ✅ | **ゲームロジック設計** | `docs/game/pong_logic.md` 作成済み。ステート管理、WebSocket 通信、AI 1Hz 視界制約を設計。 |

### Epic C: アプリ機能実装 (Implementation Phase) 🚀 Current Focus
*Epic B の設計承認後に着手*

| 状態 | タスク | メモ |
| :---: | --- | --- |
| ✅ | `/api/health` 実装 & テスト | 疎通確認用 |
| 🔄 | **認証・ユーザー管理機能** | `/auth/register` `/auth/login` `/auth/refresh` `/auth/logout` に加え、`/auth/mfa/setup|verify|challenge|delete|backup-codes` と OAuth 認可 URL/コールバック、およびフロントエンド `/login` `/auth/2fa` `/oauth/callback` ページ (Vitest 付き) を実装。Zustand `authStore` によるセッション復元と `App` ナビバーのログアウトボタンを追加済み。残課題: OAuth プロバイダ追加ガイド、セッション一覧/失効 UI。 |
| 🔄 | **ユーザー検索 API** | `/api/users` 実装済み。mutualFriends 算出は JWT ビューア ID で動作。残課題: 認可ロール/ソート機能の拡張。 |
| ✅ | **トーナメント API** | `/api/tournaments` (POST/GET) 実装済み。バックエンドでのマッチ生成ロジックを追加し、フロントエンドと統合完了。 |

## Next Actions
- [x] **Profile Edit API**: Implement `PATCH /api/users/:id` for updating displayName, bio, avatarUrl.
- [x] **Profile Edit UI**: Implement `EditProfileModal` in frontend and integrate with API.
- [x] **Session Management UI**: Implement `/settings/account` active sessions list.
- [x] **User Search Improvements**: Add sorting/filtering to `/api/users` and create `/users` page.
- [x] **Game Logic Implementation**: Implement full Pong logic in `GameEngine` and integrate with WebSocket.
- [x] **AI Opponent Implementation**: Implement 1Hz vision constraint AI in `GameEngine`.
- [x] **Game UI Polish**: Improve `GameRoom` UI, handle game over state, and add sound effects/animations.

## Current Focus: Completion

### Next Actions
- [ ] **Release**
    - [ ] Deploy to production environment (if applicable).
    - [ ] Final presentation preparation.

### Completed Tasks
- [x] **Final Polish**
    - [x] Verify all "Remaining" items in Epic C are actually covered.
    - [x] Ensure no critical bugs in main flows (Login -> Game -> Stats).
    - [x] Add OAuth configuration guide to README.
- [x] **Verification**
    - [x] Backend Tests: 100% Passing (68/68)
    - [x] Frontend Tests: 100% Passing (74/74)
    - [x] Fix `users_id.test.ts` (FriendRequest model usage)
    - [x] Fix `App.test.tsx` (Navbar text update)
    - [x] Fix `Tournament.test.tsx` (Router context)
- [x] **Fix TODOs**
    - [x] Backend: Fix `startedAt` timestamp in `GameManager` (currently uses end time).
    - [x] Backend: Optimize channel membership check in `chatRoutes`.
- [x] **Chat Game Invite**
    - [x] Frontend: Add "Invite" action in Chat user menu
- [x] **Game Polish**
    - [x] Add sound effects (optional)
    - [x] Improve "Game Over" screen with "Rematch" option?
- [x] **Documentation**
    - [x] Update API docs with new endpoints
    - [x] Update UI docs with new screens
- [x] **Game Invitation System**
    - [x] Backend: Implement `POST /api/game/invite` (Create session + Send Notification)
    - [x] Frontend: Add "Invite to Game" button in Profile
    - [x] Frontend: Handle `GAME_INVITE` notification click (Join session)
- [x] **Tournament Game Integration**
    - [x] Backend: Support `mode=local` for single-socket multiplayer
    - [x] Frontend: Add "Play Match" button in Tournament Page
    - [x] Frontend: `GameRoom` supports local 2-player input (WASD + Arrows)
- [x] **Notification System**
    - [x] Backend: `NotificationService` & WebSocket integration
    - [x] Frontend: `NotificationStore` & `NotificationBell` component
    - [x] REST endpoints for listing/marking read
- [x] **Game Engine & Logic**
    - [x] Core Loop (120Hz), Physics, Collision
    - [x] WebSocket State Sync (`/ws/game`)
    - [x] Database Integration (Save Match/Stats)
    - [x] AI Opponent (1Hz vision)
- [x] **Game Frontend**
    - [x] `GameRoom` with Canvas rendering
    - [x] Player Slot identification (You vs Opponent)
    - [x] Game Over / Score UI
- [x] **Chat & Social Features**
    - [x] Real-time Chat (Backend & Frontend)
    - [x] Friend System (Backend & Frontend)
    - [x] User Status (Online/Offline)
    - [x] Friend/Block UI in Profile
- [x] **User Search Implementation**
    - [x] Implement backend sorting/filtering
    - [x] Create `Users` page with search/sort UI
|