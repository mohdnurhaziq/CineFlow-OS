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

import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { POST as uploadHandler } from "@/app/api/upload/route";
import { TestHarness } from "./test-harness";
import { registerClient } from "@/lib/actions/client-auth";
import { createBookingForCustomer, getBookingDetails } from "@/lib/actions/admin-bookings";
import { resendBookingConfirmation } from "@/lib/actions/admin-booking-lifecycle";
import { loadBookingDetails } from "@/lib/bookings/details";
import { expireUnpaidDeposits } from "@/lib/bookings/expiry";
import { createClientBooking } from "@/lib/actions/booking";
import { approvePaymentVerification, rejectPaymentVerification } from "@/lib/actions/admin-verification";
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
    await db.milestoneInvoice.deleteMany({ where: { client: { email: { startsWith: "t7-" } } } });
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
    const res = await withSession(null, () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: slot.id,
        newClient: { name: "Walk In", email: email("walkin"), phone: "0123456789" },
      })
    );
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

  await harness.test("T7-ADM-EMAIL-01: a booking staff make emails the customer a confirmation", async () => {
    const slot = await makeSlot(lumina.id);
    const e = email("emailconf");
    createdUserEmails.push(e);
    // Stub the email provider: capture what would be sent, touch no network.
    const realFetch = globalThis.fetch;
    const savedKey = process.env.RESEND_API_KEY;
    const sent: { to: string[]; subject: string; html: string; text: string }[] = [];
    process.env.RESEND_API_KEY = "re_test_key";
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes("api.resend.com")) sent.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
    }) as typeof fetch;
    try {
      const res: any = await withSession(luminaStaff, () =>
        createBookingForCustomer({
          tenantId: lumina.id,
          tenantSlug: "lumina-cine",
          slotId: slot.id,
          newClient: { name: "Email Walk In", email: e, phone: "0123456789" },
        })
      );
      harness.assert(res.success === true, `Booking created (${res.error ?? "ok"})`);
      const mail = sent.find((m) => m.to?.includes(e));
      harness.assert(!!mail, "A confirmation email is sent to the customer");
      harness.assert(!!mail?.subject?.includes("Confirmed"), "Subject says the booking is confirmed");
      harness.assert(!!mail?.html?.includes(res.trackingCode), "Email carries the booking reference");
      harness.assert(!!mail?.text?.includes("Deposit due"), "An unpaid deposit is shown as due, not paid");
      harness.assert(!mail?.text?.includes("Deposit paid"), "It does not claim the deposit was paid");

      // The new customer has no password yet: the button sets one, then opens their account.
      const href = (mail?.html?.match(/href="([^"]+)"/)?.[1] ?? "").replace(/&amp;/g, "&");
      const link = new URL(href, "http://localhost");
      harness.assertEqual(link.pathname, "/lumina-cine/register", "Link opens the studio's set-password page");
      harness.assertEqual(link.searchParams.get("email"), e, "with the customer's email filled in");
      harness.assertEqual(link.searchParams.get("next"), "/lumina-cine/account", "and continues to their account");
      harness.assert(!!mail?.html?.includes("Set your password"), "Button says to set a password");
      const token = link.searchParams.get("invite") ?? "";
      harness.assert(token.length > 20, "Link carries a one-time invite");
      const claimed: any = await withRequest(() =>
        registerClient({ tenantSlug: "lumina-cine", name: "Email Walk In", email: e, phone: "0123456789", password: "Sup3r-secret!", inviteToken: token })
      );
      harness.assertEqual(claimed.success, true, `The invite lets the customer set a password (${claimed.message ?? "ok"})`);
      const account = await db.user.findFirst({ where: { tenantId: lumina.id, email: e } });
      harness.assert(!!account?.passwordHash, "The account now has a password");
      harness.assertEqual(account?.inviteToken ?? null, null, "and the invite is used up");
    } finally {
      globalThis.fetch = realFetch;
      if (savedKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = savedKey;
    }
  });

  await harness.test("T7-ADM-EMAIL-02: a customer who already has a password gets a plain account link", async () => {
    const slot = await makeSlot(lumina.id);
    const input = validInput("emailexisting");
    const reg: any = await withRequest(() => registerClient(input));
    harness.assert(reg.success === true, "Customer registered with a password");
    const customer = await db.user.findFirst({ where: { tenantId: lumina.id, email: input.email.toLowerCase() } });
    const realFetch = globalThis.fetch;
    const savedKey = process.env.RESEND_API_KEY;
    const sent: { to: string[]; html: string }[] = [];
    process.env.RESEND_API_KEY = "re_test_key";
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes("api.resend.com")) sent.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
    }) as typeof fetch;
    try {
      const res: any = await withSession(luminaStaff, () =>
        createBookingForCustomer({ tenantId: lumina.id, tenantSlug: "lumina-cine", slotId: slot.id, clientId: customer!.id })
      );
      harness.assert(res.success === true, `Booking created (${res.error ?? "ok"})`);
      const mail = sent.find((m) => m.to?.includes(customer!.email));
      const href = (mail?.html?.match(/href="([^"]+)"/)?.[1] ?? "").replace(/&amp;/g, "&");
      harness.assertEqual(new URL(href, "http://localhost").pathname, "/lumina-cine/account", "Link opens their account");
      harness.assert(!href.includes("invite="), "No invite for an account that has a password");
      const after = await db.user.findUnique({ where: { id: customer!.id } });
      harness.assertEqual(after?.inviteToken ?? null, null, "No invite token was issued");
    } finally {
      globalThis.fetch = realFetch;
      if (savedKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = savedKey;
    }
  });

  await harness.test("T7-ADM-EMAIL-03: staff can resend a booking confirmation, with a clear result", async () => {
    const slot = await makeSlot(lumina.id);
    const e = email("resend");
    createdUserEmails.push(e);
    const realFetch = globalThis.fetch;
    const savedKey = process.env.RESEND_API_KEY;
    let reply: () => Response = () => new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
    const sent: { to: string[]; html: string }[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes("api.resend.com")) sent.push(JSON.parse(String(init?.body ?? "{}")));
      return reply();
    }) as typeof fetch;
    const originalError = console.error;
    console.error = () => {}; // the 403 case logs the provider's refusal on purpose
    try {
      delete process.env.RESEND_API_KEY; // made before email was set up: nothing sent
      const made: any = await withSession(luminaStaff, () =>
        createBookingForCustomer({ tenantId: lumina.id, tenantSlug: "lumina-cine", slotId: slot.id, newClient: { name: "Resend Me", email: e, phone: "0123456789" } })
      );
      harness.assert(made.success === true, "Booking created");
      const input = { tenantId: lumina.id, tenantSlug: "lumina-cine", bookingId: made.bookingId };

      const notSetUp: any = await withSession(luminaStaff, () => resendBookingConfirmation(input));
      harness.assertEqual(notSetUp.success, false, "Without an email key the resend reports failure");
      harness.assertEqual(notSetUp.error, "EMAIL_NOT_CONFIGURED", "and says email isn't set up");

      process.env.RESEND_API_KEY = "re_test_key";
      const ok: any = await withSession(luminaStaff, () => resendBookingConfirmation(input));
      harness.assertEqual(ok.success, true, `Resend succeeds (${ok.message ?? "ok"})`);
      harness.assertEqual(ok.sentTo, e, "and reports who it went to");
      const mail = sent.filter((m) => m.to?.includes(e)).at(-1);
      harness.assert(!!mail?.html?.includes("/lumina-cine/register?invite="), "The resent email carries a set-password link");

      reply = () => new Response(JSON.stringify({ statusCode: 403, message: "You can only send testing emails to your own email address. To send emails to other recipients, please verify a domain at resend.com/domains" }), { status: 403 });
      const refused: any = await withSession(luminaStaff, () => resendBookingConfirmation(input));
      harness.assertEqual(refused.success, false, "A provider refusal is reported");
      harness.assert(/verify (your|a) domain/i.test(refused.message ?? ""), `with the reason in plain words (${refused.message})`);

      const byOther: any = await withSession(asUser(apexOwner, "apex-media"), () => resendBookingConfirmation(input));
      harness.assertEqual(byOther.success, false, "Another studio's owner is refused");
      const byNobody: any = await withSession(null, () => resendBookingConfirmation(input));
      harness.assertEqual(byNobody.success, false, "A signed-out caller is refused");

      await db.clientBooking.update({ where: { id: made.bookingId }, data: { status: "CANCELLED" } });
      const cancelled: any = await withSession(luminaStaff, () => resendBookingConfirmation(input));
      harness.assertEqual(cancelled.error, "BOOKING_CANCELLED", "A cancelled booking can't be 'confirmed' again");
    } finally {
      console.error = originalError;
      globalThis.fetch = realFetch;
      if (savedKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = savedKey;
    }
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

  // ============================================================================
  // 7.2b Every booking path produces a deposit invoice the studio can verify
  // ============================================================================
  const pendingDepositInvoice = (clientId: string) =>
    db.milestoneInvoice.findFirst({
      where: { tenantId: lumina.id, clientId, milestoneType: "BOOKING_DEPOSIT" },
      orderBy: { createdAt: "desc" },
    });

  await harness.test("T7-BKG-01: booking-page popup (QR) creates a deposit invoice awaiting verification", async () => {
    const slot = await makeSlot(lumina.id);
    const e = email("popup-qr");
    createdUserEmails.push(e);
    const res: any = await withSession(null, () =>
      createClientBooking({
        tenantId: lumina.id,
        slotId: slot.id,
        sessionId: `t7-popup-${run}`,
        clientName: "Popup Client",
        clientEmail: e,
        clientPhone: "0123456789",
        paymentMethod: "QR_CODE",
        packageId: "pkg_lumina_exec",
      })
    );
    harness.assert(res.success === true, `Popup booking created (${res.error ?? "ok"})`);
    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assertEqual(booking?.status, "PENDING", "Booking is PENDING");
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "PENDING_VERIFICATION", "Slot is PENDING_VERIFICATION");
    const invoice = booking?.userId ? await pendingDepositInvoice(booking.userId) : null;
    harness.assert(!!invoice, "Deposit invoice exists for the booking's client");
    harness.assertEqual(invoice?.status, "PENDING_VERIFICATION", "Invoice is in the verification queue");
    const pkg = await db.servicePackage.findUnique({ where: { id: "pkg_lumina_exec" } });
    harness.assertEqual(invoice?.amount, pkg?.depositPrice, "Invoice amount equals the chosen package's deposit");
    harness.assertEqual(booking?.packageId, "pkg_lumina_exec", "Booking records the chosen package");
    harness.assertEqual(booking?.sessionPrice, pkg?.price, "Booking records the package price");
    harness.assertEqual(invoice?.paymentMethod, "QR_CODE", "Invoice records the QR payment method");
  });

  await harness.test("T7-BKG-02: popup card booking cannot skip payment when no gateway is set up", async () => {
    const slot = await makeSlot(lumina.id);
    const e = email("popup-card");
    createdUserEmails.push(e);
    const prev = process.env.ALLOW_SIMULATED_CARD_PAYMENTS;
    process.env.ALLOW_SIMULATED_CARD_PAYMENTS = "false";
    try {
      const res: any = await withSession(null, () =>
        createClientBooking({
          tenantId: lumina.id,
          slotId: slot.id,
          sessionId: `t7-popup-card-${run}`,
          clientName: "Card Client",
          clientEmail: e,
          clientPhone: "0123456789",
          paymentMethod: "CARD",
          packageId: "pkg_lumina_exec",
        })
      );
      harness.assert(res.success === false, "Card booking without a gateway is refused");
      harness.assert(/online payment/i.test(res.error ?? ""), `Refused for the payment reason (${res.error})`);
    } finally {
      process.env.ALLOW_SIMULATED_CARD_PAYMENTS = prev;
    }
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "AVAILABLE", "Slot stays AVAILABLE");
    const booking = await db.clientBooking.findFirst({ where: { clientEmail: e } });
    harness.assert(!booking, "No booking was created");
  });

  await harness.test("T7-BKG-03: unpaid staff booking is verifiable and approval confirms it", async () => {
    const slot = await makeSlot(lumina.id);
    const e = email("staff-unpaid");
    createdUserEmails.push(e);
    const res: any = await withSession(luminaStaff, () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: slot.id,
        newClient: { name: "Counter Client", email: e, phone: "0123456789" },
        paymentMethod: "CASH",
      })
    );
    harness.assert(res.success === true, `Staff booking created (${res.error ?? "ok"})`);
    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    const invoice = booking?.userId ? await pendingDepositInvoice(booking.userId) : null;
    harness.assertEqual(invoice?.status, "PENDING_VERIFICATION", "Unpaid staff booking has an invoice to verify");
    harness.assertEqual(invoice?.amount, slot.depositRequired, "Invoice amount equals the slot deposit");

    const approved: any = await withSession(luminaStaff, () =>
      approvePaymentVerification({
        invoiceId: invoice!.id,
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
      })
    );
    harness.assert(approved.success === true, `Approval succeeds (${approved.message ?? "ok"})`);
    const confirmed = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assertEqual(confirmed?.status, "CONFIRMED", "Booking CONFIRMED after approval");
    harness.assertEqual(confirmed?.depositPaid, true, "Deposit marked paid");
    const bookedSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(bookedSlot?.status, "BOOKED", "Slot BOOKED after approval");
  });

  await harness.test("T7-BKG-04: paid staff booking records a PAID deposit invoice", async () => {
    const slot = await makeSlot(lumina.id);
    const e = email("staff-paid");
    createdUserEmails.push(e);
    const res: any = await withSession(luminaStaff, () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: slot.id,
        newClient: { name: "Paid Client", email: e, phone: "0123456789" },
        paymentStatus: "PAID",
        paymentMethod: "CASH",
      })
    );
    harness.assert(res.success === true, `Staff booking created (${res.error ?? "ok"})`);
    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    const invoice = booking?.userId ? await pendingDepositInvoice(booking.userId) : null;
    harness.assertEqual(invoice?.status, "PAID", "Invoice is PAID");
    harness.assert(!!invoice?.paidAt && !!invoice?.verifiedBy, "Invoice records who took the payment and when");
  });

  await harness.test("T7-BKG-05: booking details link each booking to its own deposit invoice", async () => {
    // Two bookings for the same customer: each must get its own invoice, not the other's.
    const e = email("details");
    createdUserEmails.push(e);
    const first: any = await withSession(luminaStaff, async () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: (await makeSlot(lumina.id)).id,
        newClient: { name: "Details Client", email: e, phone: "0123456789" },
        creativeBrief: "Golden hour family portraits",
        paymentMethod: "QR_CODE",
      })
    );
    const customer = await db.user.findFirst({ where: { tenantId: lumina.id, email: e } });
    const second: any = await withSession(luminaStaff, async () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: (await makeSlot(lumina.id)).id,
        clientId: customer!.id,
        paymentStatus: "PAID",
      })
    );
    harness.assert(first.success === true && second.success === true, "Both bookings created");

    const all = await loadBookingDetails(lumina.id);
    const a = all.find((b) => b.id === first.bookingId);
    const b = all.find((x) => x.id === second.bookingId);
    harness.assertEqual(a?.invoice?.status, "PENDING_VERIFICATION", "Unpaid booking shows its pending invoice");
    harness.assertEqual(b?.invoice?.status, "PAID", "Paid booking shows its paid invoice");
    harness.assert(!!a?.invoice && a.invoice.id !== b?.invoice?.id, "The two bookings have different invoices");
    harness.assertEqual(a?.creativeBrief, "Golden hour family portraits", "Creative brief included");
    harness.assertEqual(a?.clientPhone, "0123456789", "Client phone included");
    harness.assert(/^\d{4}-\d{2}-\d{2}$/.test(a?.sessionDate ?? ""), "Session date is YYYY-MM-DD");
    harness.assert(!!a?.slot?.startTime, "Slot time included");
    const apexIds = new Set((await db.clientBooking.findMany({ where: { tenantId: apex.id }, select: { id: true } })).map((r) => r.id));
    harness.assert(apexIds.size > 0 && !all.some((x) => apexIds.has(x.id)), "No other studio's bookings are included");
  });

  await harness.test("T7-BKG-06: getBookingDetails is limited to the studio's own staff", async () => {
    const e = email("details-auth");
    createdUserEmails.push(e);
    const created: any = await withSession(luminaStaff, async () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: (await makeSlot(lumina.id)).id,
        newClient: { name: "Private Client", email: e, phone: "0123456789" },
      })
    );
    const input = { tenantId: lumina.id, bookingId: created.bookingId };

    const staff: any = await withSession(luminaStaff, () => getBookingDetails(input));
    harness.assert(staff.success === true, "Studio staff can read the booking");
    harness.assertEqual(staff.booking?.clientEmail, e, "Returns the requested booking");

    const anon: any = await withSession(null, () => getBookingDetails(input));
    harness.assert(anon.success === false && !anon.booking, "Anonymous caller gets nothing");
    const otherStudio: any = await withSession(asUser(apexOwner, "apex-media"), () => getBookingDetails(input));
    harness.assert(otherStudio.success === false && !otherStudio.booking, "Another studio's owner gets nothing");
    const otherStudioOwnTenant: any = await withSession(asUser(apexOwner, "apex-media"), () =>
      getBookingDetails({ tenantId: apex.id, bookingId: created.bookingId })
    );
    harness.assert(
      otherStudioOwnTenant.success === false && !otherStudioOwnTenant.booking,
      "Asking under their own studio id does not expose another studio's booking"
    );
    const clientUser = await db.user.findFirst({ where: { tenantId: lumina.id, role: "CLIENT" } });
    const asClient: any = await withSession(asUser(clientUser!, "lumina-cine"), () => getBookingDetails(input));
    harness.assert(asClient.success === false && !asClient.booking, "CLIENT accounts cannot read studio bookings");
  });

  // One client, two pending bookings: each deposit invoice must act on its own booking only.
  const twoPendingBookings = async (tag: string) => {
    const e = email(tag);
    createdUserEmails.push(e);
    const older: any = await withSession(luminaStaff, async () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: (await makeSlot(lumina.id)).id,
        newClient: { name: "Two Bookings", email: e, phone: "0123456789" },
        paymentMethod: "QR_CODE",
      })
    );
    const customer = await db.user.findFirst({ where: { tenantId: lumina.id, email: e } });
    const newer: any = await withSession(luminaStaff, async () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: (await makeSlot(lumina.id)).id,
        clientId: customer!.id,
        paymentMethod: "CASH",
      })
    );
    const olderInvoice = await db.milestoneInvoice.findFirst({ where: { bookingId: older.bookingId } });
    const newerInvoice = await db.milestoneInvoice.findFirst({ where: { bookingId: newer.bookingId } });
    return { older, newer, olderInvoice, newerInvoice };
  };

  await harness.test("T7-BKG-07: every new deposit invoice is linked to its booking", async () => {
    const { older, newer, olderInvoice, newerInvoice } = await twoPendingBookings("linked");
    harness.assert(!!olderInvoice && !!newerInvoice, "Staff-created deposit invoices carry bookingId");
    harness.assert(olderInvoice?.id !== newerInvoice?.id, "Each booking has its own invoice");

    const slot = await makeSlot(lumina.id);
    const e = email("linked-popup");
    createdUserEmails.push(e);
    const popup: any = await withSession(null, () =>
      createClientBooking({
        tenantId: lumina.id,
        slotId: slot.id,
        sessionId: `t7-linked-${run}`,
        clientName: "Linked Popup",
        clientEmail: e,
        clientPhone: "0123456789",
        paymentMethod: "QR_CODE",
        packageId: "pkg_lumina_exec",
      })
    );
    harness.assert(popup.success === true && !!popup.bookingId, `Popup booking created (${popup.error ?? "ok"})`);
    const popupInvoice = popup.bookingId
      ? await db.milestoneInvoice.findFirst({ where: { bookingId: popup.bookingId } })
      : null;
    harness.assert(!!popupInvoice, "Checkout-created deposit invoice carries bookingId");
    harness.assert(!!older.bookingId && !!newer.bookingId, "Both staff bookings created");
  });

  await harness.test("T7-BKG-08: approving one deposit confirms only its own booking", async () => {
    const { older, newer, olderInvoice } = await twoPendingBookings("approve-own");
    // Approve the OLDER booking's invoice: the newer pending booking must stay untouched.
    const res: any = await withSession(luminaStaff, () =>
      approvePaymentVerification({ invoiceId: olderInvoice!.id, tenantId: lumina.id, tenantSlug: "lumina-cine" })
    );
    harness.assert(res.success === true, `Approval succeeds (${res.message ?? "ok"})`);
    const a = await db.clientBooking.findUnique({ where: { id: older.bookingId }, include: { slot: true } });
    const b = await db.clientBooking.findUnique({ where: { id: newer.bookingId }, include: { slot: true } });
    harness.assertEqual(a?.status, "CONFIRMED", "The approved booking is CONFIRMED");
    harness.assertEqual(a?.slot?.status, "BOOKED", "Its slot is BOOKED");
    harness.assertEqual(b?.status, "PENDING", "The other booking stays PENDING");
    harness.assertEqual(b?.depositPaid, false, "The other booking's deposit stays unpaid");
    harness.assertEqual(b?.slot?.status, "PENDING_VERIFICATION", "The other slot stays PENDING_VERIFICATION");
  });

  await harness.test("T7-BKG-09: a rejected deposit that expires releases only its own booking", async () => {
    const { older, newer, olderInvoice } = await twoPendingBookings("reject-own");
    const olderSlotId = (await db.clientBooking.findUnique({ where: { id: older.bookingId } }))?.slotId;
    const res: any = await withSession(luminaStaff, () =>
      rejectPaymentVerification({
        invoiceId: olderInvoice!.id,
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        reason: "Slip does not match",
      })
    );
    harness.assert(res.success === true, `Rejection succeeds (${res.message ?? "ok"})`);
    harness.assertEqual((await db.clientBooking.findUnique({ where: { id: older.bookingId } }))?.status, "PENDING", "Rejection alone keeps the booking");
    // No new slip within 24 hours of the rejection.
    await db.milestoneInvoice.update({ where: { id: olderInvoice!.id }, data: { rejectedAt: new Date(Date.now() - 25 * 3_600_000) } });
    await expireUnpaidDeposits(lumina.id);
    const a = await db.clientBooking.findUnique({ where: { id: older.bookingId } });
    const b = await db.clientBooking.findUnique({ where: { id: newer.bookingId }, include: { slot: true } });
    harness.assertEqual(a?.status, "CANCELLED", "The rejected booking is CANCELLED");
    const released = olderSlotId ? await db.bookingSlot.findUnique({ where: { id: olderSlotId } }) : null;
    harness.assertEqual(released?.status, "AVAILABLE", "Its slot is released");
    harness.assertEqual(b?.status, "PENDING", "The other booking stays PENDING");
    harness.assertEqual(b?.slot?.status, "PENDING_VERIFICATION", "The other slot is untouched");
  });

  await harness.test("T7-BKG-10: an unlinked invoice with two possible bookings changes neither", async () => {
    const { older, newer, olderInvoice } = await twoPendingBookings("ambiguous");
    // Simulate an old invoice from before the link existed, with no tracking code to go on.
    await db.milestoneInvoice.update({
      where: { id: olderInvoice!.id },
      data: { bookingId: null, paymentReference: "QR_SLIP_UPLOAD" },
    });
    await db.milestoneInvoice.updateMany({ where: { bookingId: newer.bookingId }, data: { bookingId: null } });
    const res: any = await withSession(luminaStaff, () =>
      approvePaymentVerification({ invoiceId: olderInvoice!.id, tenantId: lumina.id, tenantSlug: "lumina-cine" })
    );
    harness.assert(res.success === true, "Invoice itself is marked paid");
    const a = await db.clientBooking.findUnique({ where: { id: older.bookingId } });
    const b = await db.clientBooking.findUnique({ where: { id: newer.bookingId } });
    harness.assertEqual(a?.status, "PENDING", "No guess: first booking unchanged");
    harness.assertEqual(b?.status, "PENDING", "No guess: second booking unchanged");
  });

  // ============================================================================
  // 7.3 Upload endpoint hardening
  // ============================================================================
  const uploadedFiles: string[] = [];
  harness.registerTeardown(async () => {
    for (const url of uploadedFiles) await fs.unlink(path.join(process.cwd(), "public", url.replace(/^\//, ""))).catch(() => null);
  });

  const upload = async (opts: {
    folder?: string;
    type?: string;
    name?: string;
    bytes?: BlobPart;
    ip?: string;
    user?: any;
  }) => {
    const form = new FormData();
    form.append("file", new File([opts.bytes ?? "x"], opts.name ?? "a.png", { type: opts.type ?? "image/png" }));
    if (opts.folder) form.append("folder", opts.folder);
    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: form,
      headers: { "x-forwarded-for": opts.ip ?? `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    });
    const res = await withSession(opts.user ?? null, () => uploadHandler(req));
    const body: any = await res.json();
    if (body.url) uploadedFiles.push(body.url);
    return { status: res.status, body };
  };

  await harness.test("T7-UPL-01: anonymous visitors can upload only to logos and receipts", async () => {
    const logo = await upload({ folder: "logos" });
    harness.assertEqual(logo.status, 201, "Anonymous logo upload allowed (create-studio flow)");
    const receipt = await upload({ folder: "receipts", type: "application/pdf", name: "r.pdf" });
    harness.assertEqual(receipt.status, 201, "Anonymous receipt upload allowed (checkout flow)");
    for (const folder of ["qrcodes", "frames", "showcase", "deliverables", "signatures", "general", "unknown-folder"]) {
      const res = await upload({ folder });
      harness.assertEqual(res.status, 401, `Anonymous upload to ${folder} requires sign-in`);
    }
  });

  await harness.test("T7-UPL-02: CLIENT accounts cannot write to staff-only folders", async () => {
    const client = await db.user.findFirst({ where: { tenantId: lumina.id, role: "CLIENT" } });
    const res = await upload({ folder: "showcase", user: asUser(client!, "lumina-cine") });
    harness.assertEqual(res.status, 403, "CLIENT role gets 403 for showcase");
  });

  await harness.test("T7-UPL-03: staff can upload to staff folders, including SVG and video", async () => {
    const png = await upload({ folder: "showcase", user: luminaStaff });
    harness.assertEqual(png.status, 201, "Staff image upload to showcase allowed");
    const svg = await upload({ folder: "logos", type: "image/svg+xml", name: "l.svg", user: luminaStaff });
    harness.assertEqual(svg.status, 201, "Staff SVG logo allowed");
    const video = await upload({ folder: "deliverables", type: "video/mp4", name: "v.mp4", user: luminaStaff });
    harness.assertEqual(video.status, 201, "Staff video allowed");
  });

  await harness.test("T7-UPL-04: anonymous uploads reject SVG and video even in public folders", async () => {
    const svg = await upload({ folder: "logos", type: "image/svg+xml", name: "x.svg", bytes: "<svg onload=alert(1)/>" });
    harness.assertEqual(svg.status, 400, "Anonymous SVG rejected");
    const video = await upload({ folder: "receipts", type: "video/mp4", name: "x.mp4" });
    harness.assertEqual(video.status, 400, "Anonymous video rejected");
  });

  await harness.test("T7-UPL-05: stored extension comes from MIME type, not the client filename", async () => {
    const res = await upload({ folder: "logos", type: "image/png", name: "evil.html" });
    harness.assertEqual(res.status, 201, "Upload accepted as a PNG");
    harness.assert(String(res.body.url).endsWith(".png"), `Saved as .png (got ${res.body.url})`);
    const traversal = await upload({ folder: "../../etc", type: "image/png", name: "../../x.png" });
    harness.assertEqual(traversal.status, 401, "Path-traversal folder falls back to a staff-only folder");
    harness.assert(!String(traversal.body.url ?? "").includes(".."), "No traversal in any returned URL");
  });

  await harness.test("T7-UPL-06: oversized files are rejected (10MB documents)", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const anon = await upload({ folder: "receipts", bytes: big });
    harness.assertEqual(anon.status, 413, "Anonymous oversized image rejected with 413");
    const staff = await upload({ folder: "showcase", bytes: big, user: luminaStaff });
    harness.assertEqual(staff.status, 413, "Staff oversized image rejected with 413");
  });

  await harness.test("T7-UPL-07: anonymous uploads are rate limited per IP", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 250)}`;
    let limited = false;
    for (let i = 0; i < 25 && !limited; i++) {
      limited = (await upload({ folder: "receipts", ip })).status === 429;
    }
    harness.assert(limited, "429 returned after repeated anonymous uploads");
    const other = await upload({ folder: "receipts", ip: "198.51.100.9" });
    harness.assertEqual(other.status, 201, "A different IP is unaffected");
  });
}
