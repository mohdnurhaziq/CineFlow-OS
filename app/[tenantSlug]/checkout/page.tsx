import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { CheckoutShell } from "@/components/checkout/checkout-shell";
import { Metadata } from "next";

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
  }>;
}

export async function generateMetadata({ params }: CheckoutPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true },
  });

  if (!tenant) return { title: "Checkout | CineFlow OS" };

  return {
    title: `Secure Checkout & Production Escrow | ${tenant.name}`,
    description: "Multi-option studio checkout for online cards, studio QR transfer, and cash counter.",
  };
}

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { tenantSlug } = await params;
  const search = await searchParams;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      brandColor: true,
      currency: true,
      qrCodeUrl: true,
      bankDetails: true,
    },
  });

  if (!tenant) notFound();

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
        client: true,
        project: true,
      },
    });
  } else if (search.projectId && search.type === "FINAL_BALANCE") {
    // Look up final balance milestone for this project
    invoice = await db.milestoneInvoice.findFirst({
      where: {
        projectId: search.projectId,
        tenantId: tenant.id,
        milestoneType: "FINAL_BALANCE_50",
      },
      include: {
        client: true,
        project: true,
      },
    });
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <CheckoutShell
        tenant={tenant}
        slot={slot}
        invoice={invoice}
        initialData={{
          name: search.name,
          email: search.email,
          phone: search.phone,
          brief: search.brief,
          sessionId: search.sessionId,
        }}
      />
    </div>
  );
}
