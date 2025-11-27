# Prisma Schema Draft

> Status: Design phase (not yet migrated). This document captures the relational model required to satisfy all selected ft_transcendence modules before we touch the real `schema.prisma`.

## 1. Goals & Constraints
- **Runtime**: Prisma ORM on top of **SQLite** (per selected DB module). All relations must be representable without advanced SQL features unsupported by SQLite (e.g., partial indexes).
- **Feature coverage**: Standard user management, OAuth login, JWT + 2FA, remote players, tournaments, live chat, AI opponent, notifications.
- **Guiding rules**:
  - Keep auth-critical data (`User`, `TwoFactorSecret`, `UserSession`) isolated from content tables to simplify revocations.
  - Prefer explicit join tables for many-to-many relations (friends, chat participants) to stay close to Prisma conventions.
  - Soft deletes via timestamps when history matters (e.g., messages), hard deletes elsewhere.

## 2. High-Level Model Overview
| Domain | Model | Purpose | Key Relations |
| --- | --- | --- | --- |
| Auth | `User`, `OAuthAccount`, `TwoFactorSecret`, `TwoFactorBackupCode`, `UserSession` | Account lifecycle, password/JWT/2FA handling | Sessions ↔ User, OAuthAccount ↔ User |
| Profile/Social | `UserProfile`, `FriendEdge`, `Block`, `Notification` | Display info, friendship graph, blocking, actionable notifications | Profile ↔ User, FriendEdge (self relation) |
| Tournament/Game | `Tournament`, `TournamentParticipant`, `TournamentMatch`, `GameSession`, `GamePlayer`, `GameEvent` | Orchestrate tournaments, live/remote games, AI seats | TournamentMatch ↔ GameSession |
| Chat | `ChatThread`, `ChatParticipant`, `ChatMessage`, `ChatMessageReceipt` | Live chat with invites and read receipts | Thread ↔ Participants ↔ Messages |
| Invitations | `MatchInvite`, `TournamentInvite` | Cross-feature invites surfaced in notifications/chat | Invite ↔ User |

## 3. Detailed Model Drafts
The snippets below use Prisma syntax for clarity; final types (string lengths, enums) can be tweaked during implementation.

