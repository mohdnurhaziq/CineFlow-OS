-- CreateTable
CREATE TABLE "SignInHandoff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codeHash" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "activeUserId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "SignInHandoff_codeHash_key" ON "SignInHandoff"("codeHash");
