import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Keywords that classify a booking category as a full production project
 * (e.g. Wedding, Commercial, Corporate Event, Film/Music Video) rather than
 * a quick in-studio session (Convocation, Raya, Headshots, Passport).
 */
const PROJECT_CATEGORY_KEYWORDS = [
  "wedding",
  "commercial",
  "event",
  "corporate",
  "film",
  "production",
  "campaign",
  "ceremony",
  "documentary",
  "music-video",
];

const LIGHTWEIGHT_CATEGORY_KEYWORDS = [
  "convo",
  "convocation",
  "raya",
  "festive",
  "portrait",
  "headshot",
  "passport",
  "mini",
];

/**
 * Determines whether a category slug or name represents a full production project.
 */
export function isProjectCategorySlug(categorySlugOrName: string): boolean {
  const norm = categorySlugOrName.toLowerCase().replace(/[^a-z0-9]/g, "-");

  // Check if it has any lightweight keyword
  const isLightweight = LIGHTWEIGHT_CATEGORY_KEYWORDS.some((kw) => norm.includes(kw));
  if (isLightweight) return false;

  // Check if it matches any project keyword
  return PROJECT_CATEGORY_KEYWORDS.some((kw) => norm.includes(kw));
}

export type ProjectKind = "SESSION" | "PRODUCTION";

/**
 * Every confirmed booking gets a project (its gallery); the category decides which kind.
 * A category the studio has set up decides by its Session / Production choice. A booking whose
 * category has no row falls back to keywords (wedding, commercial, event... -> Production;
 * convocation, portrait, Raya... -> Session).
 */
export async function projectKindForBooking(
  tx: Tx,
  booking: { tenantId: string; category: string }
): Promise<ProjectKind> {
  const category = await tx.campaignCategory.findFirst({
    where: { tenantId: booking.tenantId, slug: booking.category },
    select: { isProduction: true },
  });
  const production = category ? category.isProduction : isProjectCategorySlug(booking.category);
  return production ? "PRODUCTION" : "SESSION";
}

/**
 * Generates a unique project number (PJ-YYYY-XXXXX) for a new project.
 */
async function generateProjectNumber(tx: Tx, year: number): Promise<string> {
  let projectNumber = "";
  let attempts = 0;
  const maxAttempts = 10;

  while (!projectNumber && attempts < maxAttempts) {
    attempts++;
    const rand = Math.floor(10000 + Math.random() * 90000);
    const candidate = `PJ-${year}-${rand}`;

    const existing = await tx.project.findUnique({
      where: { projectNumber: candidate },
      select: { id: true },
    });

    if (!existing) {
      projectNumber = candidate;
    }
  }

  if (!projectNumber) {
    projectNumber = `PJ-${year}-${Date.now()}-${Math.floor(10000 + Math.random() * 90000)}`;
  }

  return projectNumber;
}

export interface ProvisionProjectResult {
  project: {
    id: string;
    projectNumber: string;
    title: string;
    status: string;
  };
  alreadyExists: boolean;
}

/**
 * Provisions a Project for a confirmed booking if one does not already exist.
 * Idempotent: if a Project is already linked to this booking, returns it.
 */
export async function provisionProjectForBooking(
  tx: Tx,
  bookingId: string,
  options?: { studioLeadId?: string }
): Promise<ProvisionProjectResult | null> {
  // 1. Check if already provisioned
  const existing = await tx.project.findFirst({
    where: { bookingId },
    select: { id: true, projectNumber: true, title: true, status: true },
  });

  if (existing) {
    return { project: existing, alreadyExists: true };
  }

  // 2. Fetch booking details
  const booking = await tx.clientBooking.findUnique({
    where: { id: bookingId },
    include: {
      slot: true,
      package: true,
      invoices: true,
    },
  });

  if (!booking) return null;

  // 3. Resolve client User ID
  let clientId = booking.userId;
  if (!clientId) {
    let clientUser = await tx.user.findFirst({
      where: { tenantId: booking.tenantId, email: booking.clientEmail },
      select: { id: true },
    });
    if (!clientUser) {
      clientUser = await tx.user.create({
        data: {
          tenantId: booking.tenantId,
          name: booking.clientName,
          email: booking.clientEmail,
          phone: booking.clientPhone,
          role: "CLIENT",
        },
        select: { id: true },
      });
    }
    clientId = clientUser.id;
    await tx.clientBooking.update({
      where: { id: booking.id },
      data: { userId: clientId },
    });
  }

  // 4. Resolve studio lead
  let studioLeadId = options?.studioLeadId;
  if (!studioLeadId) {
    const owner = await tx.user.findFirst({
      where: { tenantId: booking.tenantId, role: "STUDIO_OWNER" },
      select: { id: true },
    });
    if (owner) {
      studioLeadId = owner.id;
    } else {
      const anyStaff = await tx.user.findFirst({
        where: { tenantId: booking.tenantId },
        select: { id: true },
      });
      if (anyStaff) studioLeadId = anyStaff.id;
    }
  }

  if (!studioLeadId) {
    console.error(`Unable to provision project for booking ${bookingId}: No studio lead found`);
    return null;
  }

  // 5. Determine Project Attributes
  const year = new Date().getFullYear();
  const projectNumber = await generateProjectNumber(tx, year);
  const words = booking.category.replace(/[-_]+/g, " ").trim();
  const categoryLabel = booking.packageName || words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
  const title = `${booking.clientName} - ${categoryLabel}`;
  const budget = booking.sessionPrice ?? (booking.depositAmount > 0 ? booking.depositAmount : 0);
  const shootDates = booking.slot
    ? booking.slot.date.toISOString().slice(0, 10)
    : booking.targetDate ?? null;

  // Check if final balance is already paid
  const balanceInvoice = booking.invoices.find((i) => i.milestoneType === "BOOKING_BALANCE");
  const isFinalBalancePaid = balanceInvoice
    ? balanceInvoice.status === "PAID"
    : booking.depositPaid && budget <= booking.depositAmount;

  const kind = await projectKindForBooking(tx, booking);

  // 6. Create the Project
  const project = await tx.project.create({
    data: {
      tenantId: booking.tenantId,
      projectNumber,
      title,
      category: booking.category,
      clientId,
      studioLeadId,
      discipline: booking.discipline || "PHOTOGRAPHY",
      bookingId: booking.id,
      status: "PRE_PRODUCTION",
      kind,
      shootDates,
      budget,
      isFinalBalancePaid,
    },
  });

  // 7. Associate booking's invoices with the project
  await tx.milestoneInvoice.updateMany({
    where: { bookingId: booking.id },
    data: { projectId: project.id },
  });

  // 8. Productions get an initial call sheet for the shoot day; sessions don't use call sheets.
  const shootDay = booking.slot?.date ?? (booking.targetDate ? new Date(`${booking.targetDate}T00:00:00.000Z`) : null);
  if (kind === "PRODUCTION" && shootDay && !isNaN(shootDay.getTime())) {
    await tx.callSheet.create({
      data: {
        projectId: project.id,
        title: `${title} - Shoot Schedule`,
        shootDate: shootDay,
        generalCallTime: booking.slot?.startTime ?? "08:00 AM",
        locationName: "Main Venue / Studio Location",
        locationAddress: "To be confirmed with client",
        weatherSummary: "Production shoot schedule",
      },
    });
  }

  return { project, alreadyExists: false };
}
