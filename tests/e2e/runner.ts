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
import { runFrameworkStorageTests } from "./tier1/01-framework-storage.test";
import { runSaaSShowcaseTests } from "./tier1/02-saas-showcase.test";
import { runCheckoutVaultTests } from "./tier1/03-checkout-vault.test";
import { runLogisticsGearWallTests } from "./tier1/04-logistics-gear-wall.test";
import { runAdminVerificationTests } from "./tier1/05-admin-verification.test";
import { runTier2BoundaryTests } from "./tier2-boundary-corner-cases.test";
import { runTier3CrossFeatureTests } from "./tier3-cross-feature-combinations.test";
import { runTier4RealWorldScenariosTests } from "./tier4-real-world-scenarios.test";
import { runTier5AdversarialHardeningTests } from "./tier5-adversarial-hardening.test";

async function runMasterTestSuite() {
  const harness = new TestHarness("CineFlow OS", "Master E2E Verification Suite");
  const overallStart = Date.now();

  console.log("================================================================================");
  console.log("   CINEFLOW OS — MASTER END-TO-END INTEGRATION & VERIFICATION RUNNER");
  console.log("   Executing Tiers 1 through 5 (Comprehensive Feature Coverage & Hardening)");
  console.log("================================================================================");

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
  } catch (err: any) {
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
