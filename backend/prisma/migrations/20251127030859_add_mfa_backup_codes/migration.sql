-- CreateTable
CREATE TABLE "TwoFactorBackupCode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwoFactorBackupCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TwoFactorBackupCode_userId_usedAt_idx" ON "TwoFactorBackupCode"("userId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorBackupCode_userId_codeHash_key" ON "TwoFactorBackupCode"("userId", "codeHash");
