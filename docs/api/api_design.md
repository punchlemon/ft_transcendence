# API Design Draft

> Status: Design phase. Endpoints described here guide the Fastify controller implementation and client integration. Naming conventions align with `docs/schema/prisma_draft.md` models and `docs/ui/ui_design.md` routes.

## 0. General Conventions
- **Base URL**: `/api` (served via Fastify). Versioning is handled via `Accept-Version` header (`v1`).
- **Auth**: JWT-based bearer tokens on all protected routes。リフレッシュトークンは `/auth/refresh` でローテーションし、`Session` テーブルに保存する。アクセス トークンは HS256 署名の JWT を採用し、`Authorization: Bearer <token>` を必須ヘッダーとする。`401 UNAUTHORIZED` のエンベロープは `{ "error": { "code": "UNAUTHORIZED", "message": "Access token is invalid" } }`。
- **Access Token Payload**: `{ "userId": number, "sessionId": number, "exp": now + 15min }`。クライアントはトークンの `userId` を viewer として扱わず、必ず API 側で `request.user.userId` を参照する。
- **Errors**: JSON envelope `{ error: { code, message, details? } }`. HTTP status codes follow RFC 7231.
- **Pagination**: `?page=1&limit=20`. Responses include `{ data, meta: { page, limit, total } }`.
- **WebSockets**: `/ws/game` for game state, `/ws/chat` for live chat. REST endpoints focus on configuration/storage.

## 1. Auth & User Management
### 1.1 Registration & Login
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | ❌ | Create account. |
| POST | `/auth/login` | ❌ | Email/password login. Returns access+refresh tokens. |
| GET | `/auth/oauth/:provider/url` | ❌ | Generate provider authorization URL + PKCE parameters. |
| POST | `/auth/oauth/:provider/callback` | ❌ | Exchange authorization code for JWT session (42, Google). |
| POST | `/auth/refresh` | ❌ | Refresh access token. |
| POST | `/auth/logout` | ✅ | Invalidate current session. |
| GET | `/auth/sessions` | ✅ | List active sessions + metadata for current user. |
| DELETE | `/auth/sessions/:sessionId` | ✅ | Revoke a specific session/device. |

**POST /auth/register**
```json
{
  "email": "user@example.com",
  "username": "pongfan",
  "password": "P@ssw0rd!",
  "displayName": "Pong Fan"
}
```
Response `201`: `{ "user": { ...basic profile... }, "tokens": { "access", "refresh" } }`

