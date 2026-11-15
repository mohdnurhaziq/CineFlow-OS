import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BookOpen } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/page";
import { MANUAL_TOPICS, manualTopicHref } from "@/lib/manual/topics";

interface ManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Manual | Studio Admin",
  description: "How the studio's system works and how to use it. For the studio's team only.",
};

/**
 * The admin manual's front page. It lives under the admin layout, which only lets the studio's
 * own team in (clients are sent to their account, visitors to sign in).
 */
export default async function ManualIndexPage({ params }: ManualPageProps) {
  const { tenantSlug } = await params;
  const areas = [...new Set(MANUAL_TOPICS.map((t) => t.area))];

  return (
    <PageShell width="detail">
      <PageHeader
        icon={BookOpen}
        title="Manual"
        description="How the system works behind the scenes and how to run your studio with it. Only your team can see these pages; clients never do."
      />

      {areas.map((area) => (
        <section key={area} className="space-y-3">
          <h2 className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">{area}</h2>
          <ul className="space-y-3">
            {MANUAL_TOPICS.filter((t) => t.area === area).map((topic) => (
              <li key={topic.slug}>
                <Link
                  href={manualTopicHref(tenantSlug, topic.slug)}
                  className="group flex items-start justify-between gap-4 rounded-2xl border border-zinc-800 bg-[#121215] p-5 hover:border-zinc-700 hover:bg-[#151518] transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">{topic.title}</p>
                    <p className="text-xs leading-relaxed text-zinc-400 max-w-2xl">{topic.summary}</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 mt-0.5 text-zinc-500 group-hover:text-amber-400 transition-colors" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageShell>
  );
}
