/**
 * Tier 26: The access table.
 *
 * Every admin action, file upload folder and admin page is listed here with exactly what it needs
 * (an area at a level, a money tick, Owner only, or any team member). For each one:
 * - the code's own check must match the table (a new action or page without a row fails),
 * - one step below the need is refused, with everything else at full access,
 * - exactly the need, with nothing else, gets past the check.
 *
 * So a check that asks for the wrong area or level fails here, not only a missing one. Change the
 * table only when the access rule itself is meant to change (and say so in the manual).
 */

import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { withSession } from "./mocks/session";
import { findProp, provideReactGlobal } from "./react-tree";
import { bookingGalleryLink } from "@/lib/bookings/gallery-link";
import { canRecordPaymentOn } from "@/lib/invoices/record-rule";
import {
  ACCESS_AREAS,
  ACCESS_TICKS,
  FULL_ACCESS,
  NO_ACCESS,
  serializeAccess,
  type AccessArea,
  type AccessLevel,
  type AccessMap,
  type AccessTick,
} from "@/lib/auth/access";
import { AuthorizationError, requireOwner } from "@/lib/auth/guard";
import { getCurrentUser } from "@/lib/auth/session";
import { NoAccess } from "@/components/admin/no-access";
import { POST as uploadFile } from "@/app/api/upload/route";

import * as analytics from "@/lib/actions/admin-analytics";
import * as assignments from "@/lib/actions/admin-assignments";
import * as lifecycle from "@/lib/actions/admin-booking-lifecycle";
import * as bookings from "@/lib/actions/admin-bookings";
import * as calendar from "@/lib/actions/admin-calendar";
import * as clients from "@/lib/actions/admin-clients";
import * as cms from "@/lib/actions/admin-cms";
import * as frames from "@/lib/actions/admin-frames";
import * as includedPrints from "@/lib/actions/admin-included-prints";
import * as invoices from "@/lib/actions/admin-invoices";
import * as payments from "@/lib/actions/admin-payments";
import * as projects from "@/lib/actions/admin-projects";
import * as proposals from "@/lib/actions/admin-proposals";
import * as services from "@/lib/actions/admin-services";
import * as settings from "@/lib/actions/admin-settings";
import * as shipping from "@/lib/actions/admin-shipping";
import * as team from "@/lib/actions/admin-team";
import * as verification from "@/lib/actions/admin-verification";
import * as gear from "@/lib/actions/gear";
import * as logistics from "@/lib/actions/logistics";
import * as onboardingGuide from "@/lib/actions/onboarding-guide";
import * as printOrders from "@/lib/actions/print-orders";

import OverviewPage from "@/app/[tenantSlug]/admin/page";
import BookingsPage from "@/app/[tenantSlug]/admin/bookings/page";
import BookingPage from "@/app/[tenantSlug]/admin/bookings/[bookingId]/page";
import CalendarPage from "@/app/[tenantSlug]/admin/calendar/page";
import ClientsPage from "@/app/[tenantSlug]/admin/clients/page";
import ClientPage from "@/app/[tenantSlug]/admin/clients/[clientId]/page";
import CmsPage from "@/app/[tenantSlug]/admin/cms/page";
import FramesPage from "@/app/[tenantSlug]/admin/frames/page";
import VisualizerPage from "@/app/[tenantSlug]/admin/frames/visualizer/page";
import InventoryPage from "@/app/[tenantSlug]/admin/inventory/page";
import InvoicesPage from "@/app/[tenantSlug]/admin/invoices/page";
import InvoicePage from "@/app/[tenantSlug]/admin/invoices/[invoiceId]/page";
import PrintOrdersPage from "@/app/[tenantSlug]/admin/print-orders/page";
import PrintOrderPage from "@/app/[tenantSlug]/admin/print-orders/[orderId]/page";
import ProjectsPage from "@/app/[tenantSlug]/admin/projects/page";
import ProjectPage from "@/app/[tenantSlug]/admin/projects/[projectId]/page";
import ProjectPrintsPage from "@/app/[tenantSlug]/admin/projects/[projectId]/prints/page";
import ProposalsPage from "@/app/[tenantSlug]/admin/proposals/page";
import SchedulePage from "@/app/[tenantSlug]/admin/schedule/page";
import ServicesPage from "@/app/[tenantSlug]/admin/services/page";
import SettingsPage from "@/app/[tenantSlug]/admin/settings/page";
import VerificationPage from "@/app/[tenantSlug]/admin/verification/page";

// ---- What a check needs ----------------------------------------------------------------------

/**
 * One need, as a string:
 * - `area:<area>:<level>`   requireAccess(tenant, area, level)
 * - `work:<area>`           requireOwnOrManage(tenant, area): Manage, or Only their own on their own record
 * - `record:<area>:<level>` requireRecordAccess(..., { area, level }) (level defaults to VIEW)
 * - `tick:<tick>`           requireTick(tenant, tick)
 * - `owner`                 requireOwner / assertOwner: the studio owner (or platform admin) only
 * - `staff`                 requireStaffBySlug: any team member
 */
type Need = string;

const LEVELS: AccessLevel[] = ["NONE", "OWN", "VIEW", "MANAGE"];
const OWN_AREAS = new Set<AccessArea>(["bookings", "galleries"]);

function access(areas: Partial<Record<AccessArea, AccessLevel>>, ticks: Partial<Record<AccessTick, boolean>> = {}, rest: AccessLevel = "NONE", restTicks = false): AccessMap {
  return {
    areas: Object.fromEntries(ACCESS_AREAS.map((a) => [a, areas[a] ?? rest])) as Record<AccessArea, AccessLevel>,
    ticks: Object.fromEntries(ACCESS_TICKS.map((t) => [t, ticks[t] ?? restTicks])) as Record<AccessTick, boolean>,
  };
}

/** The level just below `level` in `area` ("Only their own" exists for bookings and galleries only). */
function stepBelow(area: AccessArea, level: AccessLevel): AccessLevel {
  if (level === "MANAGE") return "VIEW";
  if (level === "VIEW") return OWN_AREAS.has(area) ? "OWN" : "NONE";
  return "NONE";
}

/** Who runs a probe: a team member with this access, the studio owner, or a client. */
type Who = AccessMap | "owner" | "client";

/** Exactly the needs, nothing else. */
function exactly(needs: Need[]): Who {
  if (needs.includes("owner")) return "owner";
  const areas: Partial<Record<AccessArea, AccessLevel>> = {};
  const ticks: Partial<Record<AccessTick, boolean>> = {};
  for (const n of needs) {
    const [kind, a, l] = n.split(":") as [string, string, string | undefined];
    if (kind === "area" || kind === "record") areas[a as AccessArea] = (l ?? "VIEW") as AccessLevel;
    else if (kind === "work") areas[a as AccessArea] = "MANAGE";
    else if (kind === "tick") ticks[a as AccessTick] = true;
  }
  return access(areas, ticks);
}

/** For each need: everything else at full access, that one need one step short. */
function oneShort(needs: Need[]): Array<{ label: string; who: Who }> {
  return needs.map((n) => {
    const [kind, a, l] = n.split(":") as [string, string, string | undefined];
    if (kind === "owner") return { label: "full access but not the owner", who: FULL_ACCESS };
    if (kind === "staff") return { label: "a client", who: "client" as const };
    if (kind === "tick") return { label: `every area and tick but ${a}`, who: access({}, { [a]: false }, "MANAGE", true) };
    if (kind === "work") return { label: `${a} at VIEW`, who: access({ [a]: "VIEW" }, {}, "MANAGE", true) };
    const below = stepBelow(a as AccessArea, (l ?? "VIEW") as AccessLevel);
    return { label: `${a} at ${below}`, who: access({ [a]: below }, {}, "MANAGE", true) };
  });
}

// ---- The action table ------------------------------------------------------------------------

interface Ctx {
  t: { tenantId: string; tenantSlug: string };
  /** A booking and its gallery in the studio, both assigned to the probe member. */
  bookingId: string;
  projectId: string;
  /** A new shot on the fixture project, so a probe that deletes or edits one never shares it. */
  newShot: () => Promise<string>;
}