### 3.1 Authentication & Security
```prisma
model User {
  id              Int               @id @default(autoincrement())
  email           String            @unique
  username        String            @unique
  displayName     String
  passwordHash    String
  avatarUrl       String?
  status          UserStatus        @default(OFFLINE)
  mfaEnabled      Boolean           @default(false)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  profile         UserProfile?
  oauthAccounts   OAuthAccount[]
  sessions        UserSession[]
  twoFactorSecret TwoFactorSecret?
  backupCodes     TwoFactorBackupCode[]
  friendsA        FriendEdge[]      @relation("FriendshipA")
  friendsB        FriendEdge[]      @relation("FriendshipB")
  blocksIssued    Block[]           @relation("Blocker")
  blocksReceived  Block[]           @relation("Blocked")
  notifications   Notification[]
  chatParticipants ChatParticipant[]
  chatMessages    ChatMessage[]     @relation("Author")
  tournaments     TournamentParticipant[]
  gamePlayers     GamePlayer[]
}

enum UserStatus {
  OFFLINE
  ONLINE
  IN_GAME
  DO_NOT_DISTURB
}

model OAuthAccount {
  id              Int    @id @default(autoincrement())
  provider        OAuthProvider
  providerUserId  String
  accessToken     String?
  refreshToken    String?
  expiresAt       DateTime?
  user            User   @relation(fields: [userId], references: [id])
  userId          Int

  @@unique([provider, providerUserId])
}

model OAuthState {
  id           Int      @id @default(autoincrement())
  provider     OAuthProvider
  state        String   @unique
  codeVerifier String?
  redirectUri  String
  createdAt    DateTime @default(now())
  expiresAt    DateTime

  @@index([provider, expiresAt])
}

enum OAuthProvider {
  GOOGLE
  FORTYTWO
}

- `OAuthState` は OAuth 認証開始時に生成した `state` と PKCE `codeVerifier` を 10 分間保持するワークテーブル。コールバック成功・失敗にかかわらず必ず削除し、`expiresAt < now` の行は cron かログイン処理でガーベジコレクトする。

model UserSession {
  id           Int      @id @default(autoincrement())
  user         User     @relation(fields: [userId], references: [id])
  userId       Int
  refreshToken String   @unique
  userAgent    String?
  ipAddress    String?
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  revokedAt    DateTime?
}

model TwoFactorSecret {
  id         Int      @id @default(autoincrement())
  user       User     @relation(fields: [userId], references: [id])
  userId     Int      @unique
  secret     String   // Base32 TOTP secret
  verifiedAt DateTime?
  createdAt  DateTime @default(now())
}

model TwoFactorBackupCode {
  id        Int      @id @default(autoincrement())
  user      User     @relation(fields: [userId], references: [id])
  userId    Int
  codeHash  String   // Argon2id hash of the plaintext backup code
  usedAt    DateTime?
  createdAt DateTime @default(now())

  @@unique([userId, codeHash])
  @@index([userId, usedAt])
}

model MfaChallenge {
  id        Int      @id @default(autoincrement())
  token     String   @unique
  user      User     @relation(fields: [userId], references: [id])
  userId    Int
  expiresAt DateTime
  createdAt DateTime @default(now())
  consumedAt DateTime?

  @@index([userId])
}

- バックアップコードを再生成するたびに、該当ユーザーの `TwoFactorBackupCode` レコードをすべて削除して 10 件の新しい行を挿入する。残数の計算は `usedAt IS NULL` をカウントするだけでよいため、`@@index([userId, usedAt])` が効く。

```

### 3.2 Profile & Social Graph
```prisma
model UserProfile {
  id            Int      @id @default(autoincrement())
  user          User     @relation(fields: [userId], references: [id])
  userId        Int      @unique
  bio           String?
  country       String?
  ladderPoints  Int      @default(0)
  wins          Int      @default(0)
  losses        Int      @default(0)
  longestStreak Int      @default(0)
  lastOnlineAt  DateTime?
}

model FriendEdge {
  id        Int          @id @default(autoincrement())
  requester User         @relation("FriendshipA", fields: [requesterId], references: [id])
  requesterId Int
  addressee  User         @relation("FriendshipB", fields: [addresseeId], references: [id])
  addresseeId Int
  status    FriendStatus @default(PENDING)
  createdAt DateTime     @default(now())
  respondedAt DateTime?

  @@unique([requesterId, addresseeId])
}

enum FriendStatus {
  PENDING
  ACCEPTED
  DECLINED
  BLOCKED
}

model Block {
  id          Int      @id @default(autoincrement())
  blocker     User     @relation("Blocker", fields: [blockerId], references: [id])
  blockerId   Int
  blocked     User     @relation("Blocked", fields: [blockedId], references: [id])
  blockedId   Int
  reason      String?
  createdAt   DateTime @default(now())

  @@unique([blockerId, blockedId])
}

model Notification {
  id        Int               @id @default(autoincrement())
  user      User              @relation(fields: [userId], references: [id])
  userId    Int
  type      NotificationType
  payload   Json
  actionUrl String?
  readAt    DateTime?
  createdAt DateTime          @default(now())
}

enum NotificationType {
  FRIEND_REQUEST
  FRIEND_RESPONSE
  MATCH_INVITE
  TOURNAMENT_INVITE
  CHAT_MENTION
  SYSTEM
}
```