**Validation & Security Notes**
- `email`: 必須。RFC 5322 互換の形式検証を行い、正規化（小文字化）して保存する。
- `username` (＝ `login`): 3〜32 文字、英数字と `_`/`-` のみ許可。重複時は `409 USER_ALREADY_EXISTS`。
- `displayName`: 3〜32 文字、絵文字・記号も許容するが DB 制約 (unique) を超えないよう Unicode 長をチェック。
- `password`: 最低 8 文字、英字・数字を最低 1 文字ずつ含む。サーバー側で [Argon2id](https://github.com/ranisalt/node-argon2) によるハッシュ化を行い、プレーンテキストは保持しない。
- 登録時には `status = "OFFLINE"`, `profileVisibility = "PUBLIC"`, `twoFAEnabled = false` をデフォルトセットする。
- `Session` テーブルに `refresh` UUID と有効期限 (7 日) を作成し、レスポンスと同期させる。アクセストークンは JWT 実装まで暫定 UUID を返す。

**POST /auth/login**
- Request: `{ "email": string, "password": string }`
  - `email` は登録時と同様に小文字へ正規化し、`username` ログインは将来の拡張で別パラメータを受け付ける予定。
  - `password` は 128 文字以下。クライアント送信前のハッシュは禁止。
- 成功レスポンス `200`:
```json
{
  "user": { "id": 1, "displayName": "Pong Fan", "status": "ONLINE" },
  "tokens": { "access": "...", "refresh": "..." },
  "mfaRequired": false
}
```
- `tokens.access` は 15 分有効の JWT。クライアントはヘッダー `Authorization: Bearer <access>` として送信し、期限切れ時は `/auth/refresh` を呼び出す。
- 認証成功時は以下を実施:
  1. Argon2id でハッシュ比較 (`passwordHash` が `null` の場合は 409 でプロフィール未初期化扱い)。
  2. `Session` テーブルへ `refresh` UUID と有効期限 (既定 7 日) を保存し、`sessionId` を JWT のペイロードへ含める。
  3. ユーザーの `lastLoginAt` を更新し、`status` を `ONLINE` に遷移。
- エラーレスポンス:
  - `401 INVALID_CREDENTIALS`: メール/パスワード不一致。
  - `423 MFA_REQUIRED`: `twoFAEnabled = true` の場合は `mfaRequired: true` と `challengeId`（UUID v4）を返し、`/auth/mfa/challenge` に誘導。チャレンジは 5 分で失効し、成功/失敗いずれでも破棄される。
  - `400 INVALID_BODY`: バリデーション失敗。

**POST /auth/refresh**
- Request: `{ "refreshToken": string }`
  - UUID v4 形式 (36 文字) を期待。未指定や不正形式は `400 INVALID_BODY`。
  - 送信されたトークンで `Session.token` を検索し、有効期限 (`expiresAt`) が現在時刻よりも未来であることを必須とする。
  - セッションが有効な場合は **トークンをローテーション** し、新しい `token` と `expiresAt = now + 7days` を保存する。
  - レスポンス `200`:
```json
{
  "user": { "id": 1, "displayName": "Pong Fan", "status": "ONLINE" },
  "tokens": { "access": "...", "refresh": "..." }
}
```
  - `tokens.access` は常に新しい JWT に更新される（残り寿命にかかわらず 15 分で失効）。クライアントはレスポンス直後にヘッダーを差し替える。
- エラー:
  - `401 INVALID_REFRESH_TOKEN`: セッションが存在しない / 有効期限切れの場合。期限切れはサーバー側で削除してから返却する。
  - `400 INVALID_BODY`: フォーマット不正。
- 備考: JWT 導入前はボディのリフレッシュトークンのみで認証する。将来的に `Authorization: Bearer <access>` を検証し、`refreshToken` は httpOnly Cookie へ移行する予定。

**POST /auth/logout**
- Request: `{ "refreshToken": string }`
  - `Auth` 列が ✅ なのは、JWT 完了後に `access` 検証を行う想定のため。現時点では `refreshToken` を送信してもらい、該当セッションがユーザー自身であることを保証する。
- 振る舞い:
  - セッションが見つかれば `Session` レコードを削除する。
  - セッションが存在しなくても成功扱い (冪等性維持)。
- レスポンス: `204 No Content`。
- 補足: アクセストークンは即時失効しないため、クライアント側で破棄する必要がある。
- エラー: 入力バリデーション失敗のみ `400 INVALID_BODY`。それ以外は常に 204 を返し、存在しないセッションでも攻撃者が推測できないようにする。

**GET /auth/sessions**
- 認証必須。JWT ペイロードの `sessionId` と `Session` テーブルを突き合わせ、レスポンスに `current` フラグを含める。
- レスポンス `200`:
```json
{
  "sessions": [
    {
      "id": 42,
      "createdAt": "2025-11-27T02:30:00.000Z",
      "expiresAt": "2025-12-04T02:30:00.000Z",
      "lastUsedAt": "2025-11-27T03:12:00.000Z",
      "ipAddress": "203.0.113.10",
      "userAgent": "Mac OS X; Safari/17",
      "current": true
    }
  ]
}
```
- 並び順は `createdAt desc`。`ipAddress`/`userAgent` は Fastify が受信した値を 128/512 文字にトリムして保存する。
- 空配列時は「他の端末なし」表示を想定。フロントは `current` フラグで「このデバイス」バッジを描画し、他デバイスには Terminate ボタンを出す。

**DELETE /auth/sessions/:sessionId**
- 認証必須。パラメータ `sessionId` は正の整数。自身に紐づくセッションのみ削除できる。
- 成功時 `204 No Content`。対象が存在しない/権限がない場合は `404 SESSION_NOT_FOUND`。
- 現在のセッションを削除すると、以後の `/auth/refresh` が `INVALID_REFRESH_TOKEN` になるため、クライアントは `authStore.clearSession()` を呼んで即時ログアウトする必要がある。

### 1.1.1 OAuth リモート認証
**対応プロバイダ**: `fortytwo`, `google`。ルートパラメータ `:provider` は小文字。存在しないプロバイダは `404 OAUTH_PROVIDER_NOT_SUPPORTED`。

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/auth/oauth/:provider/url` | ❌ | 認可リクエスト URL と `state` / `codeChallenge` を払い出す。 |
| POST | `/auth/oauth/:provider/callback` | ❌ | 認可コードと `state` を検証し、JWT + refresh を返す。 |

**GET /auth/oauth/:provider/url**
- クエリ: `redirectUri`（必須、我々のフロントエンドでホワイトリスト登録済みドメインのみ許可）。
- サーバー処理:
  1. `OAuthState` テーブルへ `provider`, `state` (UUID v4), `codeVerifier` (43 文字ランダム), `redirectUri`, `expiresAt = now + 10min` を保存。
  2. PKCE 対応プロバイダでは `codeChallenge = base64url(sha256(codeVerifier))` を計算。42API は PKCE 非対応のため `codeChallenge` は `null` を返す。
- レスポンス `200`:
```json
{
  "authorizationUrl": "https://api.intra.42.fr/oauth/authorize?...",
  "state": "uuid",
  "codeChallenge": "abc123",
  "expiresIn": 600
}
```
- エラー: `400 INVALID_REDIRECT_URI`（ホワイトリスト外）、`500 OAUTH_STATE_PERSIST_FAILED`（DB 障害）。

**POST /auth/oauth/:provider/callback**
- リクエスト:
```json
{
  "code": "auth_code",
  "state": "uuid",
  "redirectUri": "https://app.ft/api/oauth/callback"
}
```
- バリデーション: `code` は必須 1〜512 文字、`state` は UUID v4、`redirectUri` は `GET /url` と同一である必要がある。
- サーバー処理:
  1. `OAuthState` から `state` を検索し、`expiresAt` 未経過か検証。ヒットしなければ `410 OAUTH_STATE_EXPIRED`。
  2. プロバイダ固有のトークンエンドポイントへ `code`, `redirectUri`, `clientId/secret`, 必要に応じて `codeVerifier` を送信し、アクセストークンを取得。
  3. プロバイダのユーザープロファイル API を呼び出して `providerUserId`, `email`, `displayName`, `avatarUrl` などを取得。
  4. `OAuthAccount` を `provider + providerUserId` で検索し、存在しなければ `User` を `email` で探して紐付け or 新規作成。メール重複時は既存ユーザーに OAuthAccount を追加する。新規作成時のパスワードは `null` のまま。
  5. `Session` と JWT を `/auth/login` と同じ形式で返す。
- レスポンス `200`:
```json
{
  "user": { "id": 1, "displayName": "Pong Fan", "status": "ONLINE" },
  "tokens": { "access": "...", "refresh": "..." },
  "mfaRequired": false,
  "challengeId": null,
  "oauthProvider": "fortytwo"
}
```
- エラー:
  - `410 OAUTH_STATE_EXPIRED`: state 不整合 or TTL 超過。
  - `400 INVALID_BODY`: code/state/redirectUri の形式不正。
  - `502 OAUTH_TOKEN_EXCHANGE_FAILED`: プロバイダからトークン取得に失敗。
  - `502 OAUTH_PROFILE_FETCH_FAILED`: プロファイル API から email 等が取得できなかった。
  - `409 EMAIL_IN_USE_MFA_REQUIRED`: 同一メールのユーザーが `twoFAEnabled` の場合は MFA を完了してから OAuth リンクを許可する（別途 `/auth/mfa/challenge` を使用）。

- 備考:
  - 成功/失敗いずれでも `OAuthState` レコードは削除する。
  - クライアントはリフレッシュトークンを安全に保存し、通常の `/auth/refresh` を利用する。
  - ユーザーに 2FA が有効な場合は `mfaRequired: true` と `challengeId` を返し、`tokens` は `null`。クライアントは `/auth/2fa` へ誘導し、チャレンジ完了後に JWT を取得する。

### 1.2 Two-Factor Auth
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/auth/mfa/setup` | ✅ | Returns QR + secret for Authenticator apps. |
| POST | `/auth/mfa/verify` | ✅ | Submit TOTP to enable 2FA. |
| DELETE | `/auth/mfa` | ✅ | Disable after re-auth. |
| POST | `/auth/mfa/challenge` | ❌ | Verify OTP during login (when `mfaRequired`). Returns access + refresh tokens just like `/auth/login`. |
| GET | `/auth/mfa/backup-codes` | ✅ | Fetch/regenerate hashed backup codes. |

**GET /auth/mfa/setup**
- 認証必須。`twoFAEnabled = false` のユーザーのみ利用可。既に有効な場合は `409 MFA_ALREADY_ENABLED`。
- サーバーが新しい TOTP シークレット (Base32) を生成し、`twoFASecret` に保存したうえで `secret` と `otpauthUrl`（Google Authenticator 互換）を返す。

**POST /auth/mfa/verify**
- リクエスト: `{ "code": "123456" }`。
- サーバーは `request.user.userId` の `twoFASecret` を参照し、`otplib` でトークンを検証。成功時に `twoFAEnabled = true` と `verifiedAt = now` を反映。
- エラー: `400 INVALID_MFA_CODE`（タイムウィンドウ内で一致しない）、`400 MFA_SETUP_REQUIRED`（秘密鍵未生成）。

**DELETE /auth/mfa**
- リクエスト: `{ "code": "123456" }`。直近の OTP で本人確認してから `twoFAEnabled = false` と `twoFASecret = null` に戻す。
- エラー: `409 MFA_NOT_ENABLED`、`400 INVALID_MFA_CODE`。

**GET /auth/mfa/backup-codes**
- 認証必須。クエリに `regenerate=true` を指定すると既存コードを全削除して 10 個の新しいコードを生成し、プレーンテキストを一度だけ返す。指定しない場合は残数 (`remaining`) のみ返し、平文は送らない。
- 各コードは 10 文字の英数字 (`XXXX-XXXX` 形式など) で、DB には Argon2id でハッシュ化した `TwoFactorBackupCode` を保存する。再生成時は古いコードをすべて無効化する。
- レスポンス例 (`regenerate=true`):
```json
{ "regenerated": true, "codes": ["ABCD-EFGH", "..."], "remaining": 10 }
```
- レスポンス例 (`regenerate` 未指定):
```json
{ "regenerated": false, "remaining": 7 }
```
- エラー: `409 MFA_NOT_ENABLED` (2FA が無効)、`400 INVALID_QUERY` (ブール以外)。

**POST /auth/mfa/challenge**
- リクエスト: `{ "challengeId": "uuid", "code": "123456", "backupCode": "ABCD-EFGH" }`。`code` か `backupCode` のどちらかは必須。ログイン時に 423 を受け取ったクライアントは、同じチャレンジ ID と OTP もしくはバックアップコードを提出する。
- サーバーは `MfaChallenge` テーブルから該当レコードを探し、未使用かつ `expiresAt` 内であることを確認した後、OTP を検証する。成功時はチャレンジを削除し、通常のログインと同じ `user/tokens` 形式を返す。
- バックアップコードを使う場合は `TwoFactorBackupCode` をハッシュ比較し、ヒットしたレコードの `usedAt` をセットして再利用不可にする。該当コードがすべて使い切られている場合は `409 MFA_BACKUP_CODES_EXHAUSTED`。
- エラー: `404 MFA_CHALLENGE_NOT_FOUND`、`410 MFA_CHALLENGE_EXPIRED`、`400 INVALID_MFA_CODE`。

### 1.3 User Profile & Friends
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/users/me` | ✅ | Current user profile + stats. |
| PATCH | `/users/me` | ✅ | Update display name, avatar URL, bio. |
| GET | `/users/:id` | ✅ | Public profile view. |
| POST | `/friends/:userId` | ✅ | Send friend request. |
| PATCH | `/friends/:requestId` | ✅ | Accept / decline. |
| DELETE | `/friends/:userId` | ✅ | Remove friendship. |
| POST | `/blocks/:userId` | ✅ | Block user. |
| DELETE | `/blocks/:userId` | ✅ | Unblock. |

### 1.4 User Search
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/users` | ✅ | Search users for invites/friend list. Supports pagination & filters. |

**Query Parameters**
- `q`: partial match on username/display name/email (case-insensitive).
- `status`: optional `ONLINE`, `OFFLINE`, `IN_GAME` filter.
- `page`, `limit`: pagination (defaults `page=1`, `limit=20`, capped at 50).
- `excludeFriendIds`: comma-separated IDs to omit (e.g., already invited participants).

**Response**
```json
{
  "data": [
    { "id": 10, "displayName": "Alice", "status": "ONLINE", "mutualFriends": 3 }
  ],
  "meta": { "page": 1, "limit": 20, "total": 75 }
}
```

**Mutual Friends 仕様**
- `mutualFriends` は「認証済みユーザー (JWT の `userId`) と結果ユーザーの両方が `status = "ACCEPTED"` な `Friendship` を持つユーザー数」を返す。
- viewer 自身や対象ユーザーはカウントに含めない。重複フレンドシップは Prisma 上も一意制約済み。

## 2. Tournament & Game
### 2.1 Tournament CRUD
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/tournaments` | ✅ | Create draft tournament. |
| GET | `/tournaments` | ✅ | List tournaments (filters: status, owner). |
| GET | `/tournaments/:id` | ✅ | Tournament detail (participants, matches). |
> **備考**: 参加者は `seed asc, id asc` で整列し、試合は `round asc, id asc` で返す。404 の場合は `{ error: { code: "TOURNAMENT_NOT_FOUND" } }` を返す。
| PATCH | `/tournaments/:id` | ✅ | Update name, start time, bracket type. |
| POST | `/tournaments/:id/publish` | ✅ | Move from draft → ready. |

### 2.2 Participants & Invitations
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/tournaments/:id/participants` | ✅ | Add local alias or invite registered user. |
| PATCH | `/tournaments/:id/participants/:participantId` | ✅ | Update alias or seed. |
| DELETE | `/tournaments/:id/participants/:participantId` | ✅ | Remove participant. |
| POST | `/tournaments/:id/invites` | ✅ | Invite existing user (`{"userId":1}`). |
| PATCH | `/tournament-invites/:inviteId` | ✅ | Accept/decline invitation. |

### 2.3 Match Flow
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/tournaments/:id/seed` | ✅ | Generate bracket (`buildMatchQueue`). |
| POST | `/matches/:id/start` | ✅ | Create `GameSession` + channel code. |
| POST | `/matches/:id/report` | ✅ | Submit winner + score. |
| GET | `/matches/:id` | ✅ | Match detail + associated game session. |

### 2.4 Game Sessions
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/games` | ✅ | Create ad-hoc game (local, remote, vs AI). |
| GET | `/games/:id` | ✅ | Status / participants for lobby view. |
| PATCH | `/games/:id` | ✅ | Update state (pause, surrender). |
| POST | `/games/:id/rematch` | ✅ | Reuse participants to create new session. |

**POST /games request body**
| Mode | Required Payload |
| --- | --- |
| LOCAL | `{ "mode": "LOCAL", "bestOf": 3, "winningScore": 11 }` |
| VS_REMOTE | `{ "mode": "VS_REMOTE", "opponentId": 123, "bestOf": 5, "latencyBudgetMs": 120 }` |
| VS_AI | `{ "mode": "VS_AI", "difficulty": "HARD", "bestOf": 3 }` |

Common optional fields: `mapTheme` (future), `spectatorAllowed` (bool). Validation ensures `opponentId` references an online friend or matchmaking queue entry.

## 3. Chat & Notifications
### 3.1 Chat Threads
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/chat/threads` | ✅ | List DM/group threads. |
| POST | `/chat/threads` | ✅ | Create DM or group thread. |
| GET | `/chat/threads/:id/messages` | ✅ | Paginated messages. |
| POST | `/chat/threads/:id/messages` | ✅ | Send message (text or invite payload). |
| PATCH | `/chat/messages/:id` | ✅ | Edit or soft delete own message. |

### 3.2 Read Receipts & Presence
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/chat/messages/:id/read` | ✅ | Mark as read (updates `ChatMessageReceipt`). |
| GET | `/presence` | ✅ | Returns friend presence map + current game sessions. |

### 3.3 Notifications
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/notifications` | ✅ | List unread/read notifications (filters). |
| PATCH | `/notifications/:id/read` | ✅ | Mark notification as read. |

> **Note**: Notifications are informational. Clients must call the underlying resource endpoints (e.g., `PATCH /match-invites/:id`, `PATCH /friends/:requestId`) using IDs embedded in the notification payload rather than POSTing to `/notifications/:id/act`.

## 4. Invites & Matchmaking
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/game/invite` | ✅ | Send invite `{ targetUserId }`. Returns `{ sessionId }`. |
| POST | `/match-invites` | ✅ | Send invite `{ toUserId, mode, gameId? }`. |
| PATCH | `/match-invites/:id` | ✅ | Accept/decline. |
| GET | `/matchmaking/queue` | ✅ | Poll own queue status (matching, matched, cancelled). |
| DELETE | `/matchmaking/queue` | ✅ | Cancel matchmaking. |

## 5. Admin / Misc
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | ❌ | Already implemented. |
| GET | `/stats/leaderboard` | ✅ | Ladder leaderboard (top 100). |
| GET | `/stats/me` | ✅ | Personal stats (supports dashboards). |

## 6. Request/Response Schemas (Selected)
Below are JSON schemas for frequently used payloads.

### 6.1 Tournament Detail (GET `/tournaments/:id`)
```json
{
  "id": 42,
  "name": "Sunday Cup",
  "status": "RUNNING",
  "bracketType": "SINGLE_ELIMINATION",
  "participants": [
    { "id": 1, "alias": "Alice", "userId": 10, "inviteState": "ACCEPTED" }
  ],
  "matches": [
    {
      "id": 55,
      "round": 1,
      "playerA": { "participantId": 1, "alias": "Alice" },
      "playerB": { "participantId": 2, "alias": "Bob" },
      "status": "IN_PROGRESS",
      "gameSession": {
        "id": 777,
        "channelCode": "ABCD1234",
        "mode": "VS_REMOTE",
        "status": "PLAYING"
      }
    }
  ]
}
```

### 6.2 Chat Message Payload
```json
{
  "id": 999,
  "threadId": 12,
  "author": { "id": 10, "displayName": "Alice" },
  "content": "GG next round?",
  "kind": "TEXT",
  "invite": null,
  "createdAt": "2025-11-25T10:00:00Z"
}
```

### 6.3 Notification Payload
```json
{
  "id": 321,
  "type": "MATCH_INVITE",
  "payload": {
    "inviteId": 88,
    "from": { "id": 12, "displayName": "Bob" },
    "gameId": 777
  },
  "actionUrl": "/game/ABCD1234",
  "read": false,
  "createdAt": "2025-11-25T11:00:00Z"
}
```

## 7. Security & Validation Notes
- All write endpoints validate ownership (e.g., only tournament owners can seed or publish).
- Rate limiting applied to auth endpoints (`/auth/login`, `/matchmaking/queue`).
- WebSocket channels require a short-lived token minted via `/games/:id/token` (future enhancement).

## 8. Outstanding Questions
1. **AI opponent tuning**: Will AI difficulty be selectable per game? If so, extend `/games` payload.
2. **Blockchain module**: not active yet; if added, need `/tournaments/:id/report` to push results on-chain and return tx hash.
3. **GDPR/export**: once module selected, add `/users/me/export` and `/users/me/delete` endpoints.

---
This draft will evolve alongside `docs/schema/prisma_draft.md`. Any schema change must be reflected here to keep contracts consistent.
