import { redirect } from "next/navigation";

interface AdminPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function AdminDashboardPage({ params }: AdminPageProps) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/admin/verification`);
}
