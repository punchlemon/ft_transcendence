# API Design Draft

> Status: Design phase. Endpoints described here guide the Fastify controller implementation and client integration. Naming conventions align with `docs/schema/prisma_draft.md` models and `docs/ui/ui_design.md` routes.

## 0. General Conventions
- **Base URL**: `/api` (served via Fastify). Versioning is handled via `Accept-Version` header (`v1`).
- **Auth**: JWT-based bearer tokens on all protected routes. Refresh tokens managed via `/auth/refresh` and stored in `UserSession`.
- **Errors**: JSON envelope `{ error: { code, message, details? } }`. HTTP status codes follow RFC 7231.
- **Pagination**: `?page=1&limit=20`. Responses include `{ data, meta: { page, limit, total } }`.
- **WebSockets**: `/ws/game` for game state, `/ws/chat` for live chat. REST endpoints focus on configuration/storage.

## 1. Auth & User Management
### 1.1 Registration & Login
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | ❌ | Create account. |
| POST | `/auth/login` | ❌ | Email/password login. Returns access+refresh tokens. |
| POST | `/auth/oauth/:provider/callback` | ❌ | OAuth exchange (42, Google). |
| POST | `/auth/refresh` | ❌ | Refresh access token. |
| POST | `/auth/logout` | ✅ | Invalidate current session. |

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
- 認証成功時は以下を実施:
  1. Argon2id でハッシュ比較 (`passwordHash` が `null` の場合は 409 でプロフィール未初期化扱い)。
  2. `Session` テーブルへ `refresh` UUID と有効期限 (既定 7 日) を保存。`access` も暫定 UUID とするが、JWT 実装後は署名済みトークンに置換。
  3. ユーザーの `lastLoginAt` を更新し、`status` を `ONLINE` に遷移。
- エラーレスポンス:
  - `401 INVALID_CREDENTIALS`: メール/パスワード不一致。
  - `423 MFA_REQUIRED`: `twoFAEnabled = true` の場合は `mfaRequired: true` とチャレンジ ID を返し、`/auth/mfa/challenge` に誘導。
  - `400 INVALID_BODY`: バリデーション失敗。

### 1.2 Two-Factor Auth
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/auth/mfa/setup` | ✅ | Returns QR + secret for Authenticator apps. |
| POST | `/auth/mfa/verify` | ✅ | Submit TOTP to enable 2FA. |
| DELETE | `/auth/mfa` | ✅ | Disable after re-auth. |
| POST | `/auth/mfa/challenge` | ❌ | Verify OTP during login (when `mfaRequired`). Returns access + refresh tokens just like `/auth/login`. |
| GET | `/auth/mfa/backup-codes` | ✅ | Fetch/regenerate hashed backup codes. |

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
- `mutualFriends` は「リクエストしたユーザー (viewer) と結果ユーザーの両方が `status = "ACCEPTED"` な `Friendship` を持つユーザー数」を返す。
- viewer 自身や対象ユーザーはカウントに含めない。重複フレンドシップは Prisma 上も一意制約済み。
- **暫定措置**: JWT 認証が未実装なため、当面は `X-User-Id` ヘッダーの数値を viewer ID として扱う。ヘッダー未指定の場合は `mutualFriends = 0`。
- 認証モジュール導入後は、ヘッダーではなく `request.user.id` を参照するだけで計算ロジックは据え置き予定。

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
