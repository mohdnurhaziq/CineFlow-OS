import { db } from "@/lib/db";

/**
 * The access model: what each team account may do, per area.
 * Owners and the platform super-admin always have everything; these settings never apply to them.
 *
 * Not a "use server" module.
 */

export type AccessArea =
  | "bookings"
  | "galleries"
  | "production"
  | "printOrders"
  | "clients"
  | "proposals"
  | "invoices"
  | "services"
  | "catalog";
export type AccessLevel = "NONE" | "OWN" | "VIEW" | "MANAGE";
export type AccessTick = "approvePayments" | "recordPayments" | "setPrices";

export interface AccessMap {
  areas: Record<AccessArea, AccessLevel>;
  ticks: Record<AccessTick, boolean>;
}

export const ACCESS_AREAS: AccessArea[] = [
  "bookings",
  "galleries",
  "production",
  "printOrders",
  "clients",
  "proposals",
  "invoices",
  "services",
  "catalog",
];
export const ACCESS_TICKS: AccessTick[] = ["approvePayments", "recordPayments", "setPrices"];

const LEVELS: AccessLevel[] = ["NONE", "OWN", "VIEW", "MANAGE"];
const OWN_AREAS = new Set<AccessArea>(["bookings", "galleries"]);

function build(level: (area: AccessArea) => AccessLevel, tick: (t: AccessTick) => boolean): AccessMap {
  return {
    areas: Object.fromEntries(ACCESS_AREAS.map((a) => [a, level(a)])) as Record<AccessArea, AccessLevel>,
    ticks: Object.fromEntries(ACCESS_TICKS.map((t) => [t, tick(t)])) as Record<AccessTick, boolean>,
  };
}

function withAreas(areas: Partial<Record<AccessArea, AccessLevel>>): AccessMap {
  return build((a) => areas[a] ?? "NONE", () => false);
}

export const FULL_ACCESS: AccessMap = build(() => "MANAGE", () => true);
export const NO_ACCESS: AccessMap = build(() => "NONE", () => false);
/** What existing team members keep on upgrade: every area, no ticks. */
export const LEGACY_TEAM_ACCESS: AccessMap = build(() => "MANAGE", () => false);

export const STARTER_ROLES: { name: string; access: AccessMap }[] = [
  { name: "Photographer", access: withAreas({ bookings: "OWN", galleries: "OWN", production: "VIEW" }) },
  { name: "Videographer", access: withAreas({ bookings: "OWN", galleries: "OWN", production: "VIEW" }) },
  { name: "Crew", access: withAreas({ bookings: "OWN", production: "VIEW" }) },
  {
    name: "Front desk",
    access: withAreas({ bookings: "MANAGE", clients: "MANAGE", galleries: "VIEW", printOrders: "MANAGE", invoices: "VIEW" }),
  },
];

/** Reads stored access JSON. Unknown keys are ignored; anything missing or invalid is NONE / false. */
export function parseAccess(json: string | null | undefined): AccessMap {
  let raw: unknown = null;
  if (json) {
    try {
      raw = JSON.parse(json);
    } catch {
      raw = null;
    }
  }
  const obj = (raw && typeof raw === "object" ? raw : {}) as { areas?: unknown; ticks?: unknown };
  const areas = (obj.areas && typeof obj.areas === "object" ? obj.areas : {}) as Record<string, unknown>;
  const ticks = (obj.ticks && typeof obj.ticks === "object" ? obj.ticks : {}) as Record<string, unknown>;
  return build(
    (a) => {
      const v = areas[a];
      if (typeof v !== "string" || !LEVELS.includes(v as AccessLevel)) return "NONE";
      if (v === "OWN" && !OWN_AREAS.has(a)) return "NONE";
      return v as AccessLevel;
    },
    (t) => ticks[t] === true
  );
}

export function serializeAccess(map: AccessMap): string {
  return JSON.stringify({ areas: map.areas, ticks: map.ticks });
}

export function levelAtLeast(have: AccessLevel, need: AccessLevel): boolean {
  return LEVELS.indexOf(have) >= LEVELS.indexOf(need);
}

