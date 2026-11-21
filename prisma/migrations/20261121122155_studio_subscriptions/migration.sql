-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "lastPlanReminder" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "paidUntil" DATETIME;
ALTER TABLE "Tenant" ADD COLUMN "pauseReason" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "pausedAt" DATETIME;
ALTER TABLE "Tenant" ADD COLUMN "trialEndsAt" DATETIME;

-- CreateTable
CREATE TABLE "PlatformPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "plan" TEXT NOT NULL,
    "paidUntil" DATETIME NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlatformPayment_tenantId_idx" ON "PlatformPayment"("tenantId");

-- CreateIndex
CREATE INDEX "PlatformPayment_createdAt_idx" ON "PlatformPayment"("createdAt");


-- Existing studios get a 14-day trial from this update, so nobody is paused by the release.
UPDATE "Tenant" SET "trialEndsAt" = datetime('now', '+14 days') WHERE "trialEndsAt" IS NULL;