/** An id that matches nothing: past the check, the action reports "not found" and changes nothing. */
const M = "t26-missing-record";
const SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const CART = [{ kind: "PAID", deliverableItemId: M, orientation: "PORTRAIT", printSizeId: M, frameDesignId: M, matBoardType: "NONE" }];
const NO_ACCESS_INPUT = { areas: {}, ticks: {} };

type Args = (c: Ctx) => unknown[] | Promise<unknown[]>;
type Row = [needs: Need[], args: Args];

/** file → module, so each row calls the real export. */
const MODULES: Record<string, Record<string, unknown>> = {
  "admin-analytics.ts": analytics,
  "admin-assignments.ts": assignments,
  "admin-booking-lifecycle.ts": lifecycle,
  "admin-bookings.ts": bookings,
  "admin-calendar.ts": calendar,
  "admin-clients.ts": clients,
  "admin-cms.ts": cms,
  "admin-frames.ts": frames,
  "admin-included-prints.ts": includedPrints,
  "admin-invoices.ts": invoices,
  "admin-payments.ts": payments,
  "admin-projects.ts": projects,
  "admin-proposals.ts": proposals,
  "admin-services.ts": services,
  "admin-settings.ts": settings,
  "admin-shipping.ts": shipping,
  "admin-team.ts": team,
  "admin-verification.ts": verification,
  "gear.ts": gear,
  "logistics.ts": logistics,
  "onboarding-guide.ts": onboardingGuide,
  "print-orders.ts": printOrders,
};

