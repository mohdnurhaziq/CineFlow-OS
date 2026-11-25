import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { liveProjectWhere } from "@/lib/projects/list";
import { expireUnpaidDeposits } from "@/lib/bookings/expiry";
import { getCurrentUser } from "@/lib/auth/session";
import { ClientDashboard } from "@/components/account/client-dashboard";
import { OneLoginInvite } from "@/components/auth/one-login-invite";
import { PaymentConfirmationBanner } from "@/components/checkout/payment-confirmation-banner";
import { loadBookingConfirmation } from "@/lib/payments/confirmation";
import { loadFramedPrints } from "@/lib/prints/gallery";
import { printsOffered } from "@/lib/billing/guard";
import { clientVisibleProposalWhere } from "@/lib/proposals/status";
import { studioPath } from "@/lib/domain-name";

interface AccountPageProps {
  params: Promise<{ tenantSlug: string }>;
  /** `confirmed`: tracking code of a booking just made at checkout, to show its confirmation. */
  searchParams: Promise<{ tab?: string; confirmed?: string }>;
}

export const metadata: Metadata = {
  title: "My Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ClientAccountPage({ params, searchParams }: AccountPageProps) {
  const { tenantSlug } = await params;
  const { confirmed } = await searchParams;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true, currency: true, releaseFilesBeforePayment: true },
  });
  if (!tenant) notFound();

  const session = await getCurrentUser();
  if (!session) redirect(studioPath(tenant.slug, `/login?callbackUrl=${encodeURIComponent(studioPath(tenant.slug, "/account"))}`));

  // Studio staff belong in the admin console, not the client dashboard.
  if (session.role !== "CLIENT") redirect(studioPath(tenant.slug, "/admin"));
  if (session.tenantId !== tenant.id) redirect(studioPath(tenant.slug, "/login"));

  const client = await db.user.findFirst({
    where: { id: session.id, tenantId: tenant.id, role: "CLIENT" },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!client) redirect(studioPath(tenant.slug, "/login"));

  // Release slots whose QR/cash deposit went unpaid for 24 hours, so the client sees it.
  await expireUnpaidDeposits(tenant.id);

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [bookings, invoices, proposals, projects] = await Promise.all([
    db.clientBooking.findMany({
      where: { tenantId: tenant.id, userId: client.id },
      orderBy: { createdAt: "desc" },
      include: {
        slot: true,
        project: {
          select: {
            id: true,
            title: true,
            projectNumber: true,
            status: true,
          },
        },
      },
    }),
    db.milestoneInvoice.findMany({
      where: { tenantId: tenant.id, clientId: client.id },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, title: true, projectNumber: true } },
        booking: {
          select: {
            id: true,
            trackingCode: true,
            category: true,
            packageName: true,
            sessionPrice: true,
            depositAmount: true,
          },
        },
      },
    }),
    db.proposal.findMany({
      where: { tenantId: tenant.id, clientId: client.id, ...clientVisibleProposalWhere },
      orderBy: { createdAt: "desc" },
    }),
    // A cancelled or missed booking's gallery isn't shown to the client.
    db.project.findMany({
      where: { tenantId: tenant.id, clientId: client.id, ...liveProjectWhere },
      orderBy: { createdAt: "desc" },
      include: {
        deliverables: {
          include: {
            items: {
              select: {
                id: true,
                title: true,
                itemType: true,
                previewUrl: true,
                thumbnailUrl: true,
                isClientFav: true,
              },
            },
          },
        },
        booking: {
          select: {
            id: true,
            trackingCode: true,
            category: true,
            sessionPrice: true,
            depositAmount: true,
            slot: { select: { date: true, startTime: true, endTime: true } },
          },
        },
        callSheets: {
          where: { shootDate: { gte: startOfToday } },
          orderBy: { shootDate: "asc" },
          take: 1,
          select: {
            title: true,
            shootDate: true,
            generalCallTime: true,
            locationName: true,
            locationAddress: true,
          },
        },
      },
    }),
  ]);

  // To show a booking's category by the studio's name for it, not its code.
  const categories = await db.campaignCategory.findMany({ where: { tenantId: tenant.id }, select: { slug: true, name: true } });

  // Each gallery's framed prints (included prints, past orders), for its Galleries card.
  // A studio that sells no framed prints shows none.
  const sellsPrints = await printsOffered(tenant.id);
  const projectsWithPrints = await Promise.all(projects.map(async (p) => ({ ...p, framedPrints: sellsPrints ? await loadFramedPrints(p.id) : undefined })));

  // Right after checkout: confirm the booking (looked up as this client's, never trusted from the URL).
  const confirmation =
    typeof confirmed === "string" && confirmed ? await loadBookingConfirmation(tenant.id, client.id, confirmed) : null;

  return (
    <ClientDashboard
      tenant={tenant}
      client={client}
      bookings={bookings}
      invoices={invoices}
      proposals={proposals}
      projects={projectsWithPrints}
      categories={categories}
      banner={
        <>
          {confirmation ? (
            <PaymentConfirmationBanner
              tenantSlug={tenant.slug}
              currency={tenant.currency}
              confirmation={confirmation}
              dismissHref={studioPath(tenant.slug, "/account?tab=bookings")}
            />
          ) : null}
          {/* A stand-alone account (no login yet) is invited to use one sign-in for all its studios. */}
          {session.loginId ? null : <OneLoginInvite />}
        </>
      }
    />
  );
}