### 3.3 Tournament & Game Flow
```prisma
model Tournament {
  id           Int                     @id @default(autoincrement())
  name         String
  status       TournamentStatus        @default(DRAFT)
  bracketType  BracketType             @default(SINGLE_ELIMINATION)
  createdBy    User                    @relation(fields: [createdById], references: [id])
  createdById  Int
  startsAt     DateTime?
  createdAt    DateTime                @default(now())
  updatedAt    DateTime                @updatedAt

  participants TournamentParticipant[]
  matches      TournamentMatch[]
}

enum TournamentStatus {
  DRAFT
  READY
  RUNNING
  COMPLETED
}

enum BracketType {
  SINGLE_ELIMINATION
  DOUBLE_ELIMINATION
}

model TournamentParticipant {
  id          Int        @id @default(autoincrement())
  tournament  Tournament @relation(fields: [tournamentId], references: [id])
  tournamentId Int
  user        User?      @relation(fields: [userId], references: [id])
  userId      Int?
  alias       String
  inviteState InviteState @default(LOCAL)
  seed        Int?
  joinedAt    DateTime    @default(now())

  @@unique([tournamentId, userId])
}

enum InviteState {
  LOCAL
  INVITED
  ACCEPTED
  DECLINED
}

model TournamentMatch {
  id             Int         @id @default(autoincrement())
  tournament     Tournament  @relation(fields: [tournamentId], references: [id])
  tournamentId   Int
  round          Int
  playerA        TournamentParticipant @relation("MatchPlayerA", fields: [playerAId], references: [id])
  playerAId      Int
  playerB        TournamentParticipant @relation("MatchPlayerB", fields: [playerBId], references: [id])
  playerBId      Int
  winner         TournamentParticipant? @relation("MatchWinner", fields: [winnerId], references: [id])
  winnerId       Int?
  scheduledAt    DateTime?
  status         MatchStatus @default(PENDING)
  gameSession    GameSession?
}

enum MatchStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

model GameSession {
  id            Int            @id @default(autoincrement())
  channelCode   String         @unique // used for /game/:id
  status        GameStatus     @default(MATCHING)
  mode          GameMode       @default(VS_REMOTE)
  bestOf        Int            @default(3)
  winningScore  Int            @default(11)
  startedAt     DateTime?
  finishedAt    DateTime?
  createdBy     User?          @relation(fields: [createdById], references: [id])
  createdById   Int?
  tournamentMatch TournamentMatch?
  players       GamePlayer[]
  events        GameEvent[]
}

enum GameStatus {
  MATCHING
  COUNTDOWN
  PLAYING
  FINISHED
}

enum GameMode {
  LOCAL
  VS_REMOTE
  VS_AI
}

model GamePlayer {
  id          Int        @id @default(autoincrement())
  game        GameSession @relation(fields: [gameId], references: [id])
  gameId      Int
  user        User?       @relation(fields: [userId], references: [id])
  userId      Int?
  slot        PlayerSlot  // LEFT, RIGHT, TOP, BOTTOM (future multi-player)
  controller  ControllerType @default(USER)
  score       Int         @default(0)
  latencyMs   Int?
}

enum PlayerSlot {
  LEFT
  RIGHT
  TOP
  BOTTOM
}

enum ControllerType {
  USER
  AI
}

model GameEvent {
  id        Int        @id @default(autoincrement())
  game      GameSession @relation(fields: [gameId], references: [id])
  gameId    Int
  frame     Int
  type      GameEventType
  payload   Json
  createdAt DateTime    @default(now())
}

enum GameEventType {
  SCORE
  PAUSE
  RESUME
  DISCONNECT
}
```