const ACTIONS: Record<string, Row> = {
  // Overview figures are money.
  "admin-analytics.ts#getStudioAnalytics": [["area:invoices:VIEW"], (c) => [c.t.tenantSlug]],

  // Bookings & Calendar
  "admin-assignments.ts#assignTeamMember": [["area:bookings:MANAGE"], (c) => [{ ...c.t, bookingIds: [M], userId: M }]],
  "admin-assignments.ts#unassignTeamMember": [["area:bookings:MANAGE"], (c) => [{ ...c.t, bookingId: M, userId: M }]],
  "admin-booking-lifecycle.ts#cancelBooking": [["area:bookings:MANAGE"], (c) => [{ ...c.t, bookingId: M, reason: "T26 check" }]],
  "admin-booking-lifecycle.ts#listRescheduleOptions": [["area:bookings:MANAGE"], (c) => [{ ...c.t, bookingId: M }]],
  "admin-booking-lifecycle.ts#rescheduleBooking": [["area:bookings:MANAGE"], (c) => [{ ...c.t, bookingId: M, newSlotId: M }]],
  "admin-booking-lifecycle.ts#recordSessionOutcome": [["work:bookings"], (c) => [{ ...c.t, bookingId: M, outcome: "COMPLETED" }]],
  "admin-booking-lifecycle.ts#resendBookingConfirmation": [["area:bookings:MANAGE"], (c) => [{ ...c.t, bookingId: M }]],
  "admin-bookings.ts#createBookingForCustomer": [
    ["area:bookings:MANAGE"],
    (c) => [{ ...c.t, slotId: M, newClient: { name: "T26 Customer", email: "t26-customer@example.test", phone: "0123456789" } }],
  ],
  "admin-bookings.ts#getBookingDetails": [["area:bookings:OWN"], (c) => [{ tenantId: c.t.tenantId, bookingId: c.bookingId }]],
  "admin-bookings.ts#promoteBookingToProjectAction": [["area:galleries:MANAGE"], (c) => [{ ...c.t, bookingId: M }]],
  "admin-calendar.ts#createSingleBookingSlot": [
    ["area:bookings:MANAGE"],
    (c) => [{ ...c.t, date: "2099-01-05", startTime: "10:00 AM", endTime: "11:00 AM", campaignTitle: "T26", status: "BLOCKED" }],
  ],
  "admin-calendar.ts#updateBookingSlot": [["area:bookings:MANAGE"], (c) => [{ ...c.t, id: M }]],
  "admin-calendar.ts#deleteBookingSlot": [["area:bookings:MANAGE"], (c) => [{ ...c.t, slotId: M }]],
  "admin-calendar.ts#batchDeleteBookingSlots": [["area:bookings:MANAGE"], (c) => [{ ...c.t, slotIds: [M] }]],
  "admin-calendar.ts#batchGenerateBookingSlots": [
    ["area:bookings:MANAGE"],
    (c) => [{
      ...c.t, startDate: "2099-02-02", endDate: "2099-02-02", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dayStartTime: "09:00 AM",
      dayEndTime: "10:00 AM", slotDurationMinutes: 60, category: "STUDIO_PORTRAIT", campaignTitle: "T26", price: 0, depositRequired: 0,
    }],
  ],
  "admin-calendar.ts#forceReleaseHeldSlot": [["area:bookings:MANAGE"], (c) => [{ ...c.t, slotId: M }]],
  "admin-calendar.ts#toggleBlockBookingSlot": [["area:bookings:MANAGE"], (c) => [{ ...c.t, slotId: M }]],
  "admin-calendar.ts#cleanupExpiredHolds": [["area:bookings:MANAGE"], (c) => [c.t.tenantId, c.t.tenantSlug]],
  "admin-included-prints.ts#grantIncludedPrint": [
    ["area:bookings:MANAGE"],
    (c) => [{ ...c.t, bookingId: M, printSizeId: M, frameDesignId: M, quantity: 1 }],
  ],
  "admin-included-prints.ts#removeIncludedPrint": [["area:bookings:MANAGE"], (c) => [{ ...c.t, lineId: M }]],

  // Clients
  "admin-clients.ts#updateClientDetails": [
    ["area:clients:MANAGE"],
    (c) => [{ ...c.t, clientId: M, name: "T26 Client", email: "t26-client@example.test", phone: "" }],
  ],
  "admin-clients.ts#updateClientNotes": [["area:clients:MANAGE"], (c) => [{ ...c.t, clientId: M, notes: "T26" }]],

  // Catalog & website
  "admin-cms.ts#createShowcaseItem": [
    ["area:catalog:MANAGE"],
    (c) => [{ ...c.t, title: "T26 showcase", clientName: "T26 client", category: "wedding", discipline: "PHOTOGRAPHY", coverImageUrl: "/uploads/t26.jpg", isFeatured: false }],
  ],
  "admin-cms.ts#updateShowcaseItem": [
    ["area:catalog:MANAGE"],
    (c) => [{ ...c.t, id: M, title: "T26 showcase", clientName: "T26 client", category: "wedding", discipline: "PHOTOGRAPHY", coverImageUrl: "/uploads/t26.jpg", isFeatured: false }],
  ],
  "admin-cms.ts#batchCreateShowcaseItems": [
    ["area:catalog:MANAGE"],
    (c) => [{ ...c.t, items: [{ title: "T26 showcase", clientName: "T26 client", category: "wedding", discipline: "PHOTOGRAPHY", coverImageUrl: "/uploads/t26.jpg", isFeatured: false, sortOrder: 0 }] }],
  ],
  "admin-cms.ts#deleteShowcaseItem": [["area:catalog:MANAGE"], (c) => [{ ...c.t, id: M }]],
  "admin-cms.ts#toggleShowcaseFeatured": [["area:catalog:MANAGE"], (c) => [{ ...c.t, id: M, isFeatured: true }]],
  "admin-frames.ts#createFrameDesign": [
    ["area:catalog:MANAGE"],
    (c) => [{ ...c.t, name: "T26 frame", material: "Oak", moldingWidth: 1, frameColor: "Black", previewAsset: "/uploads/t26.png", priceOffset: 0 }],
  ],
  "admin-frames.ts#updateFrameDesign": [
    ["area:catalog:MANAGE"],
    (c) => [{ ...c.t, id: M, name: "T26 frame", material: "Oak", moldingWidth: 1, frameColor: "Black", previewAsset: "/uploads/t26.png", priceOffset: 0 }],
  ],
  "admin-frames.ts#deleteFrameDesign": [["area:catalog:MANAGE"], (c) => [{ ...c.t, id: M }]],
  "admin-frames.ts#toggleFrameAvailability": [["area:catalog:MANAGE"], (c) => [{ ...c.t, id: M, isAvailable: true }]],
  "admin-frames.ts#createPrintSize": [
    ["area:catalog:MANAGE"],
    (c) => [{ ...c.t, code: "T26", name: "T26 size", widthInches: 1, heightInches: 1, basePrice: 1 }],
  ],
  "admin-frames.ts#updatePrintSize": [
    ["area:catalog:MANAGE"],
    (c) => [{ ...c.t, id: M, code: "T26", name: "T26 size", widthInches: 1, heightInches: 1, basePrice: 1 }],
  ],
  "admin-frames.ts#deletePrintSize": [["area:catalog:MANAGE"], (c) => [{ ...c.t, id: M }]],
  "admin-frames.ts#togglePrintSizeAvailability": [["area:catalog:MANAGE"], (c) => [{ ...c.t, id: M, isAvailable: true }]],
  "admin-frames.ts#updateMatBoardPrice": [["area:catalog:MANAGE"], (c) => [{ ...c.t, price: 26 }]],
  "admin-shipping.ts#saveShippingZones": [["area:catalog:MANAGE"], (c) => [{ ...c.t, zones: [] }]],

  // Invoices and money ticks
  "admin-invoices.ts#recordInvoicePayment": [["tick:recordPayments"], (c) => [{ ...c.t, invoiceId: M, method: "CASH" }]],
  "admin-invoices.ts#voidInvoice": [["tick:recordPayments"], (c) => [{ ...c.t, invoiceId: M, reason: "T26 check" }]],
  "admin-invoices.ts#sendInvoiceReminder": [["area:invoices:MANAGE"], (c) => [{ ...c.t, invoiceId: M }]],
  "admin-invoices.ts#createInvoice": [
    ["tick:setPrices"],
    (c) => [{ ...c.t, clientId: M, description: "T26 invoice", amount: 1, dueDate: "2099-01-01", notifyClient: false }],
  ],
  "admin-verification.ts#approvePaymentVerification": [["tick:approvePayments"], (c) => [{ ...c.t, invoiceId: M }]],
  "admin-verification.ts#rejectPaymentVerification": [["tick:approvePayments"], (c) => [{ ...c.t, invoiceId: M, reason: "T26 check" }]],

  // Owner only: online payment keys and studio settings
  "admin-payments.ts#saveGatewayCredentials": [["owner"], (c) => [{ ...c.t, categoryCode: "t26code" }]],
  "admin-payments.ts#removeGatewayCredentials": [["owner"], (c) => [{ ...c.t }]],
  "admin-settings.ts#updateStudioSettings": [["owner"], (c) => [{ ...c.t }]],
  "onboarding-guide.ts#dismissSetupChecklist": [["owner"], (c) => [c.t.tenantSlug]],
  "onboarding-guide.ts#markTourSeen": [["staff"], (c) => [c.t.tenantSlug]],

  // Team & roles: owner only
  "admin-team.ts#createTeamRole": [["owner"], (c) => [{ ...c.t, name: "T26 new role", access: NO_ACCESS_INPUT }]],
  "admin-team.ts#updateTeamRole": [["owner"], (c) => [{ ...c.t, roleId: M, name: "T26 new role", access: NO_ACCESS_INPUT }]],
  "admin-team.ts#deleteTeamRole": [["owner"], (c) => [{ ...c.t, roleId: M }]],
  "admin-team.ts#inviteTeamMember": [["owner"], (c) => [{ ...c.t, name: "T26 Invitee", email: "t26-invitee@example.test", roleId: M }]],
  "admin-team.ts#resendTeamInvite": [["owner"], (c) => [{ ...c.t, userId: M }]],
  "admin-team.ts#updateTeamMember": [["owner"], (c) => [{ ...c.t, userId: M, name: "T26", roleId: M }]],
  "admin-team.ts#removeTeamMember": [["owner"], (c) => [{ ...c.t, userId: M }]],
  "admin-team.ts#restoreTeamMember": [["owner"], (c) => [{ ...c.t, userId: M }]],

  // Galleries & proposals
  "admin-projects.ts#createProposal": [
    ["tick:setPrices"],
    (c) => [{
      ...c.t, clientId: M, title: "T26 proposal", category: "wedding", discipline: "PHOTOGRAPHY", basePrice: 100,
      depositPercentage: 50, contractTerms: "T26 terms, long enough to pass the check.", notifyClient: false,
    }],
  ],
  "admin-projects.ts#sendProposal": [["tick:setPrices"], (c) => [{ tenantId: c.t.tenantId, proposalId: M, notifyClient: false }]],
  "admin-projects.ts#deleteDraftProposal": [["tick:setPrices"], (c) => [{ tenantId: c.t.tenantId, proposalId: M }]],
  "admin-projects.ts#updateProjectStatus": [["work:galleries"], (c) => [{ tenantId: c.t.tenantId, projectId: M, status: "PRE_PRODUCTION" }]],
  "admin-projects.ts#updateProjectKind": [["area:galleries:MANAGE"], (c) => [{ tenantId: c.t.tenantId, projectId: M, kind: "SESSION" }]],
  "admin-projects.ts#deleteDeliverableItem": [["work:galleries"], (c) => [{ tenantId: c.t.tenantId, itemId: M }]],
  "admin-projects.ts#notifyClientPhotosReady": [["work:galleries"], (c) => [{ tenantId: c.t.tenantId, projectId: M }]],
  "admin-proposals.ts#createProposalAddOnTemplate": [
    ["area:proposals:MANAGE"],
    (c) => [{ ...c.t, name: "T26 add-on", description: "T26 add-on", price: 1 }],
  ],
  "admin-proposals.ts#updateProposalAddOnTemplate": [
    ["area:proposals:MANAGE"],
    (c) => [{ ...c.t, id: M, name: "T26 add-on", description: "T26 add-on", price: 1 }],
  ],
  "admin-proposals.ts#deleteProposalAddOnTemplate": [["area:proposals:MANAGE"], (c) => [{ ...c.t, id: M }]],
  "admin-proposals.ts#toggleAddOnTemplateDefault": [["area:proposals:MANAGE"], (c) => [{ ...c.t, id: M, isDefault: true }]],
  "admin-proposals.ts#toggleAddOnTemplateActive": [["area:proposals:MANAGE"], (c) => [{ ...c.t, id: M, isActive: true }]],

  // Services
  "admin-services.ts#createServicePackage": [
    ["tick:setPrices"],
    (c) => [{ ...c.t, name: "T26 package", category: "t26-missing-category", discipline: "PHOTOGRAPHY", price: 1, depositPrice: 1, turnaround: "1 week", description: "T26 package", deliverables: "Photos" }],
  ],
  "admin-services.ts#updateServicePackage": [
    ["tick:setPrices"],
    (c) => [{ ...c.t, id: M, name: "T26 package", category: "t26-missing-category", discipline: "PHOTOGRAPHY", price: 1, depositPrice: 1, turnaround: "1 week", description: "T26 package", deliverables: "Photos" }],
  ],
  "admin-services.ts#deleteServicePackage": [["tick:setPrices"], (c) => [{ ...c.t, id: M }]],
  "admin-services.ts#togglePackageFeatured": [["area:services:MANAGE"], (c) => [{ ...c.t, id: M, isFeatured: true }]],
  "admin-services.ts#togglePackageActive": [["area:services:MANAGE"], (c) => [{ ...c.t, id: M, isActive: true }]],
  "admin-services.ts#createCampaignCategory": [["area:services:MANAGE"], (c) => [{ ...c.t, name: "T26 category", slug: "t26-category" }]],
  "admin-services.ts#updateCampaignCategory": [["area:services:MANAGE"], (c) => [{ ...c.t, id: M, name: "T26 category", slug: "t26-category" }]],
  "admin-services.ts#deleteCampaignCategory": [["tick:setPrices"], (c) => [{ ...c.t, id: M }]],
  "admin-services.ts#toggleCategoryActive": [["area:services:MANAGE"], (c) => [{ ...c.t, id: M, isActive: true }]],

  // Shoot days & gear
  "admin-projects.ts#createCallSheet": [
    ["area:production:MANAGE"],
    (c) => [{ tenantId: c.t.tenantId, projectId: M, title: "T26 day", shootDate: "2099-01-01", generalCallTime: "07:00 AM", locationName: "Studio", locationAddress: "1 Test Street" }],
  ],
  "admin-projects.ts#deleteCallSheet": [["area:production:MANAGE"], (c) => [{ tenantId: c.t.tenantId, callSheetId: M }]],
  "admin-projects.ts#cancelEquipmentReservation": [["area:production:MANAGE"], (c) => [{ tenantId: c.t.tenantId, reservationId: M }]],
  "gear.ts#createGearItem": [["area:production:MANAGE"], (c) => [{ ...c.t, name: "T26 lens", sku: "T26-SKU", category: "LENS" }]],
  "gear.ts#updateGearItem": [["area:production:MANAGE"], (c) => [{ ...c.t, id: M }]],
  "gear.ts#deleteGearItem": [["area:production:MANAGE"], (c) => [{ ...c.t, id: M }]],
  "gear.ts#updateGearConditionStatus": [["area:production:MANAGE"], (c) => [{ ...c.t, id: M, condition: "GOOD" }]],
  // On-set jobs are open at View: flagging gear, inspections, ticking shots, collecting releases.
  "gear.ts#quarantineGearItem": [["area:production:VIEW"], (c) => [{ ...c.t, itemId: M, condition: "DAMAGED" }]],
  "gear.ts#releaseGearFromMaintenance": [["area:production:MANAGE"], (c) => [{ ...c.t, itemId: M }]],
  "gear.ts#createKitBundle": [
    ["area:production:MANAGE"],
    (c) => [{ ...c.t, name: "T26 kit", description: "T26 kit", discipline: "PHOTOGRAPHY", items: [{ itemId: M, quantity: 1 }] }],
  ],
  "gear.ts#updateKitBundle": [["area:production:MANAGE"], (c) => [{ ...c.t, id: M }]],
  "gear.ts#deleteKitBundle": [["area:production:MANAGE"], (c) => [{ ...c.t, id: M }]],
  "gear.ts#checkBundleAvailability": [["area:production:VIEW"], (c) => [M, c.t.tenantId]],
  "gear.ts#createEquipmentReservation": [
    ["area:production:MANAGE"],
    (c) => [{ ...c.t, projectId: M, itemId: M, startDate: "2099-01-01", endDate: "2099-01-02" }],
  ],
  "gear.ts#logPreShootInspection": [["area:production:VIEW"], (c) => [{ ...c.t, reservationId: M }]],
  "gear.ts#logPostShootInspection": [["area:production:VIEW"], (c) => [{ ...c.t, reservationId: M, condition: "GOOD" }]],
  "logistics.ts#toggleShotCompletion": [["area:production:VIEW"], async (c) => [{ shotId: await c.newShot(), status: "COMPLETED", tenantSlug: c.t.tenantSlug }]],
  "logistics.ts#createShotItem": [
    ["area:production:MANAGE"],
    (c) => [{ projectId: c.projectId, tenantSlug: c.t.tenantSlug, sceneNumber: "1", shotNumber: "1", framing: "Wide", cameraLens: "35mm", lightingSetup: "Natural", description: "T26 shot" }],
  ],
  "logistics.ts#updateShotItem": [["area:production:MANAGE"], async (c) => [{ shotId: await c.newShot(), tenantSlug: c.t.tenantSlug, description: "T26 updated" }]],
  "logistics.ts#deleteShotItem": [["area:production:MANAGE"], async (c) => [{ shotId: await c.newShot(), tenantSlug: c.t.tenantSlug }]],
  "logistics.ts#submitDigitalRelease": [
    ["record:production:VIEW"],
    (c) => [{
      projectId: c.projectId, tenantSlug: c.t.tenantSlug, releaseType: "TALENT", signerName: "T26 Signer",
      signerEmail: "t26-signer@example.test", termsContent: "T26 release terms text.", signatureDataUrl: SIGNATURE,
    }],
  ],

  // Print orders
  "print-orders.ts#quotePrintOrder": [["area:printOrders:MANAGE"], (c) => [{ ...c.t, projectId: c.projectId, items: CART, fulfilment: "PICKUP" }]],
  "print-orders.ts#placePrintOrder": [["area:printOrders:MANAGE"], (c) => [{ ...c.t, projectId: c.projectId, items: CART, fulfilment: "PICKUP" }]],
  "print-orders.ts#cancelPrintOrder": [["area:printOrders:MANAGE"], (c) => [{ ...c.t, orderId: M }]],
  "print-orders.ts#updatePrintOrderStatus": [["area:printOrders:MANAGE"], (c) => [{ ...c.t, orderId: M, status: "IN_PRODUCTION" }]],
};

