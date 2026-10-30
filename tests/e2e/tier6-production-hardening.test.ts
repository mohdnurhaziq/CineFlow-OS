/**
 * Tier 6: Production Hardening & Operational Intelligence Tests
 * Verifies Executive Analytics Dashboard, Transactional Email/WhatsApp Notifications,
 * Dynamic Sitemap Generation, Robots.txt Rules, and Error Handling.
 */

import { TestHarness } from "./test-harness";
import { getStudioAnalytics } from "../../lib/actions/admin-analytics";
import {
  sendNotification,
  getNotificationHistory,
} from "../../lib/notifications";
import {
  createSessionToken,
  verifySessionToken,
  loginWithCredentials,
} from "../../lib/auth/session";
import sitemap from "../../app/sitemap";
import robots from "../../app/robots";

export async function runTier6ProductionHardeningTests(harness: TestHarness) {
  harness.setSuite("Tier 6", "Production Hardening & Operational Intelligence");

  // ============================================================================
  // Suite 6.1: Studio Executive Analytics & Multi-Tenant Isolation
  // ============================================================================
  await harness.test("T6-F01-01: getStudioAnalytics returns comprehensive KPIs for Lumina Cine", async () => {
    const analytics = await getStudioAnalytics("lumina-cine");
    harness.assert(analytics !== null, "Analytics data returned for valid tenant");
    harness.assertEqual(analytics?.tenant.slug, "lumina-cine", "Tenant slug matches lumina-cine");
    harness.assertEqual(analytics?.tenant.name, "Lumina CineWorks", "Tenant name matches Lumina CineWorks");

    // Check financial & operational KPIs
    harness.assert(typeof analytics?.kpis.totalRevenue === "number", "totalRevenue is a number");
    harness.assert(analytics!.kpis.totalRevenue >= 0, "totalRevenue is non-negative");
    harness.assert(typeof analytics?.kpis.gearTotalCount === "number", "gearTotalCount is a number");
    harness.assert(analytics!.kpis.gearTotalCount > 0, "Lumina has seeded gear inventory");
    harness.assert(typeof analytics?.kpis.gearUtilizationRate === "number", "gearUtilizationRate is a percentage");
    harness.assert(
      analytics!.kpis.gearUtilizationRate >= 0 && analytics!.kpis.gearUtilizationRate <= 100,
      "Utilization rate between 0-100%"
    );

    // Check pipeline and proposals
    harness.assert(analytics!.proposalsSummary.total >= 0, "proposalsSummary has total count");
    harness.assert(analytics!.recentInvoices.length >= 0, "recentInvoices list exists");
  });

  await harness.test("T6-F01-02: getStudioAnalytics strictly isolates Apex Media from Lumina Cine", async () => {
    const luminaData = await getStudioAnalytics("lumina-cine");
    const apexData = await getStudioAnalytics("apex-media");

    harness.assert(luminaData !== null, "Lumina data exists");
    harness.assert(apexData !== null, "Apex data exists");
    harness.assertNotEqual(luminaData?.tenant.id, apexData?.tenant.id, "Tenant IDs must differ");
    harness.assertEqual(apexData?.tenant.slug, "apex-media", "Apex slug matches");
    harness.assertEqual(apexData?.tenant.currency, "MYR", "Apex currency is MYR");

    // Verify recent invoices belong strictly to Apex
    for (const inv of apexData?.recentInvoices || []) {
      harness.assertNotEqual(inv.invoiceNumber, "INV-2026-LUMINA", "Apex invoices must not contain Lumina invoices");
    }
  });

  await harness.test("T6-F01-03: getStudioAnalytics returns null for non-existent studio slug", async () => {
    const nonExistent = await getStudioAnalytics("non-existent-studio-xyz");
    harness.assertEqual(nonExistent, null, "Returns null for invalid tenant slug");
  });

  // ============================================================================
  // Suite 6.2: Transactional Multi-Channel Notification Engine
  // ============================================================================
  await harness.test("T6-F02-01: Dispatches BOOKING_CONFIRMED with HTML email and WhatsApp link", async () => {
    const result = await sendNotification({
      event: "BOOKING_CONFIRMED",
      studioName: "Lumina Cine",
      studioSlug: "lumina-cine",
      clientName: "Elena Rostova",
      clientEmail: "elena@luxurybrand.com",
      clientPhone: "+60123456789",
      packageName: "Signature Editorial",
      slotDate: "Nov 15, 2026",
      startTime: "10:00 AM",
      endTime: "02:00 PM",
      depositAmount: 500.0,
      currency: "USD",
    });

    harness.assert(result.success, "Notification dispatched successfully");
    harness.assertEqual(result.event, "BOOKING_CONFIRMED", "Event matches BOOKING_CONFIRMED");
    harness.assert(result.emailSubject.includes("Lumina Cine"), "Subject includes studio name");
    harness.assert(result.emailHtml.includes("Elena Rostova"), "Email HTML addresses client");
    harness.assert(result.emailHtml.includes("Signature Editorial"), "Email HTML lists package");
    harness.assert(result.emailHtml.includes("USD 500.00"), "Email HTML lists deposit");
    harness.assert(result.whatsappUrl !== undefined, "WhatsApp dispatch URL generated");
    harness.assert(
      result.whatsappUrl!.startsWith("https://wa.me/60123456789"),
      "WhatsApp link targets client phone"
    );
  });

  await harness.test("T6-F02-02: Dispatches PAYMENT_APPROVED notification with milestone details", async () => {
    const result = await sendNotification({
      event: "PAYMENT_APPROVED",
      studioName: "Lumina Cine",
      studioSlug: "lumina-cine",
      clientName: "Elena Rostova",
      clientEmail: "elena@luxurybrand.com",
      clientPhone: "+60123456789",
      invoiceNumber: "INV-2026-9901",
      amount: 1750.0,
      currency: "USD",
      milestoneType: "RETAINER_50",
      projectTitle: "Autumn Luxury Campaign",
    });

    harness.assert(result.success, "Payment approved notification sent");
    harness.assert(result.emailSubject.includes("INV-2026-9901"), "Subject contains invoice number");
    harness.assert(result.emailHtml.includes("100% PAID & VERIFIED"), "HTML confirms paid verification");
    harness.assert(result.emailHtml.includes("Autumn Luxury Campaign"), "HTML includes project title");
  });

  await harness.test("T6-F02-03: Dispatches PAYMENT_REJECTED with reviewer note and action link", async () => {
    const result = await sendNotification({
      event: "PAYMENT_REJECTED",
      studioName: "Lumina Cine",
      studioSlug: "lumina-cine",
      clientName: "Elena Rostova",
      clientEmail: "elena@luxurybrand.com",
      invoiceNumber: "INV-2026-9902",
      amount: 500.0,
      currency: "USD",
      reason: "Bank slip blurred and transaction reference is unreadable.",
      reuploadUrl: "/lumina-cine/checkout?invoiceId=inv_9902",
    });

    harness.assert(result.success, "Payment rejection notification sent");
    harness.assert(result.emailHtml.includes("Bank slip blurred"), "HTML includes reviewer rejection note");
    harness.assert(result.emailSubject.includes("Action Required"), "Subject indicates action needed");
  });

  await harness.test("T6-F02-04: Dispatches PROPOSAL_SIGNED and VAULT_UNLOCKED notifications", async () => {
    const proposalResult = await sendNotification({
      event: "PROPOSAL_SIGNED",
      studioName: "Apex Media",
      studioSlug: "apex-media",
      clientName: "Farah Nadiah",
      clientEmail: "farah@graduate.utm.my",
      proposalNumber: "PROP-APEX-001",
      projectTitle: "Graduation Film Reel",
      totalPrice: 2400.0,
      depositRequired: 1200.0,
      currency: "MYR",
    });

    harness.assert(proposalResult.success, "Proposal signed notification dispatched");
    harness.assert(proposalResult.emailHtml.includes("PROP-APEX-001"), "HTML includes proposal ref");
    harness.assert(proposalResult.emailHtml.includes("MYR 1200.00"), "HTML includes retainer due");

    const vaultResult = await sendNotification({
      event: "VAULT_UNLOCKED",
      studioName: "Apex Media",
      studioSlug: "apex-media",
      clientName: "Farah Nadiah",
      clientEmail: "farah@graduate.utm.my",
      projectTitle: "Graduation Film Reel",
      vaultUrl: "/apex-media/vault/proj_apex_01",
    });

    harness.assert(vaultResult.success, "Vault unlocked notification dispatched");
    harness.assert(
      vaultResult.emailHtml.includes("50% milestone paywall is officially removed"),
      "HTML confirms paywall removed"
    );
    harness.assert(
      vaultResult.emailHtml.includes("/apex-media/vault/proj_apex_01"),
      "HTML includes direct vault link"
    );

    const history = getNotificationHistory();
    harness.assert(history.length >= 5, "Notification audit log tracks all dispatched events");
  });

  // ============================================================================
  // Suite 6.3: SEO, Robots.txt & Dynamic Multi-Tenant Sitemap
  // ============================================================================
  await harness.test("T6-F03-01: sitemap() dynamically returns platform and all studio routes", async () => {
    const map = await sitemap();
    harness.assert(Array.isArray(map), "Sitemap returns array of URL entries");
    harness.assert(map.length >= 6, "Sitemap includes platform and tenant routes");

    const urls = map.map((entry) => entry.url);
    harness.assert(urls.some((u) => u.includes("/lumina-cine")), "Lumina showcase is indexed");
    harness.assert(urls.some((u) => u.includes("/lumina-cine/book")), "Lumina booking portal is indexed");
    harness.assert(urls.some((u) => u.includes("/lumina-cine/visualizer")), "Lumina visualizer is indexed");
    harness.assert(urls.some((u) => u.includes("/apex-media")), "Apex showcase is indexed");
    harness.assert(urls.some((u) => u.includes("/create-studio")), "Onboarding is indexed");
  });

  await harness.test("T6-F03-02: robots() protects private admin & client vault routes while allowing public showcase", async () => {
    const rules = robots();
    harness.assert(rules.rules !== undefined, "Robots rules defined");
    harness.assert(rules.sitemap !== undefined, "Robots references sitemap.xml");

    const ruleArray = Array.isArray(rules.rules) ? rules.rules : [rules.rules];
    const defaultRule = ruleArray[0];
    harness.assert(defaultRule !== undefined, "Default user-agent rule exists");

    if (defaultRule) {
      const disallowed = Array.isArray(defaultRule.disallow)
        ? defaultRule.disallow
        : [defaultRule.disallow];
      harness.assert(
        disallowed.some((d) => typeof d === "string" && d.includes("/admin")),
        "Admin routes disallowed"
      );
      harness.assert(
        disallowed.some((d) => typeof d === "string" && d.includes("/vault")),
        "Vault routes disallowed"
      );
      harness.assert(
        disallowed.some((d) => typeof d === "string" && d.includes("/api/")),
        "API routes disallowed"
      );
    }
  });

  // ============================================================================
  // Suite 6.4: Cryptographic Session Authentication & Role Authorization
  // ============================================================================
  await harness.test("T6-F04-01: Cryptographic HMAC session tokens sign and verify accurately", async () => {
    const user = {
      id: "usr_lumina_owner",
      email: "alex@luminacine.com",
      name: "Alex Vance",
      role: "STUDIO_OWNER",
      tenantId: "tenant_lumina",
      tenantSlug: "lumina-cine",
    };

    const token = await createSessionToken(user);
    harness.assert(typeof token === "string", "Token is a string");
    harness.assert(token.includes("."), "Token contains dot separator for signature");

    const verified = await verifySessionToken(token);
    harness.assert(verified !== null, "Valid token verifies successfully");
    harness.assertEqual(verified?.email, "alex@luminacine.com", "Decoded email matches");
    harness.assertEqual(verified?.role, "STUDIO_OWNER", "Decoded role matches");
    harness.assertEqual(verified?.tenantSlug, "lumina-cine", "Decoded tenant slug matches");
  });

  await harness.test("T6-F04-02: Cryptographic token verifier strictly rejects forged or tampered signatures", async () => {
    const user = {
      id: "usr_lumina_owner",
      email: "alex@luminacine.com",
      name: "Alex Vance",
      role: "STUDIO_OWNER",
      tenantId: "tenant_lumina",
      tenantSlug: "lumina-cine",
    };

    const token = await createSessionToken(user);
    const [payloadBase64] = token.split(".");

    // Attempt 1: Forged signature
    const forgedToken = `${payloadBase64}.forged_tampered_signature_xyz123`;
    const forgedResult = await verifySessionToken(forgedToken);
    harness.assertEqual(forgedResult, null, "Forged signature rejected");

    // Attempt 2: Malformed token
    const malformedResult = await verifySessionToken("malformed_single_part_string");
    harness.assertEqual(malformedResult, null, "Malformed token rejected");
  });

  await harness.test("T6-F04-03: loginWithCredentials validates bcrypt hash and enforces tenant scoping", async () => {
    // 1. Valid Studio Owner login
    const validLogin = await loginWithCredentials("alex@luminacine.com", "password123", "lumina-cine");
    harness.assert(validLogin.success, "Valid owner login succeeds");
    harness.assertEqual(validLogin.user?.role, "STUDIO_OWNER", "User has STUDIO_OWNER role");

    // 2. Invalid password
    const invalidPassword = await loginWithCredentials("alex@luminacine.com", "wrongpassword", "lumina-cine");
    harness.assert(!invalidPassword.success, "Invalid password rejected");
    harness.assertEqual(invalidPassword.error, "INVALID_CREDENTIALS", "Error is INVALID_CREDENTIALS");

    // 3. Tenant mismatch (Lumina user trying to log into Apex Media)
    const tenantMismatch = await loginWithCredentials("alex@luminacine.com", "password123", "apex-media");
    harness.assert(!tenantMismatch.success, "Cross-tenant login rejected");
    harness.assertEqual(tenantMismatch.error, "TENANT_MISMATCH", "Error is TENANT_MISMATCH");

    // 4. Super Admin can access any tenant
    const superAdminLogin = await loginWithCredentials("superadmin@cineflow.app", "password123", "lumina-cine");
    harness.assert(superAdminLogin.success, "Super Admin can authenticate into tenant");
    harness.assertEqual(superAdminLogin.user?.role, "SUPER_ADMIN", "Super Admin role preserved");
  });
}
