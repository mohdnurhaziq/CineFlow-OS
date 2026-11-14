/**
 * CineFlow OS — Master E2E Integration & Verification Test Runner
 *
 * Sequentially executes all 5 Tiers of End-to-End Tests:
 *   Tier 1: 235 Comprehensive Feature Verification Tests (Features 1–47) across 5 modular suites
 *   Tier 2: 35 Boundary & Corner Case Tests (5 Core Domains)
 *   Tier 3: 6 Cross-Feature Combinations + 1 Canonical 9-Step Client Journey
 *   Tier 4: 3 Real-World Multi-Tenant Studio Lifecycles
 *   Tier 5: 4 Adversarial Stress & Hardening Suites
 *
 * Driven by Zero-Dependency native Node.js assertions & tsx.
 */

import { TestHarness } from "./test-harness";
import { db } from "@/lib/db";
import { setAmbientSession } from "./mocks/session";
import { runFrameworkStorageTests } from "./tier1/01-framework-storage.test";
import { runSaaSShowcaseTests } from "./tier1/02-saas-showcase.test";
import { runCheckoutVaultTests } from "./tier1/03-checkout-vault.test";
import { runLogisticsGearWallTests } from "./tier1/04-logistics-gear-wall.test";
import { runAdminVerificationTests } from "./tier1/05-admin-verification.test";
import { runTier2BoundaryTests } from "./tier2-boundary-corner-cases.test";
import { runTier3CrossFeatureTests } from "./tier3-cross-feature-combinations.test";
import { runTier4RealWorldScenariosTests } from "./tier4-real-world-scenarios.test";
import { runTier5AdversarialHardeningTests } from "./tier5-adversarial-hardening.test";
import { runTier6ProductionHardeningTests } from "./tier6-production-hardening.test";
import { runTier7ClientAccountsTests } from "./tier7-client-accounts-admin-booking.test";
import { runTier8EmailDeliveryTests } from "./tier8-email-delivery.test";
import { runTier9ToyyibpayTests } from "./tier9-toyyibpay-gateway.test";
import { runTier10AuthorizationTests } from "./tier10-authorization.test";
import { runTier11BookingCalendarTests } from "./tier11-booking-calendar.test";
import { runTier12BillingTests } from "./tier12-billing.test";
import { runTier13InvoiceTests } from "./tier13-invoices.test";
import { runTier14BookingLifecycleTests } from "./tier14-booking-lifecycle.test";
import { runTier15ProjectTests } from "./tier15-projects.test";
import { runTier16OnboardingGuideTests } from "./tier16-onboarding-guide.test";
import { runTier17ClientsTests } from "./tier17-clients.test";

// The suite creates and mutates lots of records; refuse to run against anything but the
// throwaway test database (use `npm run test:e2e`, which builds prisma/test.db).
if (!/^file:.*\btest\.db$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error(
    `Refusing to run E2E tests against DATABASE_URL="${process.env.DATABASE_URL ?? ""}". Use \`npm run test:e2e\`.`
  );
}

// Never let the suite send real email, even if a real key or SMTP login is present in the environment.
process.env.RESEND_API_KEY = "";
for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_ADDRESS"]) delete process.env[key];
// Earlier tiers exercise the fake instant card flow; Tier 9 tests the real gateway path explicitly.
process.env.ALLOW_SIMULATED_CARD_PAYMENTS = "true";

