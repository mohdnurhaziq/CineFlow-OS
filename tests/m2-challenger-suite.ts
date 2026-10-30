import { db } from "@/lib/db";
import { checkSlugAvailability, onboardStudio } from "@/lib/actions/onboarding";
import { holdBookingSlot, releaseBookingSlot, getTenantBookingSlots, createClientBooking } from "@/lib/actions/booking";
import { getPlatformMetrics, getAllTenantsSummary } from "@/lib/actions/super-admin";
import { getTenantBySlug } from "@/lib/tenant";
import bcrypt from "bcryptjs";

interface ChallengeResult {
  suiteName: string;
  passed: boolean;
  assertionsPassed: number;
  failures: string[];
}

async function runAdversarialM2Suite() {
  console.log("===============================================================");
  console.log("   CineFlow OS M2 Adversarial & Concurrency Stress Test Suite  ");
  console.log("===============================================================\n");

  const suites: ChallengeResult[] = [];

  function createSuite(name: string): ChallengeResult {
    const s = { suiteName: name, passed: true, assertionsPassed: 0, failures: [] };
    suites.push(s);
    return s;
  }

  function assert(suite: ChallengeResult, condition: boolean, message: string, details?: string) {
    if (condition) {
      suite.assertionsPassed++;
      console.log(`  ✓ ${message}`);
    } else {
      suite.passed = false;
      const failMsg = details ? `${message} (Details: ${details})` : message;
      suite.failures.push(failMsg);
      console.error(`  ❌ FAIL: ${failMsg}`);
    }
  }

  // Fetch seed tenants
  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  if (!lumina || !apex) throw new Error("Seed tenants missing");

  // ============================================================================
  // Challenge 1: Reserved Slugs & Onboarding Validation Bypass
  // ============================================================================
  {
    const s = createSuite("Challenge 1: Reserved Slugs & Onboarding Validation Bypass");
    console.log(`\n--- [${s.suiteName}] ---`);

    // A: Test checkSlugAvailability on reserved slugs
    const reservedSlugs = ["super-admin", "create-studio", "api", "admin", "login", "auth", "public", "uploads", "_next", "favicon.ico"];
    for (const slug of reservedSlugs) {
      const res = await checkSlugAvailability(slug);
      assert(s, res.available === false, `checkSlugAvailability rejects reserved slug '${slug}'`);
    }

    // B: Test checkSlugAvailability on invalid slug regex
    const invalidSlugs = ["Studio Name", "STUDIO", "st", "studio_name", "studio.name", "studio/name", ""];
    for (const slug of invalidSlugs) {
      const res = await checkSlugAvailability(slug);
      assert(s, res.available === false, `checkSlugAvailability rejects invalid format '${slug}'`);
    }

    // C: Test onboardStudio directly with reserved slug "super-admin"
    const directOnboardReserved = await onboardStudio({
      name: "Super Admin Studio",
      slug: "super-admin",
      discipline: "HYBRID",
      currency: "USD",
      ownerName: "Attacker",
      ownerEmail: `attacker_${Date.now()}@example.com`,
      password: "SuperSecretPassword123!",
      subscriptionTier: "PRO",
    });

    // Check if onboardStudio permitted reserved slug creation
    if (directOnboardReserved.success) {
      assert(s, false, "CRITICAL: onboardStudio permitted creating tenant with reserved slug 'super-admin'!");
      // Clean up if it was created
      await db.tenant.delete({ where: { slug: "super-admin" } }).catch(() => {});
    } else {
      assert(s, true, "onboardStudio properly rejected reserved slug 'super-admin'");
    }

    // D: Test onboardStudio with invalid hex brandColor (XSS / CSS injection attempt)
    const badColorResult = await onboardStudio({
      name: "XSS Studio",
      slug: `xss-test-${Date.now().toString(36)}`,
      discipline: "HYBRID",
      currency: "USD",
      brandColor: "javascript:alert(1)",
      ownerName: "Attacker",
      ownerEmail: `xss_${Date.now()}@example.com`,
      password: "SuperSecretPassword123!",
      subscriptionTier: "PRO",
    });
    assert(s, badColorResult.success === false, "onboardStudio rejects non-hex brandColor payload");

    // E: Test onboardStudio with short password (< 8 chars)
    const shortPwResult = await onboardStudio({
      name: "Short Pw Studio",
      slug: `shortpw-${Date.now().toString(36)}`,
      discipline: "HYBRID",
      currency: "USD",
      ownerName: "Short Pw",
      ownerEmail: `shortpw_${Date.now()}@example.com`,
      password: "123",
      subscriptionTier: "PRO",
    });
    assert(s, shortPwResult.success === false, "onboardStudio rejects password shorter than 8 chars");
  }

  // ============================================================================
  // Challenge 2: Cross-Tenant Data Leakage & Information Disclosure
  // ============================================================================
  {
    const s = createSuite("Challenge 2: Cross-Tenant Data Isolation & Probing");
    console.log(`\n--- [${s.suiteName}] ---`);

    // Create a private booked slot for Lumina
    const luminaPrivateSlot = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category: "COMMERCIAL",
        date: new Date(Date.now() + 86400000 * 10),
        startTime: "09:00 AM",
        endTime: "10:30 AM",
        status: "BOOKED",
        price: 1200.0,
        depositRequired: 600.0,
      },
    });

    // An attacker on Apex tries to probe / hold Lumina's slot using Apex's tenantId
    const crossProbeHold = await holdBookingSlot({
      tenantId: apex.id, // Mismatched tenantId!
      slotId: luminaPrivateSlot.id,
      sessionId: "apex_attacker_session",
    });

    // Does it tell Apex that the slot is "SLOT_ALREADY_BOOKED" (leaking Lumina's business status)?
    // Or does it return SLOT_NOT_FOUND?
    const leakedStatus = crossProbeHold.error === "SLOT_ALREADY_BOOKED";
    assert(
      s,
      !leakedStatus,
      "Cross-Tenant slot probe should NOT leak 'SLOT_ALREADY_BOOKED' across tenant boundaries",
      `Observed error code: ${crossProbeHold.error}`
    );

    // Try to create booking on Lumina slot with Apex tenantId
    const crossBooking = await createClientBooking({
      tenantId: apex.id,
      slotId: luminaPrivateSlot.id,
      sessionId: "apex_attacker_session",
      clientName: "Malicious User",
      clientEmail: `malicious_${Date.now()}@example.com`,
      clientPhone: "+60123456789",
    });
    assert(s, crossBooking.success === false, "createClientBooking blocks cross-tenant slot booking");

    // Try to release Lumina slot with Apex tenantId
    const crossRelease = await releaseBookingSlot({
      tenantId: apex.id,
      slotId: luminaPrivateSlot.id,
      sessionId: "apex_attacker_session",
    });
    assert(s, crossRelease.success === false, "releaseBookingSlot blocks cross-tenant release");

    // Clean up
    await db.bookingSlot.delete({ where: { id: luminaPrivateSlot.id } });
  }

  // ============================================================================
  // Challenge 3: High-Concurrency Slot Holding Race Conditions (20 Parallel Contenders)
  // ============================================================================
  {
    const s = createSuite("Challenge 3: High-Concurrency Slot Holding (20 Contenders)");
    console.log(`\n--- [${s.suiteName}] ---`);

    // Create a pristine available slot
    const contestSlot = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category: "COMMERCIAL",
        date: new Date(Date.now() + 86400000 * 20),
        startTime: "11:00 AM",
        endTime: "12:00 PM",
        status: "AVAILABLE",
        price: 800.0,
        depositRequired: 400.0,
      },
    });

    // Launch 20 simultaneous hold requests with distinct session IDs
    const contenders = Array.from({ length: 20 }, (_, i) => `session_contender_${i}`);
    const results = await Promise.all(
      contenders.map((sid) =>
        holdBookingSlot({
          tenantId: lumina.id,
          slotId: contestSlot.id,
          sessionId: sid,
        })
      )
    );

    const successfulHolds = results.filter((r) => r.success);
    const rejectedHolds = results.filter((r) => !r.success && r.error === "SLOT_ALREADY_HELD");

    assert(
      s,
      successfulHolds.length === 1,
      `Exactly 1 session acquired the contested slot (Acquired: ${successfulHolds.length})`
    );
    assert(
      s,
      rejectedHolds.length === 19,
      `Exactly 19 sessions received deterministic SLOT_ALREADY_HELD rejection (Rejected: ${rejectedHolds.length})`
    );

    // Verify slot in DB matches the successful session
    const finalSlot = await db.bookingSlot.findUnique({ where: { id: contestSlot.id } });
    assert(s, finalSlot?.status === "HELD", "Contested slot is in HELD state in DB");

    // Clean up
    await db.bookingSlot.delete({ where: { id: contestSlot.id } });
  }

  // ============================================================================
  // Challenge 4: High-Concurrency Expired Slot Reclaim (10 Parallel Contenders)
  // ============================================================================
  {
    const s = createSuite("Challenge 4: High-Concurrency Expired Slot Reclaim");
    console.log(`\n--- [${s.suiteName}] ---`);

    // Create an expired held slot
    const expiredSlot = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category: "COMMERCIAL",
        date: new Date(Date.now() + 86400000 * 25),
        startTime: "03:00 PM",
        endTime: "04:30 PM",
        status: "HELD",
        heldUntil: new Date(Date.now() - 10000), // Expired 10 seconds ago
        heldBySessionId: "prior_expired_session",
        price: 900.0,
        depositRequired: 450.0,
      },
    });

    // 10 contenders try to reclaim the expired slot simultaneously
    const reclaimers = Array.from({ length: 10 }, (_, i) => `session_reclaimer_${i}`);
    const reclaimResults = await Promise.all(
      reclaimers.map((sid) =>
        holdBookingSlot({
          tenantId: lumina.id,
          slotId: expiredSlot.id,
          sessionId: sid,
        })
      )
    );

    const successfulReclaims = reclaimResults.filter((r) => r.success);
    const rejectedReclaims = reclaimResults.filter((r) => !r.success && r.error === "SLOT_ALREADY_HELD");

    assert(
      s,
      successfulReclaims.length === 1,
      `Exactly 1 contender reclaimed the expired hold (Reclaimed: ${successfulReclaims.length})`
    );
    assert(
      s,
      rejectedReclaims.length === 9,
      `Exactly 9 contenders were rejected with SLOT_ALREADY_HELD (Rejected: ${rejectedReclaims.length})`
    );

    // Clean up
    await db.bookingSlot.delete({ where: { id: expiredSlot.id } });
  }

  // ============================================================================
  // Challenge 5: Switching Slots Rollback Discipline
  // ============================================================================
  {
    const s = createSuite("Challenge 5: Slot Switching Failure Behavior");
    console.log(`\n--- [${s.suiteName}] ---`);

    // Create Slot 1 (held by Session X) and Slot 2 (held by Session Y)
    const slot1 = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category: "COMMERCIAL",
        date: new Date(Date.now() + 86400000 * 30),
        startTime: "01:00 PM",
        endTime: "02:00 PM",
        status: "HELD",
        heldUntil: new Date(Date.now() + 600000), // Active hold
        heldBySessionId: "session_user_x",
      },
    });

    const slot2 = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category: "COMMERCIAL",
        date: new Date(Date.now() + 86400000 * 30),
        startTime: "02:00 PM",
        endTime: "03:00 PM",
        status: "HELD",
        heldUntil: new Date(Date.now() + 600000), // Active hold
        heldBySessionId: "session_user_y",
      },
    });

    // Session X attempts to switch to Slot 2 (which is occupied by Session Y)
    const switchAttempt = await holdBookingSlot({
      tenantId: lumina.id,
      slotId: slot2.id,
      sessionId: "session_user_x",
      previousSlotId: slot1.id,
    });

    assert(s, switchAttempt.success === false, "Switching to occupied slot 2 is rejected");

    // Check if Session X lost Slot 1
    const slot1After = await db.bookingSlot.findUnique({ where: { id: slot1.id } });
    const slot1Retained = slot1After?.status === "HELD" && slot1After?.heldBySessionId === "session_user_x";

    assert(
      s,
      slot1Retained,
      "User X should retain their existing hold on Slot 1 when target Slot 2 is unavailable",
      `Slot 1 status after failed switch: ${slot1After?.status}, heldBy: ${slot1After?.heldBySessionId}`
    );

    // Clean up
    await db.bookingSlot.delete({ where: { id: slot1.id } });
    await db.bookingSlot.delete({ where: { id: slot2.id } });
  }

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("\n===============================================================");
  console.log("   Adversarial Stress Test Summary");
  console.log("===============================================================");
  let totalPassed = 0;
  let totalFailed = 0;
  for (const st of suites) {
    totalPassed += st.assertionsPassed;
    totalFailed += st.failures.length;
    console.log(`${st.passed ? "✓ PASS" : "❌ FAIL"}: [${st.suiteName}] (${st.assertionsPassed} passed, ${st.failures.length} failed)`);
    if (st.failures.length > 0) {
      for (const f of st.failures) {
        console.log(`    ↳ ${f}`);
      }
    }
  }
  console.log(`\nTotal Assertions: ${totalPassed} Passed, ${totalFailed} Failed\n`);
}

runAdversarialM2Suite()
  .catch(console.error)
  .finally(() => db.$disconnect());
