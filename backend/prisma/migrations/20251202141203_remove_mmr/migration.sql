/*
  Warnings:

  - You are about to drop the `LadderProfile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `mmrDelta` on the `LadderEnrollment` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "LadderProfile_userId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "LadderProfile";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LadderEnrollment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ladderId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "rank" INTEGER,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    CONSTRAINT "LadderEnrollment_ladderId_fkey" FOREIGN KEY ("ladderId") REFERENCES "Ladder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LadderEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_LadderEnrollment" ("id", "joinedAt", "ladderId", "leftAt", "rank", "userId") SELECT "id", "joinedAt", "ladderId", "leftAt", "rank", "userId" FROM "LadderEnrollment";
DROP TABLE "LadderEnrollment";
ALTER TABLE "new_LadderEnrollment" RENAME TO "LadderEnrollment";
CREATE UNIQUE INDEX "LadderEnrollment_ladderId_userId_key" ON "LadderEnrollment"("ladderId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
