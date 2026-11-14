import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/project-access";
import { CheckoutShell } from "@/components/checkout/checkout-shell";
import { PortalTopBar } from "@/components/portal/portal-top-bar";
import { Metadata } from "next";
import { getSessionClient } from "@/lib/clients";
import { getCheckoutGateway } from "@/lib/payments/settle";
import { CheckoutAuthGate } from "@/components/checkout/checkout-auth-gate";
import { sameCategory } from "@/lib/bookings/pricing-shared";

interface CheckoutPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    slotId?: string;
    sessionId?: string;
    name?: string;
    email?: string;
    phone?: string;
    brief?: string;
    invoiceId?: string;
    projectId?: string;
    type?: string;
    packageId?: string;
  }>;
}

export async function generateMetadata({ params }: CheckoutPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true },
  });

  if (!tenant) return { title: "Checkout" };

  return {
    title: `Secure Checkout & Production Escrow | ${tenant.name}`,
    description: "Multi-option studio checkout for online cards, studio QR transfer, and cash counter.",
  };
}

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { tenantSlug } = await params;
  const search = await searchParams;

  // 1. Resolve Tenant
  const tenantRow = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenantRow) notFound();

  // Only non-sensitive fields cross to the client component; gateway credentials stay on the server.
  const tenant = {
    id: tenantRow.id,
    name: tenantRow.name,
    slug: tenantRow.slug,
    brandColor: tenantRow.brandColor,
    currency: tenantRow.currency,
    qrCodeUrl: tenantRow.qrCodeUrl,
    bankDetails: tenantRow.bankDetails,
  };
  const cardMode: "GATEWAY" | "SIMULATED" | "OFF" = getCheckoutGateway(tenantRow)
    ? "GATEWAY"
    : process.env.ALLOW_SIMULATED_CARD_PAYMENTS === "true"
      ? "SIMULATED"
      : "OFF";

  // 2. Resolve Slot (if booking a held session slot)
  let slot = null;
  if (search.slotId) {
    slot = await db.bookingSlot.findFirst({
      where: {
        id: search.slotId,
        tenantId: tenant.id,
      },
    });
  }

  // 3. Resolve Invoice (if paying a milestone invoice or final balance)
  let invoice = null;
  if (search.invoiceId) {
    invoice = await db.milestoneInvoice.findFirst({
      where: {
        id: search.invoiceId,
        tenantId: tenant.id,
      },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        project: true,
      },
    });
  } else if (search.projectId && search.type === "FINAL_BALANCE") {
    // Look up final balance milestone for this project
    invoice = await db.milestoneInvoice.findFirst({
      where: {
        projectId: search.projectId,
        tenantId: tenant.id,
        milestoneType: { in: ["FINAL_BALANCE_50", "BOOKING_BALANCE"] },
      },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        project: true,
      },
    });
  }

  // Paying an invoice is for its client (or studio staff), signed in.
  let invoiceDoneHref: string | undefined;
  if (invoice) {
    const query = new URLSearchParams();
    if (search.invoiceId) query.set("invoiceId", search.invoiceId);
    else {
      query.set("projectId", invoice.projectId ?? "");
      query.set("type", "FINAL_BALANCE");
    }
    const payer = await requirePageAccess({
      tenantSlug: tenant.slug,
      tenantId: tenant.id,
      clientId: invoice.clientId,
      returnTo: `/${tenant.slug}/checkout?${query.toString()}`,
    });
    // After paying: the client sees their invoice (receipt + confirmation); staff paying on a
    // client's behalf go back to the admin invoice.
    invoiceDoneHref =
      payer.role === "CLIENT"
        ? `/${tenant.slug}/account/invoices/${invoice.id}?paid=1`
        : `/${tenant.slug}/admin/invoices/${invoice.id}`;
  }

  // Packages offered for this slot set its price and deposit.
  const packages = slot
    ? (
        await db.servicePackage.findMany({
          where: { tenantId: tenant.id },
          select: { id: true, name: true, category: true, price: true, depositPrice: true, description: true, deliverables: true },
          orderBy: { price: "asc" },
        })
      ).filter((p) => sameCategory(p.category, slot!.category))
    : [];

  // 4. Booking a slot requires a client account (quick sign-up or sign-in)
  const client = slot ? await getSessionClient(tenant.id) : null;

  if (slot && !client) {
    return (
      <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
        <CheckoutAuthGate tenantSlug={tenant.slug} tenantName={tenant.name} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <PortalTopBar
        tenant={tenant}
        width="7xl"
        back={
          invoice
            ? { href: `/${tenant.slug}/account?tab=invoices`, label: "My invoices" }
            : { href: `/${tenant.slug}/book`, label: "Back to booking" }
        }
        staffBack={invoice ? { href: `/${tenant.slug}/admin/invoices/${invoice.id}`, label: "Back to invoice" } : undefined}
      />
      <CheckoutShell
        tenant={tenant}
        slot={slot}
        invoice={invoice}
        identityLocked={Boolean(slot && client)}
        cardMode={cardMode}
        packages={packages}
        initialPackageId={search.packageId}
        invoiceDoneHref={invoiceDoneHref}
        initialData={{
          name: client?.name ?? search.name,
          email: client?.email ?? search.email,
          phone: client?.phone ?? search.phone,
          brief: search.brief,
          sessionId: search.sessionId,
        }}
      />
    </div>
  );
}
