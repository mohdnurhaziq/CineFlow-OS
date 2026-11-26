-- AlterTable
ALTER TABLE "InviteRequest" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "InviteRequest" ADD COLUMN "decidedAt" DATETIME;
ALTER TABLE "InviteRequest" ADD COLUMN "inviteTokenHash" TEXT;
ALTER TABLE "InviteRequest" ADD COLUMN "inviteExpiresAt" DATETIME;
ALTER TABLE "InviteRequest" ADD COLUMN "invitedByEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InviteRequest" ADD COLUMN "joinedAt" DATETIME;
ALTER TABLE "InviteRequest" ADD COLUMN "joinedTenantSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InviteRequest_inviteTokenHash_key" ON "InviteRequest"("inviteTokenHash");
