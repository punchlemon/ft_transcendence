-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Match" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playerAId" INTEGER,
    "playerBId" INTEGER,
    "playerAAlias" TEXT,
    "playerBAlias" TEXT,
    "winnerId" INTEGER,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" DATETIME,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "bestOf" INTEGER NOT NULL DEFAULT 3,
    "arena" TEXT,
    "config" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("arena", "bestOf", "config", "createdAt", "endedAt", "id", "mode", "playerAId", "playerBId", "scheduledAt", "startedAt", "status", "updatedAt", "winnerId") SELECT "arena", "bestOf", "config", "createdAt", "endedAt", "id", "mode", "playerAId", "playerBId", "scheduledAt", "startedAt", "status", "updatedAt", "winnerId" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE TABLE "new_MatchResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "matchId" INTEGER NOT NULL,
    "userId" INTEGER,
    "outcome" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "accuracy" REAL,
    "rallyMax" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MatchResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MatchResult" ("accuracy", "id", "matchId", "outcome", "rallyMax", "score", "userId") SELECT "accuracy", "id", "matchId", "outcome", "rallyMax", "score", "userId" FROM "MatchResult";
DROP TABLE "MatchResult";
ALTER TABLE "new_MatchResult" RENAME TO "MatchResult";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
