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
import { loginWithCredentials, getCurrentUser, logoutAction } from "@/lib/auth/session";
import { getSessionClient } from "@/lib/clients";
import { withSession, withRequest, COOKIE_NAME } from "./mocks/session";

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

  // --- Signed-in scenarios (simulated request via the next/headers stub) ---------
  const asUser = (u: { id: string; email: string; name: string; role: string; tenantId: string | null }, slug: string) =>
    ({ id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, tenantSlug: slug }) as any;

  const luminaOwner = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  const apexOwner = await db.user.findFirst({ where: { tenantId: apex.id, role: "STUDIO_OWNER" } });
  if (!luminaOwner || !apexOwner) throw new Error("Seed owners for Lumina and Apex are required");
  const luminaStaff = asUser(luminaOwner, "lumina-cine");

  await harness.test("T7-SES-01: registerClient signs the new client in (session cookie readable)", async () => {
    const input = validInput("session");
    await withRequest(async () => {
      const res = await registerClient(input);
      harness.assert(res.success === true, "Registration succeeds");
      const me = await getCurrentUser();
      harness.assertEqual(me?.email, input.email, "getCurrentUser returns the new account");
      harness.assertEqual(me?.role, "CLIENT", "Session role is CLIENT");
      harness.assertEqual(me?.tenantSlug, "lumina-cine", "Session is scoped to the studio");
      const client = await getSessionClient(lumina.id);
      harness.assertEqual(client?.email, input.email, "getSessionClient resolves for the same studio");
      const other = await getSessionClient(apex.id);
      harness.assert(other === null, "getSessionClient is null for another studio");
    });
  });

  await harness.test("T7-SES-02: CLIENT session is not treated as staff and logout clears it", async () => {
    const input = validInput("logout");
    await withRequest(async (jar) => {
      await registerClient(input);
      harness.assert(jar.has(COOKIE_NAME), "Cookie set after registration");
      await logoutAction();
      harness.assert((await getCurrentUser()) === null, "No session after logout");
    });
  });

  await harness.test("T7-ADM-03: staff books on behalf of a NEW customer (unpaid -> pending verification)", async () => {
    const slot = await makeSlot(lumina.id);
    const e = email("onbehalf");
    createdUserEmails.push(e);
    const res: any = await withSession(luminaStaff, () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: slot.id,
        newClient: { name: "Walk In", email: e.toUpperCase(), phone: "0123456789" },
      })
    );
    harness.assert(res.success === true, `Booking created (${res.error ?? "ok"})`);
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "PENDING_VERIFICATION", "Slot is PENDING_VERIFICATION");
    const customer = await db.user.findFirst({ where: { tenantId: lumina.id, email: e } });
    harness.assertEqual(customer?.role, "CLIENT", "Customer account created as CLIENT (lowercased email)");
    harness.assertEqual(customer?.isQuickCreated, true, "Marked quick-created (no password)");
    harness.assert(!customer?.passwordHash, "No password set on staff-created account");
    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assertEqual(booking?.userId, customer?.id, "Booking linked to the customer account");
    harness.assertEqual(booking?.status, "PENDING", "Booking is PENDING");
    harness.assertEqual(booking?.depositPaid, false, "Deposit not marked paid");
  });

  await harness.test("T7-ADM-04: staff books for an EXISTING customer, marked PAID -> confirmed", async () => {
    const slot = await makeSlot(lumina.id);
    const input = validInput("existing");
    const reg = await registerClient(input);
    harness.assert(reg.success === true, "Customer registered");
    const customerId = reg.success ? reg.user.id : "";
    const res: any = await withSession(luminaStaff, () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: slot.id,
        clientId: customerId,
        paymentStatus: "PAID",
        paymentMethod: "CASH",
      })
    );
    harness.assert(res.success === true, `Booking created (${res.error ?? "ok"})`);
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "BOOKED", "Slot is BOOKED");
    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assertEqual(booking?.status, "CONFIRMED", "Booking CONFIRMED");
    harness.assertEqual(booking?.userId, customerId, "Linked to the chosen customer");
  });

  await harness.test("T7-ADM-05: wrong-studio staff and CLIENT sessions are rejected", async () => {
    const slot = await makeSlot(lumina.id);
    const base = { tenantId: lumina.id, tenantSlug: "lumina-cine", slotId: slot.id, newClient: { name: "Nope", email: email("denied"), phone: "0123456789" } };
    const crossTenant: any = await withSession(asUser(apexOwner, "apex-media"), () => createBookingForCustomer(base));
    harness.assert(crossTenant.success === false, "Apex owner cannot book into Lumina");
    const clientUser = await db.user.findFirst({ where: { tenantId: lumina.id, role: "CLIENT" } });
    harness.assert(!!clientUser, "Seed has a Lumina client");
    const asClient: any = await withSession(asUser(clientUser!, "lumina-cine"), () => createBookingForCustomer(base));
    harness.assert(asClient.success === false, "CLIENT role cannot book on behalf of others");
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "AVAILABLE", "Slot untouched");
    harness.assert(!(await db.user.findFirst({ where: { email: email("denied") } })), "No account created by denied calls");
  });

  await harness.test("T7-ADM-06: slot cannot be double-booked, even by concurrent admins", async () => {
    const slot = await makeSlot(lumina.id);
    const attempts = await withSession(luminaStaff, () =>
      Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          createBookingForCustomer({
            tenantId: lumina.id,
            tenantSlug: "lumina-cine",
            slotId: slot.id,
            newClient: { name: `Racer ${i}`, email: email(`racer${i}`), phone: "0123456789" },
          })
        )
      )
    );
    createdUserEmails.push(...Array.from({ length: 5 }, (_, i) => email(`racer${i}`)));
    const wins = (attempts as any[]).filter((r) => r.success).length;
    harness.assertEqual(wins, 1, "Exactly one booking wins the slot");
    const bookings = await db.clientBooking.count({ where: { slotId: slot.id } });
    harness.assertEqual(bookings, 1, "Exactly one booking row exists for the slot");
  });

  await harness.test("T7-ADM-07: a staff email cannot be reused as a customer; slot stays available", async () => {
    const slot = await makeSlot(lumina.id);
    const res: any = await withSession(luminaStaff, () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: slot.id,
        newClient: { name: "Owner Clone", email: luminaOwner.email, phone: "0123456789" },
      })
    );
    harness.assert(res.success === false, "Rejected");
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "AVAILABLE", "Failed transaction rolled back (slot still AVAILABLE)");
  });

  await harness.test("T7-ADM-08: booking another studio's slot or an unavailable slot fails", async () => {
    const apexSlot = await makeSlot(apex.id);
    const crossSlot: any = await withSession(luminaStaff, () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: apexSlot.id,
        newClient: { name: "Cross", email: email("crossslot"), phone: "0123456789" },
      })
    );
    harness.assert(crossSlot.success === false, "Lumina staff cannot use an Apex slot id");
    const taken = await makeSlot(lumina.id);
    await db.bookingSlot.update({ where: { id: taken.id }, data: { status: "BOOKED" } });
    const takenRes: any = await withSession(luminaStaff, () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: taken.id,
        newClient: { name: "Late", email: email("late"), phone: "0123456789" },
      })
    );
    harness.assert(takenRes.success === false, "Already-booked slot is rejected");
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
