-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TournamentMatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tournamentId" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "playerAId" INTEGER NOT NULL,
    "playerBId" INTEGER,
    "winnerId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TournamentMatch_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "TournamentParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TournamentMatch_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "TournamentParticipant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TournamentMatch_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "TournamentParticipant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TournamentMatch" ("createdAt", "id", "playerAId", "playerBId", "round", "scheduledAt", "status", "tournamentId", "winnerId") SELECT "createdAt", "id", "playerAId", "playerBId", "round", "scheduledAt", "status", "tournamentId", "winnerId" FROM "TournamentMatch";
DROP TABLE "TournamentMatch";
ALTER TABLE "new_TournamentMatch" RENAME TO "TournamentMatch";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
