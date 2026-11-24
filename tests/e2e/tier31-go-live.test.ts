/**
 * Tier 31: Ready for real studios
 * - Production's public pages don't advertise the demo studios, their demo sign-ins, or the
 *   super-admin console; dev and staging still do
 * - The platform super-admin signs in on its own page, which studio accounts can't use
 * - A failed nightly backup emails every super-admin, through the app's own email settings
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { renderToStaticMarkup } from "react-dom/server";
import { showsDemoStudios } from "@/lib/demo-studios";
import { TestHarness } from "./test-harness";
import { provideReactGlobal, findProp } from "./react-tree";
import { withRequest, withSession, COOKIE_NAME } from "./mocks/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { createOrResetSuperAdmin } from "../../scripts/create-super-admin";
import SaasLandingPage from "@/app/(saas)/page";
import SaasLayout from "@/app/(saas)/layout";
import StudioLoginPage from "@/app/[tenantSlug]/login/page";
import PlatformLoginPage from "@/app/(saas)/super-admin/login/page";
import { PlatformLoginForm } from "@/components/auth/platform-login-form";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";
import { loginPlatformAdmin } from "@/lib/auth/session";
import { backupAlertKey } from "@/lib/ops-alert";
import { POST as alertPOST } from "@/app/api/ops/alert/route";

const ROOT = process.cwd();
const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_ADDRESS"] as const;

/** Runs `fn` with APP_ENV set to `value` (unset when undefined), then puts it back. */
async function withAppEnv<T>(value: string | undefined, fn: () => Promise<T> | T): Promise<T> {
  const saved = process.env.APP_ENV;
  if (value === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = value;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = saved;
  }
}

/** Every value of `key` in an element tree (without rendering child components). */
function allProps(node: unknown, key: string, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) allProps(child, key, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return out;
  if (key in props) out.push(props[key]);
  allProps(props.children, key, out);
  return out;
}

/** Whether the tree has an element of component `type`. */
function hasElement(node: unknown, type: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((child) => hasElement(child, type));
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === type) return true;
  return hasElement(el.props?.children, type);
}

const hrefs = (node: unknown) => allProps(node, "href").map(String);

