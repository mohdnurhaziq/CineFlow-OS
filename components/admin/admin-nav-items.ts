import {
  LayoutDashboard,
  Clapperboard,
  CalendarCheck,
  Calendar,
  Layers,
  Receipt,
  Shield,
  FileText,
  Package,
  Frame,
  Sparkles,
  Settings,
  Users,
  Images,
  BookOpen,
  CalendarClock,
} from "lucide-react";
import type { ComponentType } from "react";
import { levelAtLeast, type AccessArea, type AccessLevel, type AccessMap } from "@/lib/auth/access";
import { studioPath } from "@/lib/domain-name";

/**
 * The admin menu, filtered to what this person can open. It mirrors the page checks
 * (lib/auth/admin-page.ts and each page); every action still checks on the server.
 *
 * Not a client module: AdminNavBar renders it, tests read it directly.
 */

type Icon = ComponentType<{ className?: string }>;

/** A live count shown on an item (and on its group). */
export type NavBadge = "printOrders" | "verification";

export interface NavSubItem {
  href: string;
  label: string;
  description: string;
  icon: Icon;
  badge?: NavBadge;
}

export type AdminNavEntry =
  | { kind: "link"; id: "schedule" | "overview" | "clients" | "settings" | "manual"; href: string; label: string; icon: Icon; tour?: string }
  | { kind: "group"; id: "production" | "finance" | "catalog"; label: string; icon: Icon; items: NavSubItem[] };

/** Who may see an item: an area at a level, a check of their own, or everyone. */
type Rule = { area: AccessArea; level: AccessLevel } | ((access: AccessMap, isOwner: boolean) => boolean);

const can = (rule: Rule, access: AccessMap, isOwner: boolean) =>
  typeof rule === "function" ? rule(access, isOwner) : levelAtLeast(access.areas[rule.area], rule.level);

export function visibleNavItems(tenantSlug: string, access: AccessMap, isOwner: boolean): AdminNavEntry[] {
  const base = studioPath(tenantSlug, "/admin");
  const item = (rule: Rule, sub: NavSubItem): NavSubItem[] => (can(rule, access, isOwner) ? [sub] : []);
  const group = (entry: Extract<AdminNavEntry, { kind: "group" }>): AdminNavEntry[] => (entry.items.length > 0 ? [entry] : []);

  // My schedule: every team member's own sessions. First for team members, after Overview for the owner.
  const schedule: AdminNavEntry = { kind: "link", id: "schedule", href: `${base}/schedule`, label: "My schedule", icon: CalendarClock };

  return [
    ...(isOwner ? [] : [schedule]),
    { kind: "link", id: "overview", href: base, label: "Overview", icon: LayoutDashboard },
    ...(isOwner ? [schedule] : []),
    // Clients: their own tab, since a client spans bookings, projects and invoices.
    ...(can({ area: "clients", level: "VIEW" }, access, isOwner)
      ? [{ kind: "link" as const, id: "clients" as const, href: `${base}/clients`, label: "Clients", icon: Users }]
      : []),
    ...group({
      kind: "group",
      id: "production",
      label: "Production",
      icon: Clapperboard,
      items: [
        ...item({ area: "galleries", level: "OWN" }, {
          href: `${base}/projects`,
          label: "Galleries",
          description: "Client photo galleries, uploads & deliverables",
          icon: Images,
        }),
        ...item({ area: "bookings", level: "OWN" }, {
          href: `${base}/bookings`,
          label: "Bookings",
          description: "Client session appointments, deposits & statuses",
          icon: CalendarCheck,
        }),
        ...item({ area: "printOrders", level: "VIEW" }, {
          href: `${base}/print-orders`,
          label: "Print orders",
          description: "Framed prints to produce, ship or hand over",
          icon: Frame,
          badge: "printOrders",
        }),
        ...item({ area: "bookings", level: "VIEW" }, {
          href: `${base}/calendar`,
          label: "Calendar",
          description: "Shoot dates, slot times & schedule generator",
          icon: Calendar,
        }),
        ...item({ area: "production", level: "VIEW" }, {
          href: `${base}/inventory`,
          label: "Gear & Fleet",
          description: "Equipment inventory, kit bundles & barcode scans",
          icon: Layers,
        }),
      ],
    }),
    ...group({
      kind: "group",
      id: "finance",
      label: "Finance",
      icon: Receipt,
      items: [
        ...item({ area: "invoices", level: "VIEW" }, {
          href: `${base}/invoices`,
          label: "Invoices",
          description: "Milestone invoices, payment receipts & balances",
          icon: Receipt,
        }),
        ...item((a) => a.ticks.approvePayments || levelAtLeast(a.areas.invoices, "VIEW"), {
          href: `${base}/verification`,
          label: "Verification",
          description: "Offline QR receipts & bank transfer approvals",
          icon: Shield,
          badge: "verification",
        }),
        ...item({ area: "proposals", level: "VIEW" }, {
          href: `${base}/proposals`,
          label: "Proposals",
          description: "Client quotes, custom scopes & digital contracts",
          icon: FileText,
        }),
      ],
    }),
    ...group({
      kind: "group",
      id: "catalog",
      label: "Catalog & CMS",
      icon: Package,
      items: [
        ...item({ area: "services", level: "VIEW" }, {
          href: `${base}/services`,
          label: "Services",
          description: "Package tiers, pricing & campaign categories",
          icon: Package,
        }),
        ...item({ area: "catalog", level: "VIEW" }, {
          href: `${base}/frames`,
          label: "Frames & Prints",
          description: "Fine art sizes, frame finishes & print labs",
          icon: Frame,
        }),
        ...item({ area: "catalog", level: "VIEW" }, {
          href: `${base}/cms`,
          label: "Showcase CMS",
          description: "Public landing hero, featured work & portfolio",
          icon: Sparkles,
        }),
      ],
    }),
    // Settings (and Team) are the owner's alone.
    ...(isOwner
      ? [{ kind: "link" as const, id: "settings" as const, href: `${base}/settings`, label: "Settings", icon: Settings, tour: "nav-settings" }]
      : []),
    // Manual: how the system works, for the whole team.
    { kind: "link", id: "manual", href: `${base}/manual`, label: "Manual", icon: BookOpen },
  ];
}
