-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "customDomain" TEXT,
    "discipline" TEXT NOT NULL DEFAULT 'HYBRID',
    "tagline" TEXT,
    "bio" TEXT,
    "logoUrl" TEXT,
    "brandColor" TEXT DEFAULT '#f59e0b',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "qrCodeUrl" TEXT,
    "bankDetails" TEXT,
    "releaseFilesBeforePayment" BOOLEAN NOT NULL DEFAULT false,
    "toyyibpaySecretEnc" TEXT,
    "toyyibpayCategoryCode" TEXT,
    "invoiceSeq" INTEGER NOT NULL DEFAULT 0,
    "invoiceSeqYear" INTEGER,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'PRO',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "matBoardPrice" REAL NOT NULL DEFAULT 25
);

-- CreateTable
CREATE TABLE "CampaignCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "badgeIcon" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "autoCreateProject" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CampaignCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProposalAddOnTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'fixed',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ProposalAddOnTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookingSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'STUDIO_PORTRAIT',
    "campaignTitle" TEXT,
    "date" DATETIME NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "heldUntil" DATETIME,
    "heldBySessionId" TEXT,
    "price" REAL NOT NULL DEFAULT 0.0,
    "depositRequired" REAL NOT NULL DEFAULT 50.0,
    CONSTRAINT "BookingSlot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FrameDesign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "moldingWidth" REAL NOT NULL,
    "frameColor" TEXT NOT NULL,
    "previewAsset" TEXT NOT NULL,
    "priceOffset" REAL NOT NULL DEFAULT 0.0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "FrameDesign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrintSize" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "widthInches" REAL NOT NULL,
    "heightInches" REAL NOT NULL,
    "basePrice" REAL NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PrintSize_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CLIENT',
    "passwordHash" TEXT,
    "inviteToken" TEXT,
    "inviteTokenExpires" DATETIME,
    "isQuickCreated" BOOLEAN NOT NULL DEFAULT false,
    "staffNotes" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpires" DATETIME,
    "sessionsValidAfter" DATETIME,
    "shipRecipient" TEXT,
    "shipPhone" TEXT,
    "shipLine1" TEXT,
    "shipLine2" TEXT,
    "shipPostcode" TEXT,
    "shipCity" TEXT,
    "shipState" TEXT,
    "onboardingChecklistDismissedAt" DATETIME,
    "onboardingTourSeenAt" DATETIME,
    "teamRoleId" TEXT,
    "extraAccess" TEXT,
    "deactivatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "User_teamRoleId_fkey" FOREIGN KEY ("teamRoleId") REFERENCES "TeamRole" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "proposalNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'COMMERCIAL',
    "discipline" TEXT NOT NULL,
    "basePrice" REAL NOT NULL,
    "totalPrice" REAL NOT NULL,
    "depositPercentage" REAL NOT NULL DEFAULT 50.0,
    "depositAmount" REAL NOT NULL,
    "finalBalanceAmount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "contractTerms" TEXT NOT NULL,
    "clientSignature" TEXT,
    "signedAt" DATETIME,
    "declinedAt" DATETIME,
    "declineReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Proposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Proposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Proposal_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProposalAddOn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'fixed',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProposalAddOn_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MilestoneInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "proposalId" TEXT,
    "projectId" TEXT,
    "clientId" TEXT NOT NULL,
    "milestoneType" TEXT NOT NULL,
    "description" TEXT,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "paymentProofUrl" TEXT,
    "paymentReference" TEXT,
    "verifiedBy" TEXT,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    "dueDate" DATETIME NOT NULL,
    "paidAt" DATETIME,
    "gatewayBillCode" TEXT,
    "bookingId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MilestoneInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MilestoneInvoice_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MilestoneInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MilestoneInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MilestoneInvoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ClientBooking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'STUDIO_PORTRAIT',
    "clientId" TEXT NOT NULL,
    "studioLeadId" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "proposalId" TEXT,
    "bookingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PRE_PRODUCTION',
    "kind" TEXT NOT NULL DEFAULT 'PRODUCTION',
    "shootDates" TEXT,
    "budget" REAL NOT NULL,
    "isFinalBalancePaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_studioLeadId_fkey" FOREIGN KEY ("studioLeadId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ClientBooking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallSheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shootDate" DATETIME NOT NULL,
    "generalCallTime" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "locationAddress" TEXT NOT NULL,
    "locationPinUrl" TEXT,
    "parkingNotes" TEXT,
    "hospitalName" TEXT,
    "hospitalAddress" TEXT,
    "weatherSummary" TEXT,
    "temperature" TEXT,
    "sunriseTime" TEXT,
    "sunsetTime" TEXT,
    "goldenHourMorning" TEXT,
    "goldenHourEvening" TEXT,
    "notes" TEXT,
    "crewJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShotItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sceneNumber" TEXT NOT NULL,
    "shotNumber" TEXT NOT NULL,
    "framing" TEXT NOT NULL,
    "cameraLens" TEXT NOT NULL,
    "lightingSetup" TEXT NOT NULL,
    "referenceImageUrl" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShotItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DigitalRelease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "releaseType" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signerPhone" TEXT,
    "signerRole" TEXT,
    "termsContent" TEXT NOT NULL,
    "signatureDataUrl" TEXT NOT NULL,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "collectedById" TEXT,
    "collectedByName" TEXT,
    CONSTRAINT "DigitalRelease_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientDeliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "versionTag" TEXT NOT NULL DEFAULT 'v1.0',
    "status" TEXT NOT NULL DEFAULT 'READY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientDeliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliverableItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliverableId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "previewUrl" TEXT NOT NULL,
    "downloadUrl" TEXT NOT NULL,
    "viewUrl" TEXT,
    "thumbnailUrl" TEXT,
    "resolution" TEXT,
    "duration" TEXT,
    "fileSize" TEXT,
    "isClientFav" BOOLEAN NOT NULL DEFAULT false,
    "clientNotes" TEXT,
    CONSTRAINT "DeliverableItem_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "ClientDeliverable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "serialNumber" TEXT,
    "discipline" TEXT NOT NULL DEFAULT 'UNIVERSAL',
    "category" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'EXCELLENT',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "dailyRate" REAL,
    "location" TEXT,
    CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KitBundle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "dailyRate" REAL,
    CONSTRAINT "KitBundle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KitBundleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bundleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "KitBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "KitBundle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KitBundleItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EquipmentReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    CONSTRAINT "EquipmentReservation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EquipmentReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InspectionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reservationId" TEXT NOT NULL,
    "inspectorName" TEXT NOT NULL,
    "checkoutCondition" TEXT NOT NULL,
    "checkinCondition" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InspectionLog_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "EquipmentReservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'STUDIO_PORTRAIT',
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "serviceTier" TEXT NOT NULL,
    "targetDate" TEXT,
    "creativeBrief" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "completedAt" DATETIME,
    "deliveredAt" DATETIME,
    "deliveryUrl" TEXT,
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "depositAmount" REAL NOT NULL DEFAULT 0.0,
    "packageId" TEXT,
    "packageName" TEXT,
    "sessionPrice" REAL,
    "paymentMethod" TEXT,
    "slotId" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientBooking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BookingSlot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClientBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClientBooking_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "access" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookingAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingAssignment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ClientBooking" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookingAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'STUDIO_PORTRAIT',
    "name" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "depositPrice" REAL NOT NULL DEFAULT 50.0,
    "description" TEXT NOT NULL,
    "deliverables" TEXT NOT NULL,
    "turnaround" TEXT NOT NULL,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ServicePackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShowcaseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'STUDIO_PORTRAIT',
    "title" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "coverImageUrl" TEXT NOT NULL,
    "videoEmbedUrl" TEXT,
    "galleryImages" TEXT,
    "servicePackageId" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ShowcaseItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShowcaseItem_servicePackageId_fkey" FOREIGN KEY ("servicePackageId") REFERENCES "ServicePackage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PackageIncludedPrint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageId" TEXT NOT NULL,
    "printSizeId" TEXT NOT NULL,
    "frameDesignId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "PackageIncludedPrint_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookingIncludedPrint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "printSizeId" TEXT NOT NULL,
    "frameDesignId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sizeCode" TEXT NOT NULL,
    "sizeName" TEXT NOT NULL,
    "widthInches" REAL NOT NULL,
    "heightInches" REAL NOT NULL,
    "frameName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "grantedById" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingIncludedPrint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookingIncludedPrint_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ClientBooking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrintOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "fulfilment" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientPhone" TEXT,
    "line1" TEXT,
    "line2" TEXT,
    "postcode" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Malaysia',
    "shippingZoneName" TEXT,
    "shippingFee" REAL NOT NULL DEFAULT 0,
    "itemsTotal" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "courier" TEXT,
    "trackingNumber" TEXT,
    "invoiceId" TEXT,
    "placedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrintOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrintOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrintOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrintOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "MilestoneInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrintOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bookingIncludedPrintId" TEXT,
    "deliverableItemId" TEXT,
    "photoUrl" TEXT NOT NULL,
    "photoTitle" TEXT NOT NULL,
    "orientation" TEXT NOT NULL,
    "printSizeId" TEXT NOT NULL,
    "sizeCode" TEXT NOT NULL,
    "sizeName" TEXT NOT NULL,
    "widthInches" REAL NOT NULL,
    "heightInches" REAL NOT NULL,
    "sizePrice" REAL NOT NULL,
    "frameDesignId" TEXT NOT NULL,
    "frameName" TEXT NOT NULL,
    "framePrice" REAL NOT NULL,
    "matBoardType" TEXT NOT NULL,
    "matPrice" REAL NOT NULL,
    "upgradeAmount" REAL NOT NULL,
    "lineAmount" REAL NOT NULL,
    CONSTRAINT "PrintOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PrintOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShippingZone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fee" REAL NOT NULL,
    "statesJson" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ShippingZone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_customDomain_key" ON "Tenant"("customDomain");

-- CreateIndex
CREATE INDEX "CampaignCategory_tenantId_idx" ON "CampaignCategory"("tenantId");

-- CreateIndex
CREATE INDEX "CampaignCategory_tenantId_isActive_sortOrder_idx" ON "CampaignCategory"("tenantId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCategory_tenantId_slug_key" ON "CampaignCategory"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "ProposalAddOnTemplate_tenantId_idx" ON "ProposalAddOnTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "ProposalAddOnTemplate_tenantId_isActive_idx" ON "ProposalAddOnTemplate"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "BookingSlot_tenantId_idx" ON "BookingSlot"("tenantId");

-- CreateIndex
CREATE INDEX "BookingSlot_tenantId_date_status_idx" ON "BookingSlot"("tenantId", "date", "status");

-- CreateIndex
CREATE INDEX "BookingSlot_tenantId_category_idx" ON "BookingSlot"("tenantId", "category");

-- CreateIndex
CREATE INDEX "BookingSlot_status_heldUntil_idx" ON "BookingSlot"("status", "heldUntil");

-- CreateIndex
CREATE INDEX "FrameDesign_tenantId_idx" ON "FrameDesign"("tenantId");

-- CreateIndex
CREATE INDEX "FrameDesign_tenantId_isAvailable_idx" ON "FrameDesign"("tenantId", "isAvailable");

-- CreateIndex
CREATE INDEX "PrintSize_tenantId_idx" ON "PrintSize"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintSize_tenantId_code_key" ON "PrintSize"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteToken_key" ON "User"("inviteToken");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_proposalNumber_key" ON "Proposal"("proposalNumber");

-- CreateIndex
CREATE INDEX "Proposal_tenantId_idx" ON "Proposal"("tenantId");

-- CreateIndex
CREATE INDEX "Proposal_clientId_idx" ON "Proposal"("clientId");

-- CreateIndex
CREATE INDEX "Proposal_studioId_idx" ON "Proposal"("studioId");

-- CreateIndex
CREATE INDEX "Proposal_tenantId_status_idx" ON "Proposal"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProposalAddOn_proposalId_idx" ON "ProposalAddOn"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneInvoice_gatewayBillCode_key" ON "MilestoneInvoice"("gatewayBillCode");

-- CreateIndex
CREATE INDEX "MilestoneInvoice_tenantId_idx" ON "MilestoneInvoice"("tenantId");

-- CreateIndex
CREATE INDEX "MilestoneInvoice_proposalId_idx" ON "MilestoneInvoice"("proposalId");

-- CreateIndex
CREATE INDEX "MilestoneInvoice_projectId_idx" ON "MilestoneInvoice"("projectId");

-- CreateIndex
CREATE INDEX "MilestoneInvoice_clientId_idx" ON "MilestoneInvoice"("clientId");

-- CreateIndex
CREATE INDEX "MilestoneInvoice_bookingId_idx" ON "MilestoneInvoice"("bookingId");

-- CreateIndex
CREATE INDEX "MilestoneInvoice_tenantId_status_idx" ON "MilestoneInvoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MilestoneInvoice_tenantId_milestoneType_idx" ON "MilestoneInvoice"("tenantId", "milestoneType");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneInvoice_tenantId_invoiceNumber_key" ON "MilestoneInvoice"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectNumber_key" ON "Project"("projectNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Project_proposalId_key" ON "Project"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_bookingId_key" ON "Project"("bookingId");

-- CreateIndex
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_studioLeadId_idx" ON "Project"("studioLeadId");

-- CreateIndex
CREATE INDEX "Project_bookingId_idx" ON "Project"("bookingId");

-- CreateIndex
CREATE INDEX "Project_tenantId_status_idx" ON "Project"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Project_tenantId_kind_idx" ON "Project"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "CallSheet_projectId_idx" ON "CallSheet"("projectId");

-- CreateIndex
CREATE INDEX "CallSheet_projectId_shootDate_idx" ON "CallSheet"("projectId", "shootDate");

-- CreateIndex
CREATE INDEX "ShotItem_projectId_idx" ON "ShotItem"("projectId");

-- CreateIndex
CREATE INDEX "ShotItem_projectId_sortOrder_idx" ON "ShotItem"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "ShotItem_projectId_status_idx" ON "ShotItem"("projectId", "status");

-- CreateIndex
CREATE INDEX "DigitalRelease_projectId_idx" ON "DigitalRelease"("projectId");

-- CreateIndex
CREATE INDEX "DigitalRelease_projectId_releaseType_idx" ON "DigitalRelease"("projectId", "releaseType");

-- CreateIndex
CREATE INDEX "ClientDeliverable_projectId_idx" ON "ClientDeliverable"("projectId");

-- CreateIndex
CREATE INDEX "DeliverableItem_deliverableId_idx" ON "DeliverableItem"("deliverableId");

-- CreateIndex
CREATE INDEX "DeliverableItem_deliverableId_isClientFav_idx" ON "DeliverableItem"("deliverableId", "isClientFav");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_idx" ON "InventoryItem"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_category_idx" ON "InventoryItem"("tenantId", "category");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_status_idx" ON "InventoryItem"("tenantId", "status");

-- CreateIndex
CREATE INDEX "KitBundle_tenantId_idx" ON "KitBundle"("tenantId");

-- CreateIndex
CREATE INDEX "KitBundleItem_bundleId_idx" ON "KitBundleItem"("bundleId");

-- CreateIndex
CREATE INDEX "KitBundleItem_itemId_idx" ON "KitBundleItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "KitBundleItem_bundleId_itemId_key" ON "KitBundleItem"("bundleId", "itemId");

-- CreateIndex
CREATE INDEX "EquipmentReservation_projectId_idx" ON "EquipmentReservation"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentReservation_itemId_idx" ON "EquipmentReservation"("itemId");

-- CreateIndex
CREATE INDEX "EquipmentReservation_itemId_startDate_endDate_idx" ON "EquipmentReservation"("itemId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionLog_reservationId_key" ON "InspectionLog"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientBooking_trackingCode_key" ON "ClientBooking"("trackingCode");

-- CreateIndex
CREATE UNIQUE INDEX "ClientBooking_slotId_key" ON "ClientBooking"("slotId");

-- CreateIndex
CREATE INDEX "ClientBooking_tenantId_idx" ON "ClientBooking"("tenantId");

-- CreateIndex
CREATE INDEX "ClientBooking_userId_idx" ON "ClientBooking"("userId");

-- CreateIndex
CREATE INDEX "ClientBooking_slotId_idx" ON "ClientBooking"("slotId");

-- CreateIndex
CREATE INDEX "ClientBooking_tenantId_status_idx" ON "ClientBooking"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TeamRole_tenantId_idx" ON "TeamRole"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamRole_tenantId_name_key" ON "TeamRole"("tenantId", "name");

-- CreateIndex
CREATE INDEX "BookingAssignment_userId_idx" ON "BookingAssignment"("userId");

-- CreateIndex
CREATE INDEX "BookingAssignment_tenantId_idx" ON "BookingAssignment"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAssignment_bookingId_userId_key" ON "BookingAssignment"("bookingId", "userId");

-- CreateIndex
CREATE INDEX "ServicePackage_tenantId_idx" ON "ServicePackage"("tenantId");

-- CreateIndex
CREATE INDEX "ServicePackage_tenantId_category_idx" ON "ServicePackage"("tenantId", "category");

-- CreateIndex
CREATE INDEX "ServicePackage_tenantId_isFeatured_idx" ON "ServicePackage"("tenantId", "isFeatured");

-- CreateIndex
CREATE INDEX "ServicePackage_tenantId_isActive_idx" ON "ServicePackage"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "ShowcaseItem_tenantId_idx" ON "ShowcaseItem"("tenantId");

-- CreateIndex
CREATE INDEX "ShowcaseItem_servicePackageId_idx" ON "ShowcaseItem"("servicePackageId");

-- CreateIndex
CREATE INDEX "ShowcaseItem_tenantId_category_sortOrder_idx" ON "ShowcaseItem"("tenantId", "category", "sortOrder");

-- CreateIndex
CREATE INDEX "ShowcaseItem_tenantId_isFeatured_idx" ON "ShowcaseItem"("tenantId", "isFeatured");

-- CreateIndex
CREATE INDEX "PackageIncludedPrint_packageId_idx" ON "PackageIncludedPrint"("packageId");

-- CreateIndex
CREATE INDEX "BookingIncludedPrint_tenantId_idx" ON "BookingIncludedPrint"("tenantId");

-- CreateIndex
CREATE INDEX "BookingIncludedPrint_bookingId_idx" ON "BookingIncludedPrint"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintOrder_orderNumber_key" ON "PrintOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PrintOrder_invoiceId_key" ON "PrintOrder"("invoiceId");

-- CreateIndex
CREATE INDEX "PrintOrder_tenantId_idx" ON "PrintOrder"("tenantId");

-- CreateIndex
CREATE INDEX "PrintOrder_clientId_idx" ON "PrintOrder"("clientId");

-- CreateIndex
CREATE INDEX "PrintOrder_projectId_idx" ON "PrintOrder"("projectId");

-- CreateIndex
CREATE INDEX "PrintOrder_tenantId_status_idx" ON "PrintOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PrintOrderItem_orderId_idx" ON "PrintOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "ShippingZone_tenantId_idx" ON "ShippingZone"("tenantId");

