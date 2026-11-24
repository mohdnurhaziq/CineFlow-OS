-- CreateTable
CREATE TABLE "InviteRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "studioName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" DATETIME
);

-- CreateIndex
CREATE INDEX "InviteRequest_createdAt_idx" ON "InviteRequest"("createdAt");

-- CreateIndex
CREATE INDEX "InviteRequest_email_idx" ON "InviteRequest"("email");
