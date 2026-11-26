/**
 * Tier 47: what a brand-new studio gets (from the 27 November sign-up walkthrough)
 * - A welcome email: the admin link, the booking link, the trial's end, and (for an account whose
 *   email isn't proven yet) a one-time link to confirm it
 * - Nothing unfinished shows to the public: the sample package starts switched off, a blank bio stays
 *   blank, and the page names only payment ways the studio has set up
 * - The dashboard's banner and empty-state lines say what is true
 */
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TestHarness } from "./test-harness";
import { provideReactGlobal } from "./react-tree";
import { db } from "@/lib/db";
import { onboardStudio } from "@/lib/actions/onboarding";
import { createLoginFromProof } from "@/lib/auth/login";
import { getSetupChecklist } from "@/lib/onboarding/checklist";
import { studioUrl } from "@/lib/domain-name";
import { formatStudioDate } from "@/lib/slot-time";
import { paymentWaysFor } from "@/lib/payments/offered";
import { gearNotes, gearPanelAllClear, revenueNote } from "@/lib/analytics/kpi-notes";
import { ShowcaseFooter } from "@/components/showcase/showcase-footer";
import { withIp } from "./mocks/session";

const read = (p: string) => readFileSync(p, "utf8");
type Mail = { to: string[]; subject: string; html: string; text?: string };

