-- Add metadata columns to Session for device management
ALTER TABLE "Session" ADD COLUMN "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "Session" ADD COLUMN "userAgent" TEXT;
