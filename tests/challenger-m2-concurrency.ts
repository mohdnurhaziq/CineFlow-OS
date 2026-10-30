import { db } from "@/lib/db";
import {
  holdBookingSlot,
  releaseBookingSlot,
  getTenantBookingSlots,
  createClientBooking,
} from "@/lib/actions/booking";
import { performance } from "perf_hooks";

interface TestReport {
  name: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

const reports: TestReport[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    reports.push({ name, passed: true, durationMs: 0, details });
  } else {
    console.error(`  [FAIL] ${name}`);
    if (details) console.error(`    ↳ Error Details: ${details}`);
    reports.push({ name, passed: false, durationMs: 0, details });
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("   CINEFLOW OS: EMPIRICAL ADVERSARIAL STRESS TEST SUITE (MILESTONE 2)          ");
  console.log("   Target: Concurrency Race Conditions, Slot Locks, Expiries & Tenant Shield   ");
  console.log("================================================================================\n");

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  if (!luminaTenant || !apexTenant) {
    throw new Error("Missing seed tenants 'lumina-cine' or 'apex-media' in dev.db");
  }

  // ============================================================================
  // TEST SUITE 1: 10-Way Simultaneous Concurrency Stampede (Race Condition)
  // ============================================================================
  console.log(">>> TEST SUITE 1: 10-Way Simultaneous Concurrency Stampede");
  {
    // Create an isolated fresh AVAILABLE slot for the stampede
    const slot1 = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Adversarial Concurrency Stress Slot 1",
        date: new Date(Date.now() + 86400000 * 10),
        startTime: "09:00 AM",
        endTime: "10:30 AM",
        status: "AVAILABLE",
        price: 1200.0,
        depositRequired: 600.0,
      },
    });

    const CONCURRENT_CLIENTS = 10;
    const sessionIds = Array.from({ length: CONCURRENT_CLIENTS }, (_, i) => `client_racer_${i + 1}_${Date.now()}`);

    console.log(`  Firing ${CONCURRENT_CLIENTS} concurrent hold requests simultaneously at slot ${slot1.id}...`);
    const t0 = performance.now();

    // Fire all 10 requests at the exact same tick via Promise.all
    const holdPromises = sessionIds.map((sessionId) =>
      holdBookingSlot({
        tenantId: luminaTenant.id,
        slotId: slot1.id,
        sessionId,
      })
    );

    const results = await Promise.all(holdPromises);
    const elapsed = performance.now() - t0;
    console.log(`  All ${CONCURRENT_CLIENTS} requests resolved in ${elapsed.toFixed(2)}ms.`);

    const successes = results.filter((r) => r.success === true);
    const rejections = results.filter((r) => r.success === false);
    const alreadyHeldRejections = rejections.filter((r) => r.error === "SLOT_ALREADY_HELD");

    console.log(`  Results breakdown:`);
    console.log(`    - Successful holds: ${successes.length}`);
    console.log(`    - Rejected requests: ${rejections.length}`);
    console.log(`    - Rejections with SLOT_ALREADY_HELD: ${alreadyHeldRejections.length}`);

    assert(
      successes.length === 1,
      "Exactly 1 of 10 concurrent requests wins the slot hold lease",
      `Expected 1 winner, found ${successes.length} winners`
    );

    assert(
      rejections.length === 9,
      "Exactly 9 of 10 concurrent requests are rejected",
      `Expected 9 rejections, found ${rejections.length}`
    );

    assert(
      alreadyHeldRejections.length === 9,
      "All 9 rejected requests receive clean 'SLOT_ALREADY_HELD' error code",
      `Expected 9 'SLOT_ALREADY_HELD', found ${alreadyHeldRejections.length} (other errors: ${rejections
        .filter((r) => r.error !== "SLOT_ALREADY_HELD")
        .map((r) => r.error)
        .join(", ")})`
    );

    // Verify DB integrity
    const dbSlot1 = await db.bookingSlot.findUnique({ where: { id: slot1.id } });
    assert(
      dbSlot1 !== null && dbSlot1.status === "HELD",
      "Slot status in dev.db is 'HELD'",
      `Status is ${dbSlot1?.status}`
    );

    const winningSession = sessionIds.find((s) => s === dbSlot1?.heldBySessionId);
    assert(
      winningSession !== undefined,
      "Database heldBySessionId matches the singular winning session",
      `heldBySessionId is ${dbSlot1?.heldBySessionId}`
    );

    // Clean up slot 1
    await db.bookingSlot.delete({ where: { id: slot1.id } });
  }

  // ============================================================================
  // TEST SUITE 1B: Repeat Stampede with 20 Concurrent Requests (Stress Hardening)
  // ============================================================================
  console.log("\n>>> TEST SUITE 1B: 20-Way Concurrency Extreme Stress Hardening");
  {
    const slot1b = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Adversarial 20-Way Concurrency Stress Slot",
        date: new Date(Date.now() + 86400000 * 11),
        startTime: "11:00 AM",
        endTime: "12:30 PM",
        status: "AVAILABLE",
        price: 1500.0,
        depositRequired: 750.0,
      },
    });

    const STRESS_CLIENTS = 20;
    const sessionIds20 = Array.from({ length: STRESS_CLIENTS }, (_, i) => `client_stress_${i + 1}_${Date.now()}`);

    const t0 = performance.now();
    const results20 = await Promise.all(
      sessionIds20.map((sessionId) =>
        holdBookingSlot({
          tenantId: luminaTenant.id,
          slotId: slot1b.id,
          sessionId,
        })
      )
    );
    const elapsed = performance.now() - t0;
    console.log(`  20 concurrent requests resolved in ${elapsed.toFixed(2)}ms.`);

    const successes20 = results20.filter((r) => r.success === true);
    const rejections20 = results20.filter((r) => r.success === false);

    assert(
      successes20.length === 1,
      "20-way stampede yields exactly 1 winner",
      `Expected 1 winner, found ${successes20.length}`
    );
    assert(
      rejections20.length === 19,
      "20-way stampede cleanly rejects the other 19 racers",
      `Expected 19 rejections, found ${rejections20.length}`
    );

    await db.bookingSlot.delete({ where: { id: slot1b.id } });
  }

  // ============================================================================
  // TEST SUITE 2: Hold Timeout & Expiry Reclamation Verification
  // ============================================================================
  console.log("\n>>> TEST SUITE 2: Hold Timeout & Expiry Reclamation Verification");
  {
    const slot2 = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "WEDDINGS",
        campaignTitle: "Timeout & Expiry Verification Slot",
        date: new Date(Date.now() + 86400000 * 12),
        startTime: "02:00 PM",
        endTime: "04:00 PM",
        status: "AVAILABLE",
        price: 2500.0,
        depositRequired: 1250.0,
      },
    });

    const sessionA = `timeout_user_A_${Date.now()}`;
    const sessionB = `timeout_user_B_${Date.now()}`;

    const beforeHoldTime = Date.now();
    const holdResA = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slot2.id,
      sessionId: sessionA,
    });
    const afterHoldTime = Date.now();

    assert(holdResA.success === true, "Session A acquires hold");
    assert(holdResA.heldUntil !== undefined, "Hold response returns 'heldUntil' timestamp");

    const heldUntilMs = new Date(holdResA.heldUntil!).getTime();
    const durationMinFromBefore = (heldUntilMs - beforeHoldTime) / (60 * 1000);
    const durationMinFromAfter = (heldUntilMs - afterHoldTime) / (60 * 1000);

    console.log(
      `  Hold duration calculated: ${durationMinFromAfter.toFixed(3)} - ${durationMinFromBefore.toFixed(3)} minutes`
    );

    assert(
      durationMinFromBefore >= 9.99 && durationMinFromAfter <= 10.01,
      "Hold lease duration is strictly 10 minutes (600,000 ms)",
      `Calculated minutes: ${durationMinFromBefore.toFixed(3)} to ${durationMinFromAfter.toFixed(3)}`
    );

    // 2.1 Verify unexpired hold cannot be stolen by Session B
    const prematureSteal = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slot2.id,
      sessionId: sessionB,
    });
    assert(
      prematureSteal.success === false && prematureSteal.error === "SLOT_ALREADY_HELD",
      "Session B cannot claim slot while hold is still unexpired",
      `Result: ${JSON.stringify(prematureSteal)}`
    );

    // 2.2 Test Boundary: Expire the hold manually by setting heldUntil in the past
    console.log("  Simulating expired hold: setting heldUntil 2 seconds in past...");
    await db.bookingSlot.update({
      where: { id: slot2.id },
      data: {
        heldUntil: new Date(Date.now() - 2000), // expired 2 seconds ago
      },
    });

    // 2.3 Session B attempts to claim the expired slot
    const reclaimRes = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slot2.id,
      sessionId: sessionB,
    });

    assert(
      reclaimRes.success === true,
      "Session B immediately reclaims expired hold slot",
      `Result: ${JSON.stringify(reclaimRes)}`
    );

    const recheckSlot = await db.bookingSlot.findUnique({ where: { id: slot2.id } });
    assert(
      recheckSlot?.heldBySessionId === sessionB,
      "Slot DB heldBySessionId transferred to Session B upon expired reclamation",
      `heldBySessionId is ${recheckSlot?.heldBySessionId}`
    );

    const newHeldUntil = new Date(reclaimRes.heldUntil!).getTime();
    const newRemainingMin = (newHeldUntil - Date.now()) / (60 * 1000);
    assert(
      newRemainingMin >= 9.9 && newRemainingMin <= 10.05,
      "Reclaimed slot receives full fresh 10-minute lease",
      `New lease remaining: ${newRemainingMin.toFixed(2)} mins`
    );

    // 2.4 Auto-cleanup test in getTenantBookingSlots
    // Set slot to expired again
    await db.bookingSlot.update({
      where: { id: slot2.id },
      data: {
        heldUntil: new Date(Date.now() - 5000), // expired 5 seconds ago
      },
    });

    // Calling getTenantBookingSlots should perform lazy auto-cleanup
    const slotsFetch = await getTenantBookingSlots({
      tenantSlug: luminaTenant.slug,
      category: "WEDDINGS",
    });

    const slot2InList = slotsFetch.slots.find((s) => s.id === slot2.id);
    assert(
      slot2InList?.status === "AVAILABLE",
      "getTenantBookingSlots auto-cleans expired HELD slots back to 'AVAILABLE'",
      `Slot status in list: ${slot2InList?.status}`
    );

    await db.bookingSlot.delete({ where: { id: slot2.id } });
  }

  // ============================================================================
  // TEST SUITE 3: Session Hold Switching (Single-Slot Discipline)
  // ============================================================================
  console.log("\n>>> TEST SUITE 3: Session Hold Switching & Single-Slot Lease Discipline");
  {
    const slotA = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Switching Test Slot Alpha",
        date: new Date(Date.now() + 86400000 * 13),
        startTime: "10:00 AM",
        endTime: "11:00 AM",
        status: "AVAILABLE",
        price: 800.0,
        depositRequired: 400.0,
      },
    });

    const slotB = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Switching Test Slot Beta",
        date: new Date(Date.now() + 86400000 * 13),
        startTime: "01:00 PM",
        endTime: "02:00 PM",
        status: "AVAILABLE",
        price: 900.0,
        depositRequired: 450.0,
      },
    });

    const sessionX = `session_switcher_${Date.now()}`;
    const sessionY = `malicious_adversary_${Date.now()}`;

    // 1. Session X holds Slot A
    const holdA = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotA.id,
      sessionId: sessionX,
    });
    assert(holdA.success === true, "Session X acquires Slot Alpha");

    // 2. Adversary Session Y attempts to maliciously release Slot A via previousSlotId switch
    console.log("  Adversarial attack: Session Y attempts to steal/free Slot A by claiming it as previousSlotId...");
    const maliciousSwitch = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotB.id,
      sessionId: sessionY,
      previousSlotId: slotA.id, // Slot A is owned by Session X, NOT Session Y!
    });
    assert(maliciousSwitch.success === true, "Session Y acquires Slot Beta");

    // Verify Slot A was NOT freed by Session Y's unauthorized previousSlotId!
    const slotACheckAdversarial = await db.bookingSlot.findUnique({ where: { id: slotA.id } });
    assert(
      slotACheckAdversarial?.status === "HELD" && slotACheckAdversarial?.heldBySessionId === sessionX,
      "Unauthorized session cannot release another user's slot via previousSlotId",
      `Slot Alpha status: ${slotACheckAdversarial?.status}, heldBy: ${slotACheckAdversarial?.heldBySessionId}`
    );

    // Clean up Slot Beta
    await db.bookingSlot.delete({ where: { id: slotB.id } });

    // Create a new Slot C for legitimate switch
    const slotC = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Switching Test Slot Charlie",
        date: new Date(Date.now() + 86400000 * 13),
        startTime: "03:00 PM",
        endTime: "04:00 PM",
        status: "AVAILABLE",
        price: 1000.0,
        depositRequired: 500.0,
      },
    });

    // 3. Legitimate Session X switches from Slot A to Slot C
    const legitSwitch = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotC.id,
      sessionId: sessionX,
      previousSlotId: slotA.id,
    });
    assert(legitSwitch.success === true, "Session X successfully switches to Slot Charlie");

    // Verify Slot A is returned to AVAILABLE
    const slotACheckLegit = await db.bookingSlot.findUnique({ where: { id: slotA.id } });
    assert(
      slotACheckLegit?.status === "AVAILABLE" &&
        slotACheckLegit?.heldBySessionId === null &&
        slotACheckLegit?.heldUntil === null,
      "Legitimate switch atomically restores prior Slot Alpha to AVAILABLE with null hold fields",
      `Slot Alpha status: ${slotACheckLegit?.status}, heldBy: ${slotACheckLegit?.heldBySessionId}`
    );

    // Verify Slot C is now HELD by Session X
    const slotCCheck = await db.bookingSlot.findUnique({ where: { id: slotC.id } });
    assert(
      slotCCheck?.status === "HELD" && slotCCheck?.heldBySessionId === sessionX,
      "Slot Charlie is active HELD by Session X"
    );

    await db.bookingSlot.delete({ where: { id: slotA.id } });
    await db.bookingSlot.delete({ where: { id: slotC.id } });
  }

  // ============================================================================
  // TEST SUITE 4: Voluntary Release Mechanism (`releaseBookingSlot`)
  // ============================================================================
  console.log("\n>>> TEST SUITE 4: Voluntary Release Mechanism & Defense against Rogue Releases");
  {
    const slotReleaseTest = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Voluntary Release Test Slot",
        date: new Date(Date.now() + 86400000 * 14),
        startTime: "10:00 AM",
        endTime: "11:00 AM",
        status: "AVAILABLE",
        price: 700.0,
        depositRequired: 350.0,
      },
    });

    const ownerSession = `owner_session_${Date.now()}`;
    const impostorSession = `impostor_session_${Date.now()}`;

    // Hold the slot
    await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotReleaseTest.id,
      sessionId: ownerSession,
    });

    // 4.1 Impostor attempts to voluntarily release owner's slot
    console.log("  Adversarial attack: Impostor attempts to voluntarily release slot held by owner...");
    const rogueRelease = await releaseBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotReleaseTest.id,
      sessionId: impostorSession,
    });

    assert(
      rogueRelease.success === false,
      "Impostor session cannot release another session's held slot",
      `Result: ${JSON.stringify(rogueRelease)}`
    );

    const slotStillHeld = await db.bookingSlot.findUnique({ where: { id: slotReleaseTest.id } });
    assert(
      slotStillHeld?.status === "HELD" && slotStillHeld?.heldBySessionId === ownerSession,
      "Slot remains HELD by legitimate owner after rogue release attempt"
    );

    // 4.2 Legitimate owner voluntarily releases the slot
    const legitRelease = await releaseBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotReleaseTest.id,
      sessionId: ownerSession,
    });

    assert(
      legitRelease.success === true,
      "Legitimate owner successfully releases held slot via releaseBookingSlot"
    );

    const slotRestored = await db.bookingSlot.findUnique({ where: { id: slotReleaseTest.id } });
    assert(
      slotRestored?.status === "AVAILABLE" &&
        slotRestored?.heldBySessionId === null &&
        slotRestored?.heldUntil === null,
      "Voluntarily released slot is immediately restored to AVAILABLE with clean hold state"
    );

    // 4.3 Idempotency / No-op on already AVAILABLE slot
    const redundantRelease = await releaseBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotReleaseTest.id,
      sessionId: ownerSession,
    });
    assert(
      redundantRelease.success === false,
      "Releasing an already AVAILABLE slot cleanly returns success: false without throwing"
    );

    // 4.4 Defense: Attempting to release a BOOKED slot
    // Set slot to BOOKED
    await db.bookingSlot.update({
      where: { id: slotReleaseTest.id },
      data: { status: "BOOKED" },
    });

    const releaseBooked = await releaseBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotReleaseTest.id,
      sessionId: ownerSession,
    });

    const slotBookedCheck = await db.bookingSlot.findUnique({ where: { id: slotReleaseTest.id } });
    assert(
      releaseBooked.success === false && slotBookedCheck?.status === "BOOKED",
      "releaseBookingSlot CANNOT revert a BOOKED slot to AVAILABLE",
      `releaseBooked: ${JSON.stringify(releaseBooked)}, slot status: ${slotBookedCheck?.status}`
    );

    await db.bookingSlot.delete({ where: { id: slotReleaseTest.id } });
  }

  // ============================================================================
  // TEST SUITE 5: Strict Multi-Tenant Isolation
  // ============================================================================
  console.log("\n>>> TEST SUITE 5: Strict Multi-Tenant Isolation Verification");
  {
    // Slot in Studio 1 (Lumina)
    const slotLumina = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Lumina Isolated Slot",
        date: new Date(Date.now() + 86400000 * 15),
        startTime: "10:00 AM",
        endTime: "11:00 AM",
        status: "AVAILABLE",
        price: 1100.0,
        depositRequired: 550.0,
      },
    });

    // Slot in Studio 2 (Apex)
    const slotApex = await db.bookingSlot.create({
      data: {
        tenantId: apexTenant.id,
        category: "CONVOCATION",
        campaignTitle: "Apex Isolated Slot",
        date: new Date(Date.now() + 86400000 * 15),
        startTime: "10:00 AM",
        endTime: "11:00 AM",
        status: "AVAILABLE",
        price: 450.0,
        depositRequired: 225.0,
      },
    });

    const crossSession = `cross_tenant_tester_${Date.now()}`;

    // 5.1 Cross-Tenant Hold Attempt: Attempt to hold Apex's slot using Lumina's tenantId
    console.log("  Testing cross-tenant hold: Passing Lumina tenantId with Apex slotId...");
    const crossTenantHold = await holdBookingSlot({
      tenantId: luminaTenant.id, // WRONG TENANT
      slotId: slotApex.id,       // APEX SLOT
      sessionId: crossSession,
    });

    assert(
      crossTenantHold.success === false,
      "Cross-tenant hold attempt is rejected (cannot lock another tenant's slot)",
      `Result: ${JSON.stringify(crossTenantHold)}`
    );

    const apexSlotCheck = await db.bookingSlot.findUnique({ where: { id: slotApex.id } });
    assert(
      apexSlotCheck?.status === "AVAILABLE" && apexSlotCheck?.heldBySessionId === null,
      "Apex slot remains AVAILABLE and uncompromised after cross-tenant hold attack",
      `Apex slot status: ${apexSlotCheck?.status}`
    );

    // 5.2 Cross-Tenant Release Attempt: Attempt to release Lumina's slot using Apex's tenantId
    // First, legitimate hold on Lumina slot
    await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotLumina.id,
      sessionId: crossSession,
    });

    console.log("  Testing cross-tenant release: Passing Apex tenantId with Lumina slotId...");
    const crossTenantRelease = await releaseBookingSlot({
      tenantId: apexTenant.id, // WRONG TENANT
      slotId: slotLumina.id,   // LUMINA SLOT
      sessionId: crossSession,
    });

    assert(
      crossTenantRelease.success === false,
      "Cross-tenant release attempt is rejected",
      `Result: ${JSON.stringify(crossTenantRelease)}`
    );

    const luminaSlotCheck = await db.bookingSlot.findUnique({ where: { id: slotLumina.id } });
    assert(
      luminaSlotCheck?.status === "HELD" && luminaSlotCheck?.heldBySessionId === crossSession,
      "Lumina slot remains HELD; Apex tenant cannot release Lumina slots",
      `Lumina slot status: ${luminaSlotCheck?.status}`
    );

    // 5.3 Query Isolation: getTenantBookingSlots for Lumina never returns Apex slots
    const luminaSlotsQuery = await getTenantBookingSlots({ tenantSlug: luminaTenant.slug });
    const leakedApexSlot = luminaSlotsQuery.slots.find((s) => s.id === slotApex.id);
    assert(
      leakedApexSlot === undefined,
      "getTenantBookingSlots strictly scopes by tenantId (no data leaks across tenants)",
      `Found leaked slot: ${Boolean(leakedApexSlot)}`
    );

    // 5.4 Cross-Tenant Booking Attempt: Attempt to finalize booking on Apex slot with Lumina tenantId
    const crossTenantBooking = await createClientBooking({
      tenantId: luminaTenant.id, // WRONG TENANT
      slotId: slotApex.id,       // APEX SLOT
      sessionId: crossSession,
      clientName: "Cross Tenant Attack",
      clientEmail: "hacker@adversary.com",
      clientPhone: "+60123456789",
      discipline: "PHOTOGRAPHY",
      category: "CONVOCATION",
      serviceTier: "STANDARD",
      paymentMethod: "CARD",
    });

    assert(
      crossTenantBooking.success === false && crossTenantBooking.error === "Slot not found",
      "createClientBooking strictly rejects booking when slotId does not belong to tenantId",
      `Result: ${JSON.stringify(crossTenantBooking)}`
    );

    await db.bookingSlot.delete({ where: { id: slotLumina.id } });
    await db.bookingSlot.delete({ where: { id: slotApex.id } });
  }

  // ============================================================================
  // TEST SUITE 6: End-to-End Double-Booking Prevention (`createClientBooking`)
  // ============================================================================
  console.log("\n>>> TEST SUITE 6: End-to-End Double-Booking & Confirmation Lock");
  {
    const slot6 = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Full Checkout Double-Booking Prevention Slot",
        date: new Date(Date.now() + 86400000 * 16),
        startTime: "10:00 AM",
        endTime: "11:00 AM",
        status: "AVAILABLE",
        price: 900.0,
        depositRequired: 450.0,
      },
    });

    const legitimateSession = `legit_buyer_${Date.now()}`;
    const interloperSession = `interloper_${Date.now()}`;

    // Step 1: Legitimate session holds the slot
    const holdRes = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slot6.id,
      sessionId: legitimateSession,
    });
    assert(holdRes.success === true, "Legitimate buyer holds slot");

    // Step 2: Interloper attempts to book slot directly without hold
    const interloperBooking = await createClientBooking({
      tenantId: luminaTenant.id,
      slotId: slot6.id,
      sessionId: interloperSession,
      clientName: "Interloper Client",
      clientEmail: "interloper@test.com",
      clientPhone: "+15555555555",
      discipline: "PHOTOGRAPHY",
      category: "COMMERCIAL",
      serviceTier: "STANDARD",
      paymentMethod: "CARD",
    });

    assert(
      interloperBooking.success === false &&
        interloperBooking.error === "Slot is no longer available",
      "Interloper cannot book a slot currently held by another session",
      `Result: ${JSON.stringify(interloperBooking)}`
    );

    // Step 3: Legitimate buyer confirms booking via Card
    const legitBooking = await createClientBooking({
      tenantId: luminaTenant.id,
      slotId: slot6.id,
      sessionId: legitimateSession,
      clientName: "Evelyn Reed",
      clientEmail: `evelyn_${Date.now()}@luminacine.com`,
      clientPhone: "+15551234567",
      discipline: "PHOTOGRAPHY",
      category: "COMMERCIAL",
      serviceTier: "STANDARD",
      paymentMethod: "CARD",
    });

    assert(
      legitBooking.success === true,
      "Legitimate buyer confirms booking and settles card deposit",
      `Booking ID: ${legitBooking.bookingId}, trackingCode: ${legitBooking.trackingCode}`
    );

    // Step 4: Verify slot is now BOOKED in database
    const slot6AfterBooking = await db.bookingSlot.findUnique({ where: { id: slot6.id } });
    assert(
      slot6AfterBooking?.status === "BOOKED",
      "Slot status transitioned to BOOKED",
      `Status: ${slot6AfterBooking?.status}`
    );

    // Step 5: Verify any subsequent hold attempt on BOOKED slot is rejected
    const postBookingHold = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slot6.id,
      sessionId: `new_user_${Date.now()}`,
    });

    assert(
      postBookingHold.success === false && postBookingHold.error === "SLOT_ALREADY_BOOKED",
      "Subsequent hold attempts on BOOKED slot return 'SLOT_ALREADY_BOOKED'",
      `Result: ${JSON.stringify(postBookingHold)}`
    );

    // Clean up
    if (legitBooking.bookingId) {
      await db.clientBooking.delete({ where: { id: legitBooking.bookingId } });
    }
    await db.bookingSlot.delete({ where: { id: slot6.id } });
  }

  // ============================================================================
  // FINAL SUMMARY
  // ============================================================================
  console.log("\n================================================================================");
  const total = reports.length;
  const passed = reports.filter((r) => r.passed).length;
  const failed = reports.filter((r) => !r.passed).length;

  console.log(`   ADVERSARIAL STRESS TEST SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error(`\n❌ VERDICT: REQUEST_CHANGES — ${failed} assertions failed.`);
    process.exit(1);
  } else {
    console.log(`\n✅ VERDICT: APPROVE — All concurrency, hold leases, timeouts, and tenant isolation assertions passed.`);
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("FATAL UNCAUGHT RUNTIME ERROR in stress suite:", err);
  process.exit(1);
});