### 3.4 Chat & Invitations
```prisma
model ChatThread {
  id           Int               @id @default(autoincrement())
  kind         ThreadKind        @default(DIRECT)
  createdBy    User              @relation(fields: [createdById], references: [id])
  createdById  Int
  createdAt    DateTime          @default(now())

  participants ChatParticipant[]
  messages     ChatMessage[]
}

enum ThreadKind {
  DIRECT
  GROUP
  SYSTEM
}

model ChatParticipant {
  id        Int        @id @default(autoincrement())
  thread    ChatThread @relation(fields: [threadId], references: [id])
  threadId  Int
  user      User       @relation(fields: [userId], references: [id])
  userId    Int
  role      ChatRole   @default(MEMBER)
  joinedAt  DateTime   @default(now())
  mutedUntil DateTime?

  @@unique([threadId, userId])
}

enum ChatRole {
  MEMBER
  ADMIN
}

model ChatMessage {
  id         Int         @id @default(autoincrement())
  thread     ChatThread  @relation(fields: [threadId], references: [id])
  threadId   Int
  author     User        @relation("Author", fields: [authorId], references: [id])
  authorId   Int
  content    String
  kind       MessageKind @default(TEXT)
  invite     MatchInvite?
  createdAt  DateTime    @default(now())
  editedAt   DateTime?
  deletedAt  DateTime?
}

enum MessageKind {
  TEXT
  SYSTEM
  INVITE
}

model ChatMessageReceipt {
  id        Int         @id @default(autoincrement())
  message   ChatMessage @relation(fields: [messageId], references: [id])
  messageId Int
  user      User        @relation(fields: [userId], references: [id])
  userId    Int
  readAt    DateTime?
  deliveredAt DateTime? @default(now())

  @@unique([messageId, userId])
}

model MatchInvite {
  id         Int          @id @default(autoincrement())
  fromUser   User         @relation("InviteSender", fields: [fromUserId], references: [id])
  fromUserId Int
  toUser     User         @relation("InviteRecipient", fields: [toUserId], references: [id])
  toUserId   Int
  game       GameSession? @relation(fields: [gameId], references: [id])
  gameId     Int?
  status     InviteStatus @default(PENDING)
  expiresAt  DateTime?
  createdAt  DateTime     @default(now())

  @@index([toUserId, status])
}

model TournamentInvite {
  id             Int          @id @default(autoincrement())
  tournament     Tournament   @relation(fields: [tournamentId], references: [id])
  tournamentId   Int
  invitedUser    User         @relation(fields: [invitedUserId], references: [id])
  invitedUserId  Int
  inviter        User         @relation("TournamentInviter", fields: [inviterId], references: [id])
  inviterId      Int
  participant    TournamentParticipant? @relation(fields: [participantId], references: [id])
  participantId  Int?
  status         InviteStatus @default(PENDING)
  createdAt      DateTime     @default(now())
  respondedAt    DateTime?
}

enum InviteStatus {
  PENDING
  ACCEPTED
  DECLINED
  EXPIRED
}
```

## 4. Derived Data & Indexing Notes
- `TournamentMatch` should have an index on `(tournamentId, round)` for fetching brackets.
- `Notification` ordered by `createdAt` DESC with `readAt` IS NULL filter. Consider compound index `(userId, readAt)` once Prisma supports partials (or emulate via `readAt` null checks in queries).
- `GamePlayer` retains `latencyMs` to surface ping in UI; aggregated stats will be computed asynchronously into `UserProfile` counters via workers.
- `ChatMessage` soft delete ensures history for moderation; `ChatMessageReceipt` drives unread counts.

## 5. Open Questions / Future Decisions
1. **AI presets**: Do we need a dedicated table for AI difficulty? Optionally add `aiPreset` enum field on `GamePlayer` when implementing the AI module.
2. **History retention**: Define TTL policies for `Notification`, `MatchInvite`, and `UserSession` tables to avoid unbounded growth in SQLite.
3. **Blockchain module** (currently not selected): if later adopted, `TournamentMatch` will need hooks or additional fields to store on-chain transaction hashes.
4. **GDPR / data export**: not in scope yet; if chosen later, we may introduce `DataExportJob` table.

## 6. Next Steps
- Review this draft with the team, then translate models incrementally into `backend/prisma/schema.prisma`.
- Align API design (`docs/api/api_design.md`) with the naming here to keep DTOs close to Prisma models.
- Define seed data (admin user, demo tournament) once schema is implemented.
