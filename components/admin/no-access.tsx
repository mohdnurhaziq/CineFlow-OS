import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/page";
import { buttonVariants } from "@/components/ui/button";

/** What an admin page shows to a team member whose access doesn't cover it. */
export function NoAccess({ tenantSlug }: { tenantSlug: string }) {
  return (
    <PageShell width="detail">
      <PageHeader icon={Lock} title="You don't have access to this" description="Ask the studio owner if you need it." />
      <Link href={`/${tenantSlug}/admin`} className={buttonVariants({ variant: "secondary" })}>
        Back to the overview
      </Link>
    </PageShell>
  );
}