/** The higher level per area; a tick is on if it is on in either. */
export function mergeAccess(a: AccessMap, b: AccessMap): AccessMap {
  return build(
    (area) => (levelAtLeast(a.areas[area], b.areas[area]) ? a.areas[area] : b.areas[area]),
    (t) => a.ticks[t] || b.ticks[t]
  );
}

const TEAM_ACCOUNT_ROLES = ["PHOTOGRAPHER", "VIDEOGRAPHER", "CREW", "TEAM_MEMBER"];

function legacyTitle(role: string): string {
  switch (role) {
    case "PHOTOGRAPHER":
      return "Photographer";
    case "VIDEOGRAPHER":
      return "Videographer";
    case "CREW":
      return "Crew";
    default:
      return "Team";
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/**
 * Makes sure a studio has team roles. A studio with no roles gets one per existing title
 * (legacy access, so nothing changes for the team) or, with no team, the starter roles.
 * Team members without a role are linked to the role named after their title. Idempotent.
 */
export async function ensureStudioRoles(tenantId: string): Promise<void> {
  const members = await db.user.findMany({
    where: { tenantId, role: { in: TEAM_ACCOUNT_ROLES } },
    select: { id: true, role: true, teamRoleId: true },
  });

  if ((await db.teamRole.count({ where: { tenantId } })) === 0) {
    const toCreate =
      members.length > 0
        ? [...new Set(members.map((m) => legacyTitle(m.role)))].map((name) => ({ name, access: LEGACY_TEAM_ACCESS }))
        : STARTER_ROLES;
    for (const [i, r] of toCreate.entries()) {
      try {
        await db.teamRole.create({ data: { tenantId, name: r.name, access: serializeAccess(r.access), sortOrder: i } });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
  }

  const unlinked = members.filter((m) => !m.teamRoleId);
  if (unlinked.length === 0) return;
  const existing = await db.teamRole.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const byName = new Map(existing.map((r) => [r.name, r.id]));
  for (const title of new Set(unlinked.map((m) => legacyTitle(m.role)))) {
    if (!byName.has(title)) {
      try {
        const created = await db.teamRole.create({
          data: { tenantId, name: title, access: serializeAccess(LEGACY_TEAM_ACCESS), sortOrder: byName.size },
        });
        byName.set(title, created.id);
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        const found = await db.teamRole.findUnique({ where: { tenantId_name: { tenantId, name: title } } });
        if (found) byName.set(title, found.id);
      }
    }
    const roleId = byName.get(title);
    if (!roleId) continue;
    await db.user.updateMany({
      where: { id: { in: unlinked.filter((m) => legacyTitle(m.role) === title).map((m) => m.id) }, teamRoleId: null },
      data: { teamRoleId: roleId },
    });
  }
}

/**
 * What this person may do in the studio `user.tenantId`. Reads the current database row;
 * only the user id is trusted from the caller. A user of another studio has nothing there.
 */
export async function loadAccess(user: { id: string; role: string; tenantId: string | null }): Promise<AccessMap> {
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { role: true, tenantId: true, teamRoleId: true, extraAccess: true, deactivatedAt: true },
  });
  if (!row) return NO_ACCESS;
  if (row.role === "SUPER_ADMIN") return FULL_ACCESS;
  if (!row.tenantId || row.tenantId !== user.tenantId) return NO_ACCESS;
  if (row.role === "STUDIO_OWNER") return FULL_ACCESS;
  if (row.deactivatedAt || !TEAM_ACCOUNT_ROLES.includes(row.role)) return NO_ACCESS;

  let roleId = row.teamRoleId;
  if (!roleId) {
    await ensureStudioRoles(row.tenantId);
    roleId = (await db.user.findUnique({ where: { id: user.id }, select: { teamRoleId: true } }))?.teamRoleId ?? null;
  }
  const role = roleId ? await db.teamRole.findUnique({ where: { id: roleId }, select: { access: true } }) : null;
  return mergeAccess(parseAccess(role?.access), parseAccess(row.extraAccess));
}