async function runMasterTestSuite() {
  const harness = new TestHarness("CineFlow OS", "Master E2E Verification Suite");
  const overallStart = Date.now();

  console.log("================================================================================");
  console.log("   CINEFLOW OS — MASTER END-TO-END INTEGRATION & VERIFICATION RUNNER");
  console.log("   Executing Tiers 1 through 6 (Comprehensive Feature Coverage & Hardening)");
  console.log("================================================================================");

  // Feature tiers call staff-only actions directly; run them as the platform admin.
  const superAdmin = await db.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (!superAdmin) throw new Error("Seed SUPER_ADMIN user is required for the E2E runner");
  await setAmbientSession({
    id: superAdmin.id,
    email: superAdmin.email,
    name: superAdmin.name,
    role: superAdmin.role,
    tenantId: superAdmin.tenantId,
    tenantSlug: null,
  });

  try {
    // --------------------------------------------------------------------------
    // Tier 1: Modular Feature Suites (Features 1–47)
    // --------------------------------------------------------------------------
    await runFrameworkStorageTests(harness);
    await runSaaSShowcaseTests(harness);
    await runCheckoutVaultTests(harness);
    await runLogisticsGearWallTests(harness);
    await runAdminVerificationTests(harness);

    // --------------------------------------------------------------------------
    // Tier 2: Boundary & Corner Cases (Domains 1–5)
    // --------------------------------------------------------------------------
    await runTier2BoundaryTests(harness);

    // --------------------------------------------------------------------------
    // Tier 3: Cross-Feature Combinations & Full Client Journey
    // --------------------------------------------------------------------------
    await runTier3CrossFeatureTests(harness);

    // --------------------------------------------------------------------------
    // Tier 4: Real-World Multi-Tenant Studio Lifecycles
    // --------------------------------------------------------------------------
    await runTier4RealWorldScenariosTests(harness);

    // --------------------------------------------------------------------------
    // Tier 5: Adversarial Hardening & Stress Penetration Suites
    // --------------------------------------------------------------------------
    await runTier5AdversarialHardeningTests(harness);

    // --------------------------------------------------------------------------
    // Tier 6: Production Hardening, Operational Intelligence & Multi-Channel Comms
    // --------------------------------------------------------------------------
    await runTier6ProductionHardeningTests(harness);

    // --------------------------------------------------------------------------
    // Tier 7: Client Accounts & Admin Booking on Behalf
    // --------------------------------------------------------------------------
    await runTier7ClientAccountsTests(harness);

    // --------------------------------------------------------------------------
    // Tier 8: Transactional Email Delivery (provider stubbed, no network)
    // --------------------------------------------------------------------------
    await runTier8EmailDeliveryTests(harness);

    // --------------------------------------------------------------------------
    // Tier 9: Toyyibpay payment gateway (API stubbed, no real money)
    // --------------------------------------------------------------------------
    await runTier9ToyyibpayTests(harness);

    // --------------------------------------------------------------------------
    // Tier 10: Server-action authorization (every staff action guards itself)
    // --------------------------------------------------------------------------
    await runTier10AuthorizationTests(harness);

    // --------------------------------------------------------------------------
    // Tier 11: Public booking calendar (dates, clock-time order, no past sessions)
    // --------------------------------------------------------------------------
    await runTier11BookingCalendarTests(harness);

    // --------------------------------------------------------------------------
    // Tier 12: Booking billing (package pricing, balance invoice, 24h deposit hold)
    // --------------------------------------------------------------------------
    await runTier12BillingTests(harness);

    // --------------------------------------------------------------------------
    // Tier 13: Invoice documents (content and who may open them)
    // --------------------------------------------------------------------------
    await runTier13InvoiceTests(harness);

    // --------------------------------------------------------------------------
    // Tier 14: Booking lifecycle (move, cancel, done / no-show, deliver)
    // --------------------------------------------------------------------------
    await runTier14BookingLifecycleTests(harness);

    // --------------------------------------------------------------------------
    // Tier 15: Proposals, projects, call sheets, gear and deliverables
    // --------------------------------------------------------------------------
    await runTier15ProjectTests(harness);

    // --------------------------------------------------------------------------
    // Tier 16: Admin onboarding guide (setup checklist, dashboard tour)
    // --------------------------------------------------------------------------
    await runTier16OnboardingGuideTests(harness);

    // --------------------------------------------------------------------------
    // Tier 17: Admin Clients section (directory, profile, edits, notes, CSV)
    // --------------------------------------------------------------------------
    await runTier17ClientsTests(harness);
  } catch (err) {
    console.error("\n\x1b[31m[CRITICAL RUNNER ERROR]\x1b[0m Unhandled exception in test runner:", err);
  } finally {
    await harness.runTeardown();
  }

  const durationSec = ((Date.now() - overallStart) / 1000).toFixed(2);
  console.log(`\nAll tiers completed in ${durationSec}s.`);
  harness.printSummary();

  const summary = harness.summary();
  process.exit(summary.exitCode);
}

runMasterTestSuite();
