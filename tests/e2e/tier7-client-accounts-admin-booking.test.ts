/**
 * Tier 7: Client Accounts & Admin Booking-on-Behalf Tests
 * Covers registerClient (validation, duplicates, guest-claim ownership proof,
 * tenant scoping, reserved super-admin emails) and createBookingForCustomer
 * (input validation and the staff-only authorization guard).
 *
 * The runner has no HTTP request context, so session cookies cannot be set or
 * read here. That is exactly what we assert for the auth guard: an
 * unauthenticated caller must never be able to book on a customer's behalf.
 */

import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { registerClient } from "@/lib/actions/client-auth";
import { createBookingForCustomer } from "@/lib/actions/admin-bookings";
import { loginWithCredentials } from "@/lib/auth/session";

export async function runTier7ClientAccountsTests(harness: TestHarness) {
  harness.setSuite("Tier 7", "Client Accounts & Admin Booking on Behalf");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  if (!lumina || !apex) throw new Error("Seed tenants lumina-cine / apex-media are required");

  const run = Date.now().toString(36);
  const email = (tag: string) => `t7-${tag}-${run}@example.test`;
  const createdUserEmails: string[] = [];
  const createdSlotIds: string[] = [];

  harness.registerTeardown(async () => {
    await db.clientBooking.deleteMany({ where: { clientEmail: { startsWith: "t7-" } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: createdSlotIds } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t7-" } } });
  });

  const validInput = (tag: string, tenantSlug = "lumina-cine") => {
    const e = email(tag);
    createdUserEmails.push(e);
    return { tenantSlug, name: "Test Client", email: e, phone: "0123456789", password: "supersecret1" };
  };

  // ============================================================================
  // 7.1 registerClient
  // ============================================================================
  await harness.test("T7-REG-01: registers a new CLIENT account scoped to the studio", async () => {
    const input = validInput("new");
    const res = await registerClient(input);
    harness.assert(res.success === true, "Registration succeeds");
    if (res.success) {
      harness.assertEqual(res.user.role, "CLIENT", "Role is CLIENT");
      harness.assertEqual(res.user.tenantId, lumina.id, "Account belongs to Lumina");
    }
    const row = await db.user.findFirst({ where: { tenantId: lumina.id, email: input.email } });
    harness.assert(!!row?.passwordHash, "Password stored as hash");
    harness.assert(row?.passwordHash !== input.password, "Password is not stored in plaintext");
  });

  await harness.test("T7-REG-02: new client can log in with the registered credentials", async () => {
    const input = validInput("login");
    await registerClient(input);
    const ok = await loginWithCredentials(input.email, input.password, "lumina-cine");
    harness.assert(ok.success === true, "Login with correct password succeeds");
    const bad = await loginWithCredentials(input.email, "wrong-password", "lumina-cine");
    harness.assert(bad.success === false, "Login with wrong password fails");
  });

  await harness.test("T7-REG-03: email is normalised to lowercase", async () => {
    const input = validInput("case");
    const res = await registerClient({ ...input, email: input.email.toUpperCase() });
    harness.assert(res.success === true, "Upper-case email registers");
    const row = await db.user.findFirst({ where: { tenantId: lumina.id, email: input.email } });
    harness.assert(!!row, "Stored lowercase");
  });

  await harness.test("T7-REG-04: duplicate email at the same studio is rejected", async () => {
    const input = validInput("dup");
    await registerClient(input);
    const again = await registerClient(input);
    harness.assert(again.success === false, "Second registration rejected");
    if (!again.success) harness.assertEqual(again.error, "EMAIL_EXISTS", "Error is EMAIL_EXISTS");
  });

  await harness.test("T7-REG-05: same email may register at a different studio (per-tenant accounts)", async () => {
    const input = validInput("multi");
    await registerClient(input);
    const other = await registerClient({ ...input, tenantSlug: "apex-media" });
    harness.assert(other.success === true, "Registers at Apex too");
    if (other.success) harness.assertEqual(other.user.tenantId, apex.id, "Account belongs to Apex");
  });

  await harness.test("T7-REG-06: input validation (short name, bad email, short phone, short password)", async () => {
    const base = validInput("invalid");
    const cases: Array<[string, Partial<typeof base>]> = [
      ["short name", { name: "A" }],
      ["bad email", { email: "not-an-email" }],
      ["short phone", { phone: "123" }],
      ["short password", { password: "short" }],
      ["overlong password", { password: "x".repeat(73) }],
    ];
    for (const [label, patch] of cases) {
      const res = await registerClient({ ...base, ...patch });
      harness.assert(res.success === false && res.error === "INVALID_INPUT", `Rejects ${label}`);
    }
  });

  await harness.test("T7-REG-07: unknown studio is rejected", async () => {
    const res = await registerClient(validInput("ghost", "no-such-studio"));
    harness.assert(res.success === false && res.error === "TENANT_NOT_FOUND", "TENANT_NOT_FOUND returned");
  });

  await harness.test("T7-REG-08: staff and super-admin emails cannot be claimed as client accounts", async () => {
    const owner = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
    harness.assert(!!owner, "Seed has a Lumina owner");
    const res = await registerClient({ ...validInput("staff"), email: owner!.email });
    harness.assert(res.success === false && res.error === "EMAIL_EXISTS", "Owner email rejected");
    const owned = await db.user.findUnique({ where: { id: owner!.id } });
    harness.assertEqual(owned?.role, "STUDIO_OWNER", "Owner role untouched");

    const superAdmin = await db.user.findFirst({ where: { role: "SUPER_ADMIN" } });
    if (superAdmin) {
      const sa = await registerClient({ ...validInput("super"), email: superAdmin.email });
      harness.assert(sa.success === false && sa.error === "EMAIL_EXISTS", "Super-admin email reserved");
    }
  });

  await harness.test("T7-REG-09: guest-booking account requires a matching tracking code to claim", async () => {
    const guestEmail = email("guest");
    createdUserEmails.push(guestEmail);
    const guest = await db.user.create({
      data: { tenantId: lumina.id, name: "Guest", email: guestEmail, phone: "0111111111", role: "CLIENT", isQuickCreated: true },
    });
    const code = `BK-T7-${run}`.toUpperCase();
    await db.clientBooking.create({
      data: {
        tenantId: lumina.id,
        trackingCode: code,
        category: "Wedding",
        clientName: "Guest",
        clientEmail: guestEmail,
        clientPhone: "0111111111",
        discipline: "PHOTOGRAPHY",
        serviceTier: "STANDARD",
        targetDate: "2030-01-01",
        userId: guest.id,
      },
    });
    const claimInput = { ...validInput("guest"), email: guestEmail };

    const none = await registerClient(claimInput);
    harness.assert(none.success === false && none.error === "CLAIM_REQUIRED", "No code -> CLAIM_REQUIRED");
    const wrong = await registerClient({ ...claimInput, claimCode: "BK-WRONG" });
    harness.assert(wrong.success === false && wrong.error === "CLAIM_INVALID", "Wrong code -> CLAIM_INVALID");
    const stillOpen = await db.user.findUnique({ where: { id: guest.id } });
    harness.assert(!stillOpen?.passwordHash, "Account not claimed by failed attempts");

    const good = await registerClient({ ...claimInput, claimCode: code.toLowerCase() });
    harness.assert(good.success === true, "Correct code (case-insensitive) claims the account");
    const claimed = await db.user.findUnique({ where: { id: guest.id } });
    harness.assert(!!claimed?.passwordHash, "Password now set");
    harness.assertEqual(claimed?.isQuickCreated, false, "isQuickCreated cleared");

    const replay = await registerClient({ ...claimInput, claimCode: code });
    harness.assert(replay.success === false && replay.error === "EMAIL_EXISTS", "Claimed account cannot be re-claimed");
  });

  await harness.test("T7-REG-10: concurrent registrations of one email yield exactly one account", async () => {
    const input = validInput("race");
    const results = await Promise.all(Array.from({ length: 6 }, () => registerClient(input)));
    const wins = results.filter((r) => r.success).length;
    const internal = results.filter((r) => !r.success && r.error === "INTERNAL_ERROR").length;
    const rows = await db.user.count({ where: { tenantId: lumina.id, email: input.email } });
    harness.assertEqual(rows, 1, "Exactly one user row exists");
    harness.assertEqual(wins, 1, "Exactly one registration reports success");
    harness.assertEqual(internal, 0, "Losers get a clean rejection, not INTERNAL_ERROR");
  });

  await harness.test("T7-REG-11: repeated attempts are rate limited per studio+email", async () => {
    const input = validInput("rate");
    await registerClient(input);
    let limited = false;
    for (let i = 0; i < 12 && !limited; i++) {
      const res = await registerClient(input);
      limited = !res.success && res.error === "RATE_LIMITED";
    }
    harness.assert(limited, "RATE_LIMITED triggers within 12 attempts");
  });

  // ============================================================================
  // 7.2 createBookingForCustomer
  // ============================================================================
  const makeSlot = async (tenantId: string) => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId,
        date: new Date(Date.now() + 86400000 * 20),
        startTime: "10:00 AM",
        endTime: "11:00 AM",
        status: "AVAILABLE",
        price: 400,
        depositRequired: 100,
      },
    });
    createdSlotIds.push(slot.id);
    return slot;
  };

  await harness.test("T7-ADM-01: unauthenticated caller cannot book on behalf of a customer", async () => {
    const slot = await makeSlot(lumina.id);
    const res = await createBookingForCustomer({
      tenantId: lumina.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      newClient: { name: "Walk In", email: email("walkin"), phone: "0123456789" },
    });
    harness.assert(res.success === false, "Rejected without a session");
    harness.assert(String((res as any).error).includes("not allowed"), "Error is the authorization message");
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "AVAILABLE", "Slot remains AVAILABLE");
    const leaked = await db.user.findFirst({ where: { tenantId: lumina.id, email: email("walkin") } });
    harness.assert(!leaked, "No customer account created by the rejected call");
  });

  await harness.test("T7-ADM-02: input validation precedes any side effects", async () => {
    const slot = await makeSlot(lumina.id);
    const noCustomer = await createBookingForCustomer({ tenantId: lumina.id, tenantSlug: "lumina-cine", slotId: slot.id });
    harness.assert(noCustomer.success === false && String((noCustomer as any).error).includes("customer"), "Requires a customer");
    const badEmail = await createBookingForCustomer({
      tenantId: lumina.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      newClient: { name: "Walk In", email: "nope", phone: "0123456789" },
    });
    harness.assert(badEmail.success === false, "Rejects invalid customer email");
    const badPayment = await createBookingForCustomer({
      tenantId: lumina.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      clientId: "x",
      paymentStatus: "REFUNDED" as any,
    });
    harness.assert(badPayment.success === false, "Rejects unknown payment status");
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "AVAILABLE", "Slot untouched by invalid calls");
  });
}