/** The files the table covers (the same set T24-ACCESS-10 scans). */
const SCANNED = (f: string) => /^admin-.*\.ts$/.test(f) || ["gear.ts", "logistics.ts", "print-orders.ts", "onboarding-guide.ts"].includes(f);
/** Files that only re-export other files. */
const RE_EXPORTS = new Set(["admin-crud.ts"]);

/** The needs a function body's checks state, in the table's notation. */
function needsInSource(body: string): Need[] {
  const found = new Set<Need>();
  for (const m of body.matchAll(/\brequireAccess\([^)]*?"(\w+)",\s*"(\w+)"\)/g)) found.add(`area:${m[1]}:${m[2]}`);
  for (const m of body.matchAll(/\brequireOwnOrManage\([^)]*?"(\w+)"\)/g)) found.add(`work:${m[1]}`);
  for (const m of body.matchAll(/\brequireTick\([^)]*?"(\w+)"\)/g)) found.add(`tick:${m[1]}`);
  for (const m of body.matchAll(/\brequireRecordAccess\([^)]*\{\s*area:\s*"(\w+)"(?:[^}]*level:\s*"(\w+)")?[^}]*\}\s*\)/g)) {
    found.add(`record:${m[1]}:${m[2] ?? "VIEW"}`);
  }
  if (/\b(requireOwner|assertOwner)\(/.test(body)) found.add("owner");
  if (/\brequireStaffBySlug\(/.test(body)) found.add("staff");
  return [...found].sort();
}

// ---- Admin pages -----------------------------------------------------------------------------

interface PageCtx {
  tenantSlug: string;
  bookingId: string;
  projectId: string;
  clientId: string;
  invoiceId: string;
  orderId: string;
}
type PageRender = (c: PageCtx) => Promise<unknown>;
type PageRow = {
  needs: Need[];
  render: PageRender;
  /** When a page opens on either of two rules (Verification): who must be refused, and each way in. */
  refused?: Array<{ label: string; who: Who }>;
  allowed?: Array<{ label: string; who: Who }>;
};

const sp = <T extends object>(v: T) => Promise.resolve(v);
/** Pages under /admin by folder (manual pages are open to the whole team and are not listed). */
const PAGES: Record<string, PageRow> = {
  "page.tsx": { needs: ["staff"], render: (c) => OverviewPage({ params: sp({ tenantSlug: c.tenantSlug }) }) },
  "schedule/page.tsx": { needs: ["staff"], render: (c) => SchedulePage({ params: sp({ tenantSlug: c.tenantSlug }), searchParams: sp({}) }) },
  "bookings/page.tsx": { needs: ["area:bookings:OWN"], render: (c) => BookingsPage({ params: sp({ tenantSlug: c.tenantSlug }), searchParams: sp({}) }) },
  "bookings/[bookingId]/page.tsx": {
    needs: ["area:bookings:OWN"],
    render: (c) => BookingPage({ params: sp({ tenantSlug: c.tenantSlug, bookingId: c.bookingId }) }),
  },
  "calendar/page.tsx": { needs: ["area:bookings:VIEW"], render: (c) => CalendarPage({ params: sp({ tenantSlug: c.tenantSlug }) }) },
  "clients/page.tsx": { needs: ["area:clients:VIEW"], render: (c) => ClientsPage({ params: sp({ tenantSlug: c.tenantSlug }) }) },
  "clients/[clientId]/page.tsx": {
    needs: ["area:clients:VIEW"],
    render: (c) => ClientPage({ params: sp({ tenantSlug: c.tenantSlug, clientId: c.clientId }) }),
  },
  "cms/page.tsx": { needs: ["area:catalog:VIEW"], render: (c) => CmsPage({ params: sp({ tenantSlug: c.tenantSlug }) }) },
  "frames/page.tsx": { needs: ["area:catalog:VIEW"], render: (c) => FramesPage({ params: sp({ tenantSlug: c.tenantSlug }) }) },
  "frames/visualizer/page.tsx": { needs: ["area:catalog:VIEW"], render: (c) => VisualizerPage({ params: sp({ tenantSlug: c.tenantSlug }) }) },
  "inventory/page.tsx": { needs: ["area:production:VIEW"], render: (c) => InventoryPage({ params: sp({ tenantSlug: c.tenantSlug }) }) },
  "invoices/page.tsx": { needs: ["area:invoices:VIEW"], render: (c) => InvoicesPage({ params: sp({ tenantSlug: c.tenantSlug }) }) },
  "invoices/[invoiceId]/page.tsx": {
    needs: ["area:invoices:VIEW"],
    render: (c) => InvoicePage({ params: sp({ tenantSlug: c.tenantSlug, invoiceId: c.invoiceId }) }),
  },
  "print-orders/page.tsx": { needs: ["area:printOrders:VIEW"], render: (c) => PrintOrdersPage({ params: sp({ tenantSlug: c.tenantSlug }) }) },
  "print-orders/[orderId]/page.tsx": {
    needs: ["area:printOrders:VIEW"],
    render: (c) => PrintOrderPage({ params: sp({ tenantSlug: c.tenantSlug, orderId: c.orderId }) }),
  },
  "projects/page.tsx": { needs: ["area:galleries:OWN"], render: (c) => ProjectsPage({ params: sp({ tenantSlug: c.tenantSlug }), searchParams: sp({}) }) },
  "projects/[projectId]/page.tsx": {
    needs: ["area:galleries:OWN"],
    render: (c) => ProjectPage({ params: sp({ tenantSlug: c.tenantSlug, projectId: c.projectId }) }),
  },
  // Ordering prints for a client: Print orders Manage, on a gallery they can open.
  "projects/[projectId]/prints/page.tsx": {
    needs: ["area:printOrders:MANAGE", "area:galleries:OWN"],
    render: (c) => ProjectPrintsPage({ params: sp({ tenantSlug: c.tenantSlug, projectId: c.projectId }) }),
  },
  "proposals/page.tsx": { needs: ["area:proposals:VIEW"], render: (c) => ProposalsPage({ params: sp({ tenantSlug: c.tenantSlug }) }) },
  "services/page.tsx": { needs: ["area:services:VIEW"], render: (c) => ServicesPage({ params: sp({ tenantSlug: c.tenantSlug }) }) },
  "settings/page.tsx": { needs: ["owner"], render: (c) => SettingsPage({ params: sp({ tenantSlug: c.tenantSlug }), searchParams: sp({}) }) },
  // The Verification queue: Approve payments, or Invoices View to see it without deciding.
  "verification/page.tsx": {
    needs: ["tick:approvePayments"],
    render: (c) => VerificationPage({ params: sp({ tenantSlug: c.tenantSlug }) }),
    refused: [{ label: "every area but Invoices, every tick but approvePayments", who: access({ invoices: "NONE" }, { approvePayments: false }, "MANAGE", true) }],
    allowed: [
      { label: "approvePayments only", who: access({}, { approvePayments: true }) },
      { label: "Invoices View only", who: access({ invoices: "VIEW" }) },
    ],
  },
};

// ---- Upload folders --------------------------------------------------------------------------

/** /api/upload folders that belong to an area (the deliverables folder is in T24-WORK-01). */
const UPLOAD_FOLDERS: Record<string, { refused: AccessMap; allowed: AccessMap }> = {
  frames: { refused: access({ catalog: "VIEW" }, {}, "MANAGE", true), allowed: access({ catalog: "MANAGE" }) },
  showcase: { refused: access({ catalog: "VIEW" }, {}, "MANAGE", true), allowed: access({ catalog: "MANAGE" }) },
  signatures: { refused: access({ production: "NONE" }, {}, "MANAGE", true), allowed: access({ production: "VIEW" }) },
};

// ---- The run ---------------------------------------------------------------------------------

/**
 * Whether a call was refused: an AuthorizationError, a failure that says so, or no data at all
 * (the Overview figures come back as null for someone without Invoices access).
 */
const REFUSED = /FORBIDDEN|UNAUTHENTICATED|not allowed|don't have|can only change your own|Platform administrators only/i;
async function outcome(fn: () => Promise<unknown>): Promise<{ refused: boolean; detail: string }> {
  try {
    const res = await fn();
    if (res === null) return { refused: true, detail: "null" };
    const text = JSON.stringify(res ?? null) ?? "undefined";
    return { refused: REFUSED.test(text), detail: text.slice(0, 220) };
  } catch (e) {
    if (e instanceof AuthorizationError) return { refused: true, detail: e.message };
    return { refused: REFUSED.test(String(e)), detail: `threw ${String(e).slice(0, 200)}` };
  }
}

export async function runTier26AccessMatrixTests(harness: TestHarness) {
  harness.setSuite("Tier 26", "Access Table");
  await provideReactGlobal();

  const lumina = await db.tenant.findUniqueOrThrow({ where: { slug: "lumina-cine" } });
  const owner = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  const client = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, role: "CLIENT" } });
  const run = Date.now().toString(36);
  // Owner-only actions run for real as the owner; put back what they touch.
  const tenantBefore = await db.tenant.findUniqueOrThrow({ where: { id: lumina.id } });
  const zonesBefore = await db.shippingZone.findMany({ where: { tenantId: lumina.id } });
  const ownerBefore = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  try {
    await runTable(harness, { lumina, owner, client, run });
  } catch (e) {
    // A failure outside a test (the fixture) must still fail the run.
    harness.assert(false, "T26: the access table ran to the end", String(e).slice(0, 400));
  } finally {
    await db.tenant.update({
      where: { id: lumina.id },
      data: {
        name: tenantBefore.name,
        matBoardPrice: tenantBefore.matBoardPrice,
        toyyibpaySecretEnc: tenantBefore.toyyibpaySecretEnc,
        toyyibpayCategoryCode: tenantBefore.toyyibpayCategoryCode,
      },
    });
    await db.shippingZone.deleteMany({ where: { tenantId: lumina.id } });
    if (zonesBefore.length) await db.shippingZone.createMany({ data: zonesBefore });
    await db.user.update({ where: { id: owner.id }, data: { onboardingChecklistDismissedAt: ownerBefore.onboardingChecklistDismissedAt } });

    const projects = await db.project.findMany({ where: { projectNumber: { startsWith: `T26-${run}` } }, select: { id: true } });
    const projectIds = projects.map((p) => p.id);
    const probe = await db.user.findFirst({ where: { email: `t26-probe-${run}@example.test` } });
    await db.printOrder.deleteMany({ where: { orderNumber: { startsWith: `T26-${run}` } } });
    await db.milestoneInvoice.deleteMany({ where: { tenantId: lumina.id, OR: [{ invoiceNumber: { startsWith: `T26-${run}` } }, { description: { startsWith: "T26" } }] } });
    await db.shotItem.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.digitalRelease.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    const bookingsMade = await db.clientBooking.findMany({ where: { trackingCode: { startsWith: `T26-${run}` } }, select: { id: true } });
    await db.bookingAssignment.deleteMany({ where: { OR: [{ userId: probe?.id ?? "-" }, { bookingId: { in: bookingsMade.map((b) => b.id) } }] } });
    await db.clientBooking.deleteMany({ where: { id: { in: bookingsMade.map((b) => b.id) } } });
    await db.bookingSlot.deleteMany({ where: { tenantId: lumina.id, campaignTitle: "T26" } });
    await db.showcaseItem.deleteMany({ where: { tenantId: lumina.id, title: { startsWith: "T26" } } });
    await db.frameDesign.deleteMany({ where: { tenantId: lumina.id, name: { startsWith: "T26" } } });
    await db.printSize.deleteMany({ where: { tenantId: lumina.id, code: "T26" } });
    await db.inventoryItem.deleteMany({ where: { tenantId: lumina.id, sku: "T26-SKU" } });
    await db.proposalAddOnTemplate.deleteMany({ where: { tenantId: lumina.id, name: { startsWith: "T26" } } });
    await db.campaignCategory.deleteMany({ where: { tenantId: lumina.id, slug: "t26-category" } });
    await db.servicePackage.deleteMany({ where: { tenantId: lumina.id, name: { startsWith: "T26" } } });
    await db.teamRole.deleteMany({ where: { tenantId: lumina.id, name: "T26 new role" } });
    if (probe) {
      await db.user.delete({ where: { id: probe.id } }).catch(() =>
        db.user.update({ where: { id: probe.id }, data: { deactivatedAt: new Date(), teamRoleId: null } })
      );
    }
    await db.teamRole.deleteMany({ where: { tenantId: lumina.id, name: `T26 probe ${run}` } }).catch(() => undefined);
  }
}

