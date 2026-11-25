-- CreateTable
CREATE TABLE "Login" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleSub" TEXT,
    "sessionsValidAfter" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "loginId" TEXT REFERENCES "Login" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Login_email_key" ON "Login"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Login_googleSub_key" ON "Login"("googleSub");

-- CreateIndex
CREATE INDEX "User_loginId_idx" ON "User"("loginId");
