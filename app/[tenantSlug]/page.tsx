import { Metadata } from "next";
import { notFound } from "next/navigation";
import { includedPrintCount } from "@/lib/prints/pricing";
import { db } from "@/lib/db";
import { ShowcaseNav } from "@/components/showcase/showcase-nav";
import { getSessionClient } from "@/lib/clients";
import { getCurrentUser } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/guard";
import { ShowcaseHero } from "@/components/showcase/showcase-hero";
import { ShowcaseShell } from "@/components/showcase/showcase-shell";
import { ShowcaseFooter } from "@/components/showcase/showcase-footer";
import { studioPath } from "@/lib/domain-name";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ category?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true, tagline: true, bio: true, logoUrl: true },
  });

  if (!tenant) return { title: "Studio Not Found" };

  const title = `${tenant.name} — ${tenant.tagline || "Creative Production Studio"}`;
  const description =
    tenant.bio ||
    `Explore portfolio, campaign categories, and booking sessions for ${tenant.name}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: tenant.logoUrl ? [{ url: tenant.logoUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function TenantShowcasePage({ params, searchParams }: PageProps) {
  const { tenantSlug } = await params;
  const { category: initialCategory } = await searchParams;

  // 1. Resolve Tenant strictly by slug
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      discipline: true,
      tagline: true,
      bio: true,
      logoUrl: true,
      brandColor: true,
      currency: true,
      subscriptionStatus: true,
    },
  });

  if (!tenant || tenant.subscriptionStatus === "CANCELLED") {
    notFound();
  }

  // 2. Fetch scoped Campaign Categories
  const categories = await db.campaignCategory.findMany({
    where: { tenantId: tenant.id, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      badgeIcon: true,
      description: true,
    },
  });

  // 3. Fetch scoped Service Packages
  // Switched-off packages aren't offered.
  const packageRows = await db.servicePackage.findMany({
    where: { tenantId: tenant.id, isActive: true },
    orderBy: [{ isFeatured: "desc" }, { price: "asc" }],
    select: {
      id: true,
      category: true,
      name: true,
      discipline: true,
      price: true,
      depositPrice: true,
      description: true,
      deliverables: true,
      turnaround: true,
      isFeatured: true,
      includedPrints: { select: { quantity: true } },
    },
  });
  const packages = packageRows.map(({ includedPrints, ...pkg }) => ({
    ...pkg,
    includedPrintCount: includedPrintCount(includedPrints),
  }));

  // 4. Fetch scoped Showcase Items
  const showcaseRows = await db.showcaseItem.findMany({
    where: { tenantId: tenant.id },
    include: {
      servicePackage: {
        select: {
          id: true,
          name: true,
          discipline: true,
          price: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
  });
  // A portfolio item linked to a switched-off package shows no package.
  const showcaseItems = showcaseRows.map(({ servicePackage, ...item }) => ({
    ...item,
    servicePackage: servicePackage?.isActive
      ? { id: servicePackage.id, name: servicePackage.name, discipline: servicePackage.discipline, price: servicePackage.price }
      : null,
  }));

  // 5. Fetch Studio Lead for WhatsApp / inquiries
  const studioLead = await db.user.findFirst({
    where: { tenantId: tenant.id, role: "STUDIO_OWNER" },
    select: { name: true, phone: true, email: true },
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: tenant.name,
    description: tenant.bio || tenant.tagline,
    url: studioPath(tenant.slug),
    image: tenant.logoUrl,
    priceRange: "$$$",
  };

  // Show the signed-in client or staff (if any) a way back to their account/admin.
  const [client, session] = await Promise.all([
    getSessionClient(tenant.id),
    getCurrentUser(),
  ]);
  const isStaff =
    !!session &&
    STAFF_ROLES.has(session.role) &&
    (session.role === "SUPER_ADMIN" || session.tenantId === tenant.id);
  const staff = isStaff && session ? { name: session.name, email: session.email, role: session.role } : null;

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <script
        type="application/ld+json"
        // "<" escaped so studio text (bio, tagline, name) can never close this script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      {/* Studio Navigation Bar */}
      <ShowcaseNav
        tenant={tenant}
        studioLead={studioLead}
        client={client ? { name: client.name, email: client.email } : null}
        staff={staff}
      />

      {/* Cinematic Studio Hero */}
      <ShowcaseHero tenant={tenant} />

      {/* Interactive Showcase Shell (Categories, Gallery, Lightbox & Packages) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-24">
        <ShowcaseShell
          tenant={tenant}
          categories={categories}
          packages={packages}
          showcaseItems={showcaseItems}
          initialCategory={initialCategory || "all"}
        />

        {/* The equipment ("pedigree") and testimonials sections are hidden until studios can enter
            their own: their fixed copy read as real reviews and gear claims on every studio's page. */}
      </main>

      {/* Showcase Footer */}
      <ShowcaseFooter tenant={tenant} studioLead={studioLead} />
    </div>
  );
}