type U = { id: string; email: string; name: string; role: string; tenantId: string | null };

async function runTable(harness: TestHarness, f: { lumina: { id: string; slug: string }; owner: U; client: U; run: string }) {
  const { lumina, owner, client, run } = f;
  const t = { tenantId: lumina.id, tenantSlug: lumina.slug };
  const sessionOf = (u: U) => ({ id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, tenantSlug: lumina.slug });

  // One probe member whose role is rewritten before each call: access is read from the database on every check.
  const probeRole = await db.teamRole.create({ data: { tenantId: lumina.id, name: `T26 probe ${run}`, access: serializeAccess(NO_ACCESS) } });
  const probe = await db.user.create({
    data: { tenantId: lumina.id, email: `t26-probe-${run}@example.test`, name: "T26 Probe", role: "TEAM_MEMBER", teamRoleId: probeRole.id },
  });
  // Their own booking and gallery, for "Only their own" and the pages that open one record.
  const booking = await db.clientBooking.create({
    data: {
      tenantId: lumina.id, trackingCode: `T26-${run}`, clientName: client.name, clientEmail: client.email, clientPhone: "000",
      discipline: "PHOTOGRAPHY", serviceTier: "T26",
    },
  });
  await db.bookingAssignment.create({ data: { tenantId: lumina.id, bookingId: booking.id, userId: probe.id } });
  const project = await db.project.create({
    data: {
      tenantId: lumina.id, projectNumber: `T26-${run}`, title: "T26 gallery", clientId: client.id, studioLeadId: owner.id,
      discipline: "PHOTOGRAPHY", budget: 0, bookingId: booking.id,
    },
  });
  const invoice = await db.milestoneInvoice.create({
    data: {
      tenantId: lumina.id, invoiceNumber: `T26-${run}`, clientId: client.id, projectId: project.id, milestoneType: "CUSTOM",
      description: "T26 invoice", amount: 10, dueDate: new Date("2099-01-01"),
    },
  });
  const order = await db.printOrder.create({
    data: {
      tenantId: lumina.id, clientId: client.id, projectId: project.id, orderNumber: `T26-${run}`, fulfilment: "PICKUP",
      itemsTotal: 10, totalAmount: 10, invoiceId: invoice.id, placedById: owner.id,
    },
  });

  const ctx: Ctx = {
    t,
    bookingId: booking.id,
    projectId: project.id,
    newShot: async () =>
      (await db.shotItem.create({
        data: { projectId: project.id, sceneNumber: "1", shotNumber: "1", framing: "Wide", cameraLens: "35mm", lightingSetup: "Natural", description: "T26 shot" },
      })).id,
  };
  const pageCtx: PageCtx = {
    tenantSlug: lumina.slug, bookingId: booking.id, projectId: project.id, clientId: client.id, invoiceId: invoice.id, orderId: order.id,
  };

  /** Runs `fn` as `who`. */
  const as = async <T>(who: Who, fn: () => Promise<T>): Promise<T> => {
    if (who === "owner") return withSession(sessionOf(owner), fn);
    if (who === "client") return withSession(sessionOf(client), fn);
    await db.teamRole.update({ where: { id: probeRole.id }, data: { access: serializeAccess(who) } });
    return withSession(sessionOf(probe), fn);
  };

  await harness.test("T26-TABLE-01: every action is in the table, with the check its code makes", async () => {
    const dir = path.join(process.cwd(), "lib", "actions");
    const seen = new Set<string>();
    for (const file of (await fs.readdir(dir)).filter((f) => SCANNED(f) && !RE_EXPORTS.has(f))) {
      const src = await fs.readFile(path.join(dir, file), "utf8");
      const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
      for (const node of sf.statements) {
        if (!ts.isFunctionDeclaration(node) || !node.name || !node.body) continue;
        const mods = ts.getModifiers(node) ?? [];
        if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || !mods.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) continue;
        const key = `${file}#${node.name.text}`;
        seen.add(key);
        const row = ACTIONS[key];
        if (!row) {
          harness.assert(false, `${key} is in the access table`, "add a row saying what it needs");
          continue;
        }
        const inCode = needsInSource(node.body.getText(sf));
        harness.assertEqual(inCode.join(" + "), [...row[0]].sort().join(" + "), `${key} checks ${row[0].join(" + ")}`);
      }
    }
    for (const key of Object.keys(ACTIONS)) harness.assert(seen.has(key), `${key} still exists`);
    harness.assert(seen.size >= 99, `the table covers ${seen.size} actions`);
  });

  /** What each action answered when refused, to compare with its answer when allowed. */
  const refusedAnswers = new Map<string, string[]>();

  await harness.test("T26-TABLE-02: one step below the need is refused, with everything else at full access", async () => {
    for (const [key, [needs, args]] of Object.entries(ACTIONS)) {
      const [file, name] = key.split("#") as [string, string];
      const fn = MODULES[file]?.[name] as ((...a: unknown[]) => Promise<unknown>) | undefined;
      if (!fn) {
        harness.assert(false, `${key} is exported`);
        continue;
      }
      for (const { label, who } of oneShort(needs)) {
        const a = await args(ctx);
        const res = await outcome(() => as(who, () => fn(...a)));
        harness.assert(res.refused, `${key}: refused with ${label}`, res.detail);
        refusedAnswers.set(key, [...(refusedAnswers.get(key) ?? []), res.detail]);
      }
    }
  });

  await harness.test("T26-TABLE-03: exactly the need, and nothing else, gets past the check", async () => {
    for (const [key, [needs, args]] of Object.entries(ACTIONS)) {
      const [file, name] = key.split("#") as [string, string];
      const fn = MODULES[file]?.[name] as ((...a: unknown[]) => Promise<unknown>) | undefined;
      if (!fn) continue;
      const a = await args(ctx);
      const res = await outcome(() => as(exactly(needs), () => fn(...a)));
      // Same input, a different answer: the refusal above really came from the access check.
      const sameAsRefused = (refusedAnswers.get(key) ?? []).includes(res.detail);
      harness.assert(!res.refused && !sameAsRefused, `${key}: allowed with only ${needs.join(" + ")}`, res.detail);
    }
  });

  await harness.test("T26-MONEY-01: money steps inside an action need their tick", async () => {
    const bookingsManage = access({ bookings: "MANAGE" });
    const withTick = (tick: AccessTick) => access({ bookings: "MANAGE", printOrders: "MANAGE" }, { [tick]: true });

    // Booking a customer as already paid.
    const paid = { ...t, slotId: M, paymentStatus: "PAID" as const, newClient: { name: "T26 Customer", email: "t26-customer@example.test", phone: "0123456789" } };
    const noTick = JSON.stringify(await as(bookingsManage, () => bookings.createBookingForCustomer(paid)));
    harness.assert(/record a payment as received/.test(noTick), "booking as paid: refused without recordPayments", noTick);
    const ticked = JSON.stringify(await as(withTick("recordPayments"), () => bookings.createBookingForCustomer(paid)));
    harness.assert(!/record a payment as received/.test(ticked), "booking as paid: allowed with recordPayments", ticked);

    // Cancelling a booking whose deposit is paid.
    const paidBooking = await db.clientBooking.create({
      data: {
        tenantId: lumina.id, trackingCode: `T26-${run}-paid`, clientName: "T26", clientEmail: "t26@example.test", clientPhone: "000",
        discipline: "PHOTOGRAPHY", serviceTier: "T26", status: "CONFIRMED", depositPaid: true,
      },
    });
    try {
      const cancel = { ...t, bookingId: paidBooking.id, reason: "T26 check" };
      const refused = await as(bookingsManage, () => lifecycle.cancelBooking(cancel));
      harness.assert(!refused.success && refused.error === "OWNER_ONLY", "cancelling a paid booking: refused without recordPayments", JSON.stringify(refused));
      harness.assertEqual((await db.clientBooking.findUniqueOrThrow({ where: { id: paidBooking.id } })).status, "CONFIRMED", "the booking is unchanged");
      const allowed = await as(withTick("recordPayments"), () => lifecycle.cancelBooking(cancel));
      harness.assert(allowed.success, "cancelling a paid booking: allowed with recordPayments", JSON.stringify(allowed));
    } finally {
      await db.clientBooking.delete({ where: { id: paidBooking.id } }).catch(() => undefined);
    }

    // A slot's fee.
    const slot = await db.bookingSlot.create({
      data: { tenantId: lumina.id, date: new Date("2099-03-02T00:00:00.000Z"), startTime: "10:00 AM", endTime: "11:00 AM", category: "STUDIO_PORTRAIT", campaignTitle: "T26", price: 100, depositRequired: 10, status: "AVAILABLE" },
    });
    const reprice = { ...t, id: slot.id, price: 200 };
    const priceRefused = await as(bookingsManage, () => calendar.updateBookingSlot(reprice));
    harness.assert(!priceRefused.success && priceRefused.error === "OWNER_ONLY", "changing a slot's fee: refused without setPrices", JSON.stringify(priceRefused));
    harness.assertEqual((await db.bookingSlot.findUniqueOrThrow({ where: { id: slot.id } })).price, 100, "the fee is unchanged");
    const priceAllowed = await as(withTick("setPrices"), () => calendar.updateBookingSlot(reprice));
    harness.assert(priceAllowed.success, "changing a slot's fee: allowed with setPrices", JSON.stringify(priceAllowed));
    harness.assertEqual((await db.bookingSlot.findUniqueOrThrow({ where: { id: slot.id } })).price, 200, "the new fee is saved");

    // A new slot: without setPrices the fee comes from the category's packages, never from the form.
    const newSlot = { ...t, date: "2099-03-03", startTime: "10:00 AM", endTime: "11:00 AM", category: "STUDIO_PORTRAIT", campaignTitle: "T26", price: 987, depositRequired: 0, status: "AVAILABLE" as const };
    const created = await as(bookingsManage, () => calendar.createSingleBookingSlot(newSlot));
    const createdPrice = created.success && "slot" in created ? created.slot?.price : null;
    harness.assert(createdPrice !== 987, "a new slot without setPrices doesn't take the typed fee", JSON.stringify(created).slice(0, 200));
    const createdTicked = await as(withTick("setPrices"), () => calendar.createSingleBookingSlot({ ...newSlot, date: "2099-03-04" }));
    harness.assertEqual(createdTicked.success && "slot" in createdTicked ? createdTicked.slot?.price : null, 987, "with setPrices it takes the typed fee");

    // Cancelling a print order that has a payment.
    const cancelOrder = { ...t, orderId: order.id };
    const orderRefused = await as(access({ printOrders: "MANAGE" }), () => printOrders.cancelPrintOrder(cancelOrder));
    harness.assert(!orderRefused.success && orderRefused.error === "OWNER_ONLY", "cancelling a print order with a payment: refused without recordPayments", JSON.stringify(orderRefused));
    harness.assertEqual((await db.printOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "NEW", "the order is unchanged");
    const orderAllowed = await as(withTick("recordPayments"), () => printOrders.cancelPrintOrder(cancelOrder));
    harness.assert(orderAllowed.success, "cancelling a print order with a payment: allowed with recordPayments", JSON.stringify(orderAllowed));
  });

  await harness.test("T26-LINK-01: a booking's gallery link shows only where the gallery opens", async () => {
    // The booking is assigned to the probe; its gallery is the fixture project.
    const assignees = [probe.id];
    const cases: Array<[AccessLevel, string[], "upload" | "open" | null]> = [
      ["MANAGE", [], "upload"],
      ["VIEW", [], "open"],
      ["OWN", assignees, "upload"],
      ["OWN", [], null],
      ["NONE", assignees, null],
    ];
    for (const [level, ids, expected] of cases) {
      harness.assertEqual(bookingGalleryLink(level, probe.id, ids), expected, `Galleries ${level}${ids.length ? ", assigned" : ""}: ${expected ?? "no link"}`);
    }
    // The link and the gallery page agree: a link is offered exactly when the page opens.
    const isNoAccess = (el: unknown) => !!el && typeof el === "object" && (el as { type?: unknown }).type === NoAccess;
    for (const level of LEVELS) {
      const shown = await as(access({ galleries: level }), () => PAGES["projects/[projectId]/page.tsx"]!.render(pageCtx)).catch((e) => e);
      const link = bookingGalleryLink(level, probe.id, assignees);
      harness.assertEqual(link !== null, !isNoAccess(shown), `Galleries ${level}: link ${link ?? "none"}, gallery ${isNoAccess(shown) ? "No access" : "opens"}`);
    }
    // The booking page hands the component the viewer and their Galleries level.
    const powers = findProp<{ galleries: string; viewerId: string }>(
      await as(access({ bookings: "OWN", galleries: "OWN" }), () => PAGES["bookings/[bookingId]/page.tsx"]!.render(pageCtx)),
      "actionPowers"
    );
    harness.assertEqual(`${powers?.galleries}/${powers?.viewerId}`, `OWN/${probe.id}`, "the booking page passes Galleries level and viewer");
  });

  await harness.test("T26-LINK-02: the invoice page offers Record payment exactly when the server allows it", async () => {
    // A throwaway invoice per case, so an allowed recording doesn't change the next case.
    for (const status of ["PENDING", "PENDING_VERIFICATION"]) {
      for (const recordPayments of [false, true]) {
        for (const approvePayments of [false, true]) {
          const inv = await db.milestoneInvoice.create({
            data: {
              tenantId: lumina.id, invoiceNumber: `T26-${run}-rec-${status}-${recordPayments}-${approvePayments}`, clientId: client.id,
              milestoneType: "CUSTOM", description: "T26 record rule", amount: 5, dueDate: new Date("2099-01-01"), status,
            },
          });
          const who = access({ invoices: "VIEW" }, { recordPayments, approvePayments });
          const res = await as(who, () => invoices.recordInvoicePayment({ ...t, invoiceId: inv.id, method: "CASH" }));
          const shown = canRecordPaymentOn(status, { recordPayments, approvePayments });
          harness.assertEqual(shown, res.success, `${status}, record ${recordPayments}, approve ${approvePayments}: button ${shown ? "shown" : "hidden"}, server ${res.success ? "records" : "refuses"}`);
        }
      }
    }
    // The page passes both permissions to the buttons.
    const props = await as(access({ invoices: "VIEW" }, { recordPayments: true }), () => PAGES["invoices/[invoiceId]/page.tsx"]!.render(pageCtx));
    harness.assertEqual(
      `${findProp(props, "canRecordPayments")}/${findProp(props, "canApprovePayments")}`,
      "true/false",
      "the invoice page passes recordPayments and approvePayments"
    );
  });

  await harness.test("T26-SESSION-01: a deleted account's cookie signs nobody in, not even as owner", async () => {
    const gone = await db.user.create({
      data: { tenantId: lumina.id, email: `t26-gone-${run}@example.test`, name: "T26 Gone", role: "STUDIO_OWNER" },
    });
    const s = sessionOf(gone);
    const before = await withSession(s, async () => ({ user: await getCurrentUser(), owner: await requireOwner(lumina.id).then(() => true, () => false) }));
    harness.assert(before.user?.id === gone.id && before.owner, "while the account exists, the cookie works");
    await db.user.delete({ where: { id: gone.id } });
    const after = await withSession(s, async () => ({ user: await getCurrentUser(), owner: await requireOwner(lumina.id).then(() => true, () => false) }));
    harness.assertEqual(after.user, null, "after it is deleted, the cookie is no session");
    harness.assertEqual(after.owner, false, "and owner-only checks refuse it");
  });

  await harness.test("T26-SHIP-01: shipping zones live on Frames & Prints, editable with Catalog Manage", async () => {
    const zoneCount = await db.shippingZone.count({ where: { tenantId: lumina.id } });
    const framesPage = (who: Who, tab?: string) =>
      as(who, () => FramesPage({ params: sp({ tenantSlug: lumina.slug }), searchParams: sp(tab ? { tab } : {}) }));
    const view = await framesPage(access({ catalog: "VIEW" }), "shipping");
    harness.assertEqual(findProp<unknown[]>(view, "zones")?.length, zoneCount, "Catalog View sees the studio's zones");
    harness.assertEqual(findProp(view, "canManage"), false, "read-only at View");
    harness.assertEqual(findProp(view, "initialTab"), "shipping", "?tab=shipping opens the Shipping Zones tab");
    const manage = await framesPage(access({ catalog: "MANAGE" }));
    harness.assertEqual(findProp(manage, "canManage"), true, "editable at Manage");
    harness.assertEqual(findProp(manage, "initialTab"), "frames", "without ?tab it opens on frames");
    // Settings no longer carries them.
    const settingsShown = await as("owner", () => SettingsPage({ params: sp({ tenantSlug: lumina.slug }), searchParams: sp({ tab: "delivery" }) }));
    harness.assertEqual(findProp(settingsShown, "zones"), undefined, "Settings → Photo delivery has no shipping zones");
  });

  await harness.test("T26-GEAR-01: gear day rates show only with Invoices View, and aren't wiped by someone who can't see them", async () => {
    const item = await db.inventoryItem.findFirst({ where: { tenantId: lumina.id, dailyRate: { gt: 0 } } });
    const bundle = await db.kitBundle.findFirst({ where: { tenantId: lumina.id } });
    harness.assert(!!item && !!bundle, "The demo studio has gear with a rate, and a kit");
    if (!item || !bundle) return;
    const rate = item.dailyRate!;
    const crew = access({ production: "MANAGE" });
    const money = access({ production: "MANAGE", invoices: "VIEW" });
    type Rated = { dailyRate: number | null };
    const page = (who: Who) => as(who, () => InventoryPage({ params: sp({ tenantSlug: lumina.slug }) }));

    const hidden = await page(crew);
    harness.assertEqual(findProp(hidden, "showRates"), false, "Without Invoices View the page hides rates");
    const items = findProp<Rated[]>(hidden, "initialItems") ?? [];
    harness.assert(items.length > 0 && items.every((i) => i.dailyRate === null), "No item's rate is sent");
    const bundles = findProp<Array<Rated & { items: Array<{ item: Rated }> }>>(hidden, "initialBundles") ?? [];
    harness.assert(
      bundles.length > 0 && bundles.every((b) => b.dailyRate === null && b.items.every((bi) => bi.item.dailyRate === null)),
      "No kit's rate, or its items' rates, is sent"
    );
    const reservations = findProp<Array<{ item: Rated }>>(hidden, "initialReservations") ?? [];
    harness.assert(reservations.every((r) => r.item.dailyRate === null), "Reserved gear carries no rate");

    const shown = await page(money);
    harness.assertEqual(findProp(shown, "showRates"), true, "With Invoices View the page shows rates");
    const shownItems = findProp<Array<Rated & { id: string }>>(shown, "initialItems") ?? [];
    harness.assertEqual(shownItems.find((i) => i.id === item.id)?.dailyRate, rate, "The item's rate is sent");

    const base = { id: item.id, tenantId: lumina.id, tenantSlug: lumina.slug, name: item.name };
    const saved = await as(crew, () => gear.updateGearItem({ ...base, dailyRate: null }));
    harness.assert(saved.success === true, "Someone without money access can still edit the item");
    harness.assertEqual(saved.item?.dailyRate ?? null, null, "The saved item comes back without its rate");
    harness.assertEqual((await db.inventoryItem.findUnique({ where: { id: item.id } }))?.dailyRate, rate, "A form without the rate field keeps the rate");
    await as(crew, () => gear.updateGearItem({ ...base, dailyRate: 1 }));
    harness.assertEqual((await db.inventoryItem.findUnique({ where: { id: item.id } }))?.dailyRate, rate, "A rate sent anyway is ignored");
    await as(money, () => gear.updateGearItem({ ...base, dailyRate: rate + 1 }));
    harness.assertEqual((await db.inventoryItem.findUnique({ where: { id: item.id } }))?.dailyRate, rate + 1, "With Invoices View the rate can change");
    await db.inventoryItem.update({ where: { id: item.id }, data: { dailyRate: rate } });

    const crewCheck = await as(crew, () => gear.checkBundleAvailability(bundle.id, lumina.id));
    harness.assertEqual(crewCheck.aggregateDailyRate, null, "A kit's availability check carries no rate without Invoices View");
    const moneyCheck = await as(money, () => gear.checkBundleAvailability(bundle.id, lumina.id));
    harness.assert(typeof moneyCheck.aggregateDailyRate === "number", "…and its rate with it");
  });

  await harness.test("T26-UPLOAD-01: upload folders follow their area", async () => {
    const upload = async (folder: string, who: AccessMap) => {
      const form = new FormData();
      form.append("folder", folder);
      form.append("file", new File(["x"], "t26.png", { type: "image/png" }));
      const res = await as(who, () => uploadFile(new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: form })));
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      if (body.url) await fs.rm(path.join(process.cwd(), "public", body.url), { force: true });
      return res.status;
    };
    for (const [folder, { refused, allowed }] of Object.entries(UPLOAD_FOLDERS)) {
      harness.assertEqual(await upload(folder, refused), 403, `/api/upload ${folder}: refused one step below`);
      harness.assertEqual(await upload(folder, allowed), 201, `/api/upload ${folder}: allowed with exactly its need`);
    }
  });

  await harness.test("T26-PAGES-01: every admin page is in the table, with the check its code makes", async () => {
    const root = path.join(process.cwd(), "app", "[tenantSlug]", "admin");
    const found: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.name === "page.tsx") found.push(path.relative(root, full).split(path.sep).join("/"));
      }
    };
    await walk(root);
    const pages = found.filter((p) => !p.startsWith("manual/"));
    for (const p of pages) harness.assert(!!PAGES[p], `${p} is in the page table`);
    for (const p of Object.keys(PAGES)) harness.assert(pages.includes(p), `${p} still exists`);

    // The page's own rule, read from its source: areas and levels it compares, and whether it is owner-only.
    for (const [p, row] of Object.entries(PAGES)) {
      const src = await fs.readFile(path.join(root, ...p.split("/")), "utf8");
      const inCode = new Set<Need>();
      for (const m of src.matchAll(/!levelAtLeast\(viewer\.access\.areas\.(\w+), "(\w+)"\)/g)) inCode.add(`area:${m[1]}:${m[2]}`);
      if (/!viewer\?\.isOwner/.test(src)) inCode.add("owner");
      if (/!\(viewer\.access\.ticks\.(\w+)/.test(src)) inCode.add(`tick:${/!\(viewer\.access\.ticks\.(\w+)/.exec(src)![1]}`);
      if (/if \(!viewer\) return <NoAccess/.test(src)) inCode.add("staff");
      harness.assertEqual([...inCode].sort().join(" + "), [...row.needs].sort().join(" + "), `${p} opens with ${row.needs.join(" + ")}`);
    }
  });

  await harness.test("T26-PAGES-02: below its need a page shows No access; with exactly its need it opens", async () => {
    const isNoAccess = (el: unknown) => !!el && typeof el === "object" && (el as { type?: unknown }).type === NoAccess;
    for (const [p, row] of Object.entries(PAGES)) {
      for (const { label, who } of row.refused ?? oneShort(row.needs)) {
        let shown: unknown;
        try {
          shown = await as(who, () => row.render(pageCtx));
        } catch (e) {
          shown = e;
        }
        harness.assert(isNoAccess(shown), `${p}: No access with ${label}`, isNoAccess(shown) ? "" : String(shown).slice(0, 160));
      }
      for (const { label, who } of row.allowed ?? [{ label: `only ${row.needs.join(" + ")}`, who: exactly(row.needs) }]) {
        let shown: unknown;
        let error = "";
        try {
          shown = await as(who, () => row.render(pageCtx));
        } catch (e) {
          error = String(e).slice(0, 200);
        }
        harness.assert(!error && !isNoAccess(shown), `${p}: opens with ${label}`, error || "showed No access");
      }
    }
  });
}