export async function runTier47NewStudioTests(harness: TestHarness) {
  harness.setSuite("Tier 47", "A brand-new studio");
  await provideReactGlobal();

  const run = Date.now().toString(36);
  let n = 0;

  /** Signs up a studio with Resend stubbed, and returns what was sent. */
  const signUp = async (opts: { email?: string; bio?: string; mailFails?: boolean } = {}) => {
    n += 1;
    const slug = `t47-${n}-${run}`;
    const email = opts.email ?? `t47-${n}-${run}@example.test`;
    harness.registerTeardown(async () => {
      await db.tenant.deleteMany({ where: { slug } });
      await db.login.deleteMany({ where: { email } });
    });
    const realFetch = globalThis.fetch;
    const savedKey = process.env.RESEND_API_KEY;
    const savedSmtp = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST; // SMTP would win over the stubbed Resend
    const sent: Mail[] = [];
    process.env.RESEND_API_KEY = "re_test_key";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("api.resend.com")) {
        if (opts.mailFails) throw new Error("mail service down");
        sent.push(JSON.parse(String(init?.body ?? "{}")) as Mail);
      }
      return new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
    }) as typeof fetch;
    try {
      const res = (await withIp(`10.47.0.${n}`, () =>
        onboardStudio({ name: `T47 Studio ${n}`, slug, discipline: "HYBRID", currency: "MYR", ownerName: "T47 Owner", ownerEmail: email, password: "password123", bio: opts.bio } as never)
      )) as { success?: boolean; error?: string };
      return { res, sent, slug, email };
    } finally {
      globalThis.fetch = realFetch;
      if (savedSmtp !== undefined) process.env.SMTP_HOST = savedSmtp;
      if (savedKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = savedKey;
    }
  };

  await harness.test("T47-WELCOME-01: a new owner is emailed the admin link, the booking link, the trial's end and a confirm link", async () => {
    const { res, sent, slug, email } = await signUp();
    harness.assert(res.success === true, "The studio is created", JSON.stringify(res));
    const mine = sent.filter((m) => m.to.includes(email));
    harness.assertEqual(mine.length, 1, "One email to the owner");
    const mail = mine[0]!;
    harness.assert(/T47 Studio .* is ready/.test(mail.subject ?? ""), "Subject says the studio is ready", mail.subject);
    harness.assert(mail.html.includes(studioUrl(slug, "/admin")), "Has the admin link");
    harness.assert(mail.html.includes(studioUrl(slug, "/book")), "Has the booking link");
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug } });
    harness.assert(mail.html.includes(formatStudioDate(tenant.trialEndsAt!)), "Says when the trial ends", formatStudioDate(tenant.trialEndsAt!));
    harness.assert(mail.html.includes("reset-password") && mail.html.includes("join=1"), "Has the confirm-my-email link");
    const owner = await db.user.findFirstOrThrow({ where: { tenantId: tenant.id, role: "STUDIO_OWNER" } });
    harness.assert(Boolean(owner.passwordResetToken), "The link has a live one-time token");
    harness.assert(!mail.html.includes("password123"), "Never the password");
    harness.assert(/same one you just chose/.test(mail.html), "Says the link asks for a password, and that it can be the same one");
  });

  await harness.test("T47-WELCOME-02: an owner whose email is already proven gets no confirm link", async () => {
    const email = `t47-proven-${run}@example.test`;
    harness.registerTeardown(async () => {
      await db.login.deleteMany({ where: { email } });
    });
    await createLoginFromProof(email, await bcrypt.hash("password123", 4));
    const { res, sent } = await signUp({ email });
    harness.assert(res.success === true, "The studio is created", JSON.stringify(res));
    const mail = sent.find((m) => m.to.includes(email) && /is ready/.test(m.subject));
    harness.assert(Boolean(mail), "Still gets the welcome");
    harness.assert(Boolean(mail) && !mail!.html.includes("reset-password"), "No confirm link: nothing to confirm");
  });

  await harness.test("T47-WELCOME-03: a failed email never fails the sign-up", async () => {
    const { res, slug } = await signUp({ mailFails: true });
    harness.assert(res.success === true, "The studio is created anyway", JSON.stringify(res));
    harness.assertEqual(await db.tenant.count({ where: { slug } }), 1, "It exists");
  });

  await harness.test("T47-SAMPLE-01: the sample package starts switched off, and doesn't count as a service until switched on", async () => {
    const { slug } = await signUp();
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug }, include: { servicePackages: true } });
    harness.assertEqual(tenant.servicePackages.length, 1, "One sample");
    harness.assertEqual(tenant.servicePackages[0]!.isActive, false, "Switched off, so clients don't see it");
    const done = async () => (await getSetupChecklist(tenant.id)).steps.find((s) => s.id === "services")!.done;
    harness.assertEqual(await done(), false, "The checklist step isn't ticked yet");
    await db.servicePackage.update({ where: { id: tenant.servicePackages[0]!.id }, data: { isActive: true } });
    harness.assertEqual(await done(), true, "Ticked once a package is offered");
    harness.assert(/switch it on/i.test(read("components/admin/onboarding/setup-checklist.tsx")), "The step tells the owner about the sample");
  });

  await harness.test("T47-BIO-01: a blank bio stays blank (no filler on the public page); a typed one is kept", async () => {
    const blank = await signUp();
    harness.assertEqual((await db.tenant.findUniqueOrThrow({ where: { slug: blank.slug } })).bio, null, "Blank stays blank");
    const typed = await signUp({ bio: "We film weddings in Penang." });
    harness.assertEqual((await db.tenant.findUniqueOrThrow({ where: { slug: typed.slug } })).bio, "We film weddings in Penang.", "Typed bio kept");
    harness.assert(!read("app/(saas)/create-studio/page.tsx").includes("Crafting cinematic visuals"), "The preview shows no made-up bio either");
  });

  await harness.test("T47-FOOTER-01: the public footer names only the payment ways the studio has set up", async () => {
    const none = { qrCodeUrl: null, bankDetails: "  ", toyyibpaySecretEnc: null, toyyibpayCategoryCode: null };
    harness.assertDeepEqual(paymentWaysFor(none), { online: false, qr: false, bank: false }, "Nothing set up");
    harness.assertDeepEqual(paymentWaysFor({ ...none, toyyibpaySecretEnc: "x" }), { online: false, qr: false, bank: false }, "A key with no category can't take payments");
    harness.assertDeepEqual(paymentWaysFor({ qrCodeUrl: "/q.png", bankDetails: "Maybank 1", toyyibpaySecretEnc: "x", toyyibpayCategoryCode: "c" }), { online: true, qr: true, bank: true }, "All three");
    const footer = (payments: { online: boolean; qr: boolean; bank: boolean }) =>
      renderToStaticMarkup(createElement(ShowcaseFooter, { tenant: { name: "S", slug: "s", discipline: "HYBRID", currency: "MYR" }, payments }));
    const empty = footer({ online: false, qr: false, bank: false });
    harness.assert(!/Pay online|Pay by QR|bank transfer/i.test(empty), "No payment claims");
    harness.assert(empty.includes("Your private online gallery"), "The gallery line stays");
    harness.assert(footer({ online: true, qr: false, bank: false }).includes("Pay online"), "Online");
    harness.assert(footer({ online: false, qr: true, bank: true }).includes("Pay by QR transfer"), "QR");
    harness.assert(footer({ online: false, qr: false, bank: true }).includes("Pay by bank transfer"), "Bank only");
    harness.assert(/paymentWaysFor\(/.test(read("app/[tenantSlug]/page.tsx")), "The studio page passes the real ones");
  });

  await harness.test("T47-BANNER-01: the sign-in banner asks to confirm the email, and the manual uses the same words", async () => {
    const banner = read("components/auth/one-login-invite.tsx");
    harness.assert(/>Confirm your email<\/h2>/.test(banner), "Heading");
    harness.assert(!/choose one password/i.test(banner), "Doesn't ask someone who just chose a password to choose one");
    harness.assert(read("app/[tenantSlug]/admin/manual/settings-and-team/page.tsx").includes("<Ui>Confirm your email</Ui>"), "The manual matches");
  });

  await harness.test("T47-DASH-01: a studio with no money and no gear shows that, not 100%", async () => {
    harness.assertEqual(revenueNote(0), "No payments yet", "No money");
    harness.assertEqual(revenueNote(10), "100% verified", "With money, as before");
    harness.assertDeepEqual(gearNotes({ total: 0, maintenance: 0, utilization: 0 }), { use: "No gear added yet", condition: null, repair: false }, "No gear");
    harness.assertDeepEqual(gearNotes({ total: 4, maintenance: 0, utilization: 25 }), { use: "25% in use", condition: "fleet 100% operational", repair: false }, "Healthy fleet");
    harness.assertDeepEqual(gearNotes({ total: 4, maintenance: 1, utilization: 0 }), { use: "0% in use", condition: "1 in repair", repair: true }, "One in repair");
    harness.assertDeepEqual(gearPanelAllClear(0), { title: "No gear added yet", detail: "Add your equipment to track it here" }, "The gear panel says there's nothing to report");
    harness.assertDeepEqual(gearPanelAllClear(3), { title: "All Equipment Operational", detail: "Zero items quarantined or under repair" }, "With gear and no problems, as before");
    const dash = read("components/admin/studio-dashboard.tsx");
    harness.assert(/revenueNote\(/.test(dash) && /gearNotes\(/.test(dash), "The dashboard uses them");
    harness.assert(!dash.includes("100% verified") && !dash.includes("fleet 100% operational") && !dash.includes("All Equipment Operational"), "No fixed claims left");
  });
}