export async function runTier31GoLiveTests(harness: TestHarness) {
  harness.setSuite("Tier 31", "Ready for real studios");
  await provideReactGlobal();

  const owner = await db.user.findFirstOrThrow({ where: { email: "alex@luminacine.com" }, include: { tenant: true } });
  const ownerSession = {
    id: owner.id,
    email: owner.email,
    name: owner.name,
    role: owner.role,
    tenantId: owner.tenantId,
    tenantSlug: owner.tenant?.slug ?? null,
  };

  await harness.test("T31-DEMO-01: production's public pages don't lead to the demo studios or the console", async () => {
    for (const [label, appEnv, shown] of [
      ["development", undefined, true],
      ["staging", "staging", true],
      ["production", "production", false],
    ] as const) {
      await withAppEnv(appEnv, async () => {
        const out = renderToStaticMarkup((await SaasLayout({ children: await SaasLandingPage() })) as never);
        const links = [...out.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
        harness.assert(!links.some((h) => h.startsWith("/super-admin")), `${label}: no link to the console`);
        harness.assertEqual(links.some((h) => h.includes("lumina-cine") || h.includes("apex-media")), false, `${label}: the landing page doesn't link demo studios`);
        harness.assertEqual(showsDemoStudios(), shown, `${label}: demo studios exist only outside production`);
      });
    }
  });

  await harness.test("T31-DEMO-02: demo sign-in shortcuts appear only on the demo studios, never in production", async () => {
    const page = (slug: string) =>
      withSession(null, async () =>
        StudioLoginPage({ params: Promise.resolve({ tenantSlug: slug }), searchParams: Promise.resolve({}) })
      );
    const dev = await withAppEnv(undefined, () => page("lumina-cine"));
    harness.assertDeepEqual(findProp(dev, "demo"), { owner: "alex@luminacine.com", staff: "sarah@luminacine.com" }, "Development: Lumina's demo accounts");
    const staging = await withAppEnv("staging", () => page("apex-media"));
    harness.assertDeepEqual(findProp(staging, "demo"), { owner: "david@apexmedia.com", staff: "aisyah@apexmedia.com" }, "Staging: Apex's demo accounts");
    const prod = await withAppEnv("production", () => page("lumina-cine"));
    harness.assertEqual(findProp(prod, "demo"), null, "Production: none, even for a studio at that address");

    const other = await db.tenant.create({ data: { name: "T31 Real Studio", slug: `t31-real-${Date.now().toString(36)}` } });
    harness.registerTeardown(async () => {
      await db.tenant.deleteMany({ where: { id: other.id } });
    });
    const real = await withAppEnv(undefined, () => page(other.slug));
    harness.assertEqual(findProp(real, "demo"), null, "Any other studio: none");
  });

  const root = await createOrResetSuperAdmin("t31-root@example.test");
  harness.registerTeardown(async () => {
    await db.user.deleteMany({ where: { email: { startsWith: "t31-" } } });
  });

  await harness.test("T31-PLAT-01: the super-admin signs in on the platform page; studio accounts can't", async () => {
    const ok = await withRequest(async (jar) => {
      const res = await loginPlatformAdmin("  T31-Root@Example.TEST ", root.password);
      return { res, cookie: jar.get(COOKIE_NAME) };
    });
    harness.assertEqual(ok.res.success, true, "Right password: signed in", JSON.stringify(ok.res));
    harness.assertEqual(ok.res.user?.role, "SUPER_ADMIN", "As the super-admin");
    harness.assert(!!ok.cookie, "The session cookie is set");

    const wrong = await withRequest(() => loginPlatformAdmin("t31-root@example.test", "not-the-password"));
    harness.assertEqual(wrong.error, "INVALID_CREDENTIALS", "Wrong password refused");

    const studio = await withRequest(async (jar) => {
      const res = await loginPlatformAdmin("alex@luminacine.com", "password123");
      return { res, cookie: jar.get(COOKIE_NAME) };
    });
    harness.assertEqual(studio.res.error, "INVALID_CREDENTIALS", "A studio owner's right password is refused here");
    harness.assertEqual(studio.cookie, undefined, "And no session is set");

    const flood = [];
    for (let i = 0; i < 11; i++) flood.push(await withRequest(() => loginPlatformAdmin("t31-flood@example.test", "guess")));
    harness.assertEqual(flood[9]?.error, "INVALID_CREDENTIALS", "Tenth try: still just wrong");
    harness.assertEqual(flood[10]?.error, "RATE_LIMITED", "Eleventh within ten minutes: rate-limited");

    const removed = await createOrResetSuperAdmin("t31-gone@example.test");
    await db.user.updateMany({ where: { email: "t31-gone@example.test" }, data: { deactivatedAt: new Date() } });
    const gone = await withRequest(() => loginPlatformAdmin("t31-gone@example.test", removed.password));
    harness.assertEqual(gone.error, "ACCOUNT_REMOVED", "A removed super-admin is refused");
  });

  await harness.test("T31-PLAT-02: the platform sign-in page shows the form, or moves a signed-in super-admin on", async () => {
    const signedOut = await withSession(null, () => PlatformLoginPage());
    harness.assert(hasElement(signedOut, PlatformLoginForm), "Signed out: the form");
    const asOwner = await withSession(ownerSession, () => PlatformLoginPage());
    harness.assert(hasElement(asOwner, PlatformLoginForm), "A studio owner: the form too");
    const rootUser = await db.user.findFirstOrThrow({ where: { email: "t31-root@example.test" } });
    const asRoot = await withSession(
      { id: rootUser.id, email: rootUser.email, name: rootUser.name, role: "SUPER_ADMIN", tenantId: null, tenantSlug: null },
      () => PlatformLoginPage()
    );
    harness.assert(hasElement(asRoot, SignedInRedirect), "The super-admin: moved on");
    harness.assertEqual(findProp(asRoot, "href"), "/super-admin", "To the console");
    const source = readFileSync(path.join(ROOT, "components/auth/platform-login-form.tsx"), "utf8");
    harness.assert(source.includes("create-super-admin"), "The form says how to reset a forgotten password");
  });

  // Alerts: route email through a capturing transport (nothing leaves the machine).
  const savedSmtp = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]]));
  const originalError = console.error;
  harness.registerTeardown(() => {
    setSmtpTransportForTests(null);
    console.error = originalError;
    for (const k of SMTP_KEYS) {
      if (savedSmtp[k] === undefined) delete process.env[k];
      else process.env[k] = savedSmtp[k];
    }
  });
  process.env.SMTP_HOST = "smtp.alerts.test";
  process.env.SMTP_PORT = "587";
  const outbox: { to: string; subject: string; html: string; text: string }[] = [];
  const json = nodemailer.createTransport({ jsonTransport: true });
  let failSending = false;
  setSmtpTransportForTests({
    sendMail: async (mail: { to: string; subject: string; html: string; text: string }) => {
      if (failSending) throw new Error("connect ECONNREFUSED");
      outbox.push(mail);
      return json.sendMail(mail);
    },
  } as unknown as Transporter);

  const secret = env.AUTH_SECRET;
  const key = backupAlertKey(secret);
  const alert = (query: string, body = "", headerKey: string | null = key) =>
    alertPOST(
      new Request(`http://localhost/api/ops/alert?${query}`, {
        method: "POST",
        headers: headerKey === null ? {} : { "x-cineflow-alert-key": headerKey },
        body,
      })
    );
  const superAdmins = async () =>
    (await db.user.findMany({ where: { role: "SUPER_ADMIN", deactivatedAt: null }, select: { email: true } })).map((u) => u.email).sort();

  await harness.test("T31-ALERT-01: the backup service and the app agree on the alert key", async () => {
    harness.assertEqual(key, createHash("sha256").update(`${secret}:backup-alert`).digest("hex"), "sha256 of the secret and a label");
    harness.assert(key !== secret && !key.includes(secret), "The key isn't the secret itself");
    const script = readFileSync(path.join(ROOT, "docker/backup/backup.sh"), "utf8");
    harness.assert(script.includes(`printf '%s' "\${AUTH_SECRET}:backup-alert" | sha256sum`), "backup.sh makes the same key");
    harness.assert(script.includes("http://app:3000/api/ops/alert"), "and sends it to the app");
  });

  await harness.test("T31-ALERT-02: a failed backup emails every super-admin; a wrong key sends nothing", async () => {
    for (const [label, headerKey] of [["No key", null], ["Wrong key", "0".repeat(64)], ["The secret itself", secret]] as const) {
      const res = await alert("kind=backup-failed&backup=2026-11-20_030000", "x", headerKey);
      harness.assertEqual(res.status, 401, `${label}: refused`);
    }
    harness.assertEqual(outbox.length, 0, "Nothing sent for refused requests");

    const res = await withAppEnv("production", () =>
      alert("kind=backup-failed&backup=2026-11-20_030000", "rsync: write failed: No space left on device <script>")
    );
    harness.assertEqual(res.status, 200, "Accepted", await res.clone().text());
    const recipients = await superAdmins();
    harness.assertDeepEqual(outbox.map((m) => String(m.to)).sort(), recipients, "One email to each active super-admin");
    harness.assert(recipients.includes("t31-root@example.test"), "Including the one made by create-super-admin");
    harness.assert(!outbox.some((m) => String(m.to) === "t31-gone@example.test"), "Not a removed one");
    const mail = outbox[0]!;
    harness.assert(mail.subject.includes("production") && mail.subject.includes("backup failed"), "Subject names the copy and the problem", mail.subject);
    harness.assert(mail.html.includes("2026-11-20_030000"), "Names the backup");
    harness.assert(mail.html.includes("No space left on device"), "Includes what went wrong");
    harness.assert(!mail.html.includes("<script>"), "Escaped");
    harness.assert(mail.text.includes("backup now"), "Says what to do next");

    outbox.length = 0;
    const test = await alert("kind=test");
    harness.assertEqual(test.status, 200, "A test alert is accepted");
    harness.assert(outbox.length === recipients.length && outbox[0]!.subject.toLowerCase().includes("test alert"), "and sent as a test", outbox[0]?.subject);
    const body = (await test.json()) as { sent?: number };
    harness.assertEqual(body.sent, recipients.length, "The reply says how many were sent");

    outbox.length = 0;
    const odd = await alert("kind=reboot");
    harness.assertEqual(odd.status, 400, "An unknown kind is refused");
    harness.assertEqual(outbox.length, 0, "and sends nothing");
  });

  await harness.test("T31-ALERT-03: the reply says when nobody could be told", async () => {
    console.error = () => {};
    failSending = true;
    try {
      const res = await alert("kind=test");
      harness.assertEqual(res.status, 502, "Every send failed: 502");
    } finally {
      failSending = false;
      console.error = originalError;
    }

    const active = await db.user.findMany({ where: { role: "SUPER_ADMIN", deactivatedAt: null }, select: { id: true } });
    await db.user.updateMany({ where: { id: { in: active.map((u) => u.id) } }, data: { deactivatedAt: new Date() } });
    try {
      const res = await alert("kind=test");
      harness.assertEqual(res.status, 409, "No super-admin: 409");
      harness.assert(((await res.json()) as { error?: string }).error?.includes("create-super-admin") ?? false, "Says how to make one");
    } finally {
      await db.user.updateMany({ where: { id: { in: active.map((u) => u.id) } }, data: { deactivatedAt: null } });
    }
  });

  await harness.test("T31-ALERT-04: the nightly job alerts on failure, and the host commands can send a test", async () => {
    const script = readFileSync(path.join(ROOT, "docker/backup/backup.sh"), "utf8");
    harness.assert(/alert backup-failed "\$name"/.test(script), "The nightly loop alerts when a backup fails");
    harness.assert(/alert-test\)/.test(script), "backup.sh has alert-test");
    const dockerfile = readFileSync(path.join(ROOT, "docker/backup/Dockerfile"), "utf8");
    harness.assert(/apk add[^\n]*\bcurl\b/.test(dockerfile), "The backup image has curl");
    const compose = readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");
    const backupService = compose.slice(compose.indexOf("\n  backup:"));
    harness.assert(backupService.includes("AUTH_SECRET: ${AUTH_SECRET:-}"), "The backup service gets AUTH_SECRET to make the key");
    // No depends_on: `docker compose run backup restore` must not start the app it restores into.
    harness.assert(!backupService.slice(0, backupService.indexOf("\nvolumes:")).includes("depends_on"), "The backup service never starts the app");
    for (const file of ["scripts/ops.mjs", "scripts/ops/lib.mjs"]) {
      const check = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { encoding: "utf8" });
      harness.assertEqual(check.status, 0, `${file} loads`, check.stderr);
    }
    const shell = spawnSync("sh", ["-n", path.join(ROOT, "docker/backup/backup.sh")], { encoding: "utf8" });
    if (!shell.error) harness.assertEqual(shell.status, 0, "backup.sh parses", shell.stderr);
    const ops = readFileSync(path.join(ROOT, "scripts/ops.mjs"), "utf8");
    harness.assert(ops.includes('case "test-alert"') && ops.includes('"backup", "alert-test"'), "ops.mjs test-alert runs it");
    harness.assert(!ops.includes('["compose", "build", "app"]'), "Deploys build every service, so backup changes reach the 24/7 PC");
  });
}
