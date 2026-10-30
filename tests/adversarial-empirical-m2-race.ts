import { db } from "@/lib/db";
import {
  holdBookingSlot,
  releaseBookingSlot,
  createClientBooking,
} from "@/lib/actions/booking";
import { checkSlugAvailability, onboardStudio } from "@/lib/actions/onboarding";
import { performance } from "perf_hooks";

interface StressResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: StressResult[] = [];

function check(cond: boolean, name: string, details: string = "") {
  if (cond) {
    console.log(`  [PASS] ${name}`);
    results.push({ name, passed: true, details });
  } else {
    console.error(`  [FAIL] ${name} -> Details: ${details}`);
    results.push({ name, passed: false, details });
  }
}

async function runEmpiricalStressHarness() {
  console.log("================================================================================");
  console.log("   CINEFLOW OS: ADVERSARIAL EMPIRICAL CHALLENGER STRESS HARNESS (M2 IT2)       ");
  console.log("   50-Way Stampedes, Simultaneous Booking Races, Cross-Tenant Matrix & Swaps   ");
  console.log("================================================================================\n");

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  if (!luminaTenant || !apexTenant) {
    throw new Error("Missing seed tenants in database");
  }

  // ---------------------------------------------------------------------------
  // 1. 50-WAY SIMULTANEOUS HOLD STAMPEDE
  // ---------------------------------------------------------------------------
  console.log(">>> STRESS 1: 50-Way Simultaneous Hold Stampede on Single Slot");
  {
    const slot50 = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Empirical 50-Way Hold Stampede",
        date: new Date(Date.now() + 86400000 * 40),
        startTime: "10:00 AM",
        endTime: "11:30 AM",
        status: "AVAILABLE",
        price: 1500.0,
        depositRequired: 750.0,
      },
    });

    const N = 50;
    const sessionIds = Array.from({ length: N }, (_, i) => `racer_50_${i}_${Date.now()}`);

    const t0 = performance.now();
    const responses = await Promise.all(
      sessionIds.map((sessionId) =>
        holdBookingSlot({
          tenantId: luminaTenant.id,
          slotId: slot50.id,
          sessionId,
        })
      )
    );
    const duration = performance.now() - t0;
    console.log(`  50 concurrent hold requests completed in ${duration.toFixed(2)}ms`);

    const winners = responses.filter((r) => r.success === true);
    const losers = responses.filter((r) => r.success === false);
    const loserErrors = losers.map((r) => r.error);
    const allSlotAlreadyHeld = loserErrors.every((e) => e === "SLOT_ALREADY_HELD");

    check(winners.length === 1, "Exactly 1 winner among 50 concurrent requests", `Found ${winners.length} winners`);
    check(losers.length === 49, "Exactly 49 losers among 50 concurrent requests", `Found ${losers.length} losers`);
    check(allSlotAlreadyHeld, "All 49 losers received SLOT_ALREADY_HELD error code", `Unique errors: ${Array.from(new Set(loserErrors)).join(", ")}`);

    const slotInDb = await db.bookingSlot.findUnique({ where: { id: slot50.id } });
    check(slotInDb?.status === "HELD", "DB status is HELD", `DB status: ${slotInDb?.status}`);
    check(
      slotInDb?.heldBySessionId !== null && sessionIds.includes(slotInDb!.heldBySessionId!),
      "DB heldBySessionId belongs to one of the 50 racers",
      `heldBySessionId: ${slotInDb?.heldBySessionId}`
    );

    await db.bookingSlot.delete({ where: { id: slot50.id } });
  }

  // ---------------------------------------------------------------------------
  // 2. SIMULTANEOUS 20-WAY DIRECT BOOKING STAMPEDE (0 DOUBLE-BOOKINGS GUARANTEE)
  // ---------------------------------------------------------------------------
  console.log("\n>>> STRESS 2: 20-Way Simultaneous Direct Booking Stampede (Zero Double Bookings)");
  {
    const bookSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Direct Booking Stampede Test Slot",
        date: new Date(Date.now() + 86400000 * 41),
        startTime: "02:00 PM",
        endTime: "03:30 PM",
        status: "AVAILABLE",
        price: 2000.0,
        depositRequired: 1000.0,
      },
    });

    const N_BOOK = 20;
    const clientSessions = Array.from({ length: N_BOOK }, (_, i) => ({
      sessionId: `direct_booker_${i}_${Date.now()}`,
      clientEmail: `direct_booker_${i}_${Date.now()}@example.com`,
      clientName: `Contender ${i}`,
    }));

    const t0 = performance.now();
    const bookingResponses = await Promise.all(
      clientSessions.map((client) =>
        createClientBooking({
          tenantId: luminaTenant.id,
          slotId: bookSlot.id,
          sessionId: client.sessionId,
          clientName: client.clientName,
          clientEmail: client.clientEmail,
          clientPhone: "+15555555555",
          discipline: "PHOTOGRAPHY",
          category: "COMMERCIAL",
          serviceTier: "STANDARD",
          paymentMethod: "CARD",
        })
      )
    );
    const duration = performance.now() - t0;
    console.log(`  20 simultaneous createClientBooking requests completed in ${duration.toFixed(2)}ms`);

    const successfulBookings = bookingResponses.filter((r) => r.success === true);
    const rejectedBookings = bookingResponses.filter((r) => r.success === false);

    console.log(`  Bookings breakdown: ${successfulBookings.length} succeeded, ${rejectedBookings.length} rejected`);

    // Verify DB records: Exactly 1 ClientBooking must exist for this slotId!
    const dbBookings = await db.clientBooking.findMany({
      where: { slotId: bookSlot.id },
    });

    check(
      dbBookings.length <= 1,
      "CRITICAL CONCURRENCY INVARIANT: At most 1 ClientBooking record exists for slot (0 double bookings)",
      `Found ${dbBookings.length} booking records in DB`
    );

    check(
      successfulBookings.length <= 1,
      "At most 1 client receives success: true for booking confirmation",
      `Successful responses: ${successfulBookings.length}`
    );

    const slotAfterBook = await db.bookingSlot.findUnique({ where: { id: bookSlot.id } });
    check(
      slotAfterBook?.status === "BOOKED",
      "Slot status is securely locked to BOOKED",
      `Status: ${slotAfterBook?.status}`
    );

    // Clean up created bookings and slot
    for (const b of dbBookings) {
      await db.clientBooking.delete({ where: { id: b.id } });
    }
    await db.bookingSlot.delete({ where: { id: bookSlot.id } });
  }

  // ---------------------------------------------------------------------------
  // 3. ADVANCED SLOT SWITCHING CONFLICT & HOLD RETENTION MATRIX
  // ---------------------------------------------------------------------------
  console.log("\n>>> STRESS 3: Advanced Slot Switching Conflict & Hold Retention Matrix");
  {
    // Slot Alpha (held by Alice)
    const slotAlpha = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Alpha Slot",
        date: new Date(Date.now() + 86400000 * 42),
        startTime: "09:00 AM",
        endTime: "10:00 AM",
        status: "HELD",
        heldUntil: new Date(Date.now() + 600000),
        heldBySessionId: "session_alice",
      },
    });

    // Slot Beta (held by Bob)
    const slotBeta = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Beta Slot",
        date: new Date(Date.now() + 86400000 * 42),
        startTime: "10:00 AM",
        endTime: "11:00 AM",
        status: "HELD",
        heldUntil: new Date(Date.now() + 600000),
        heldBySessionId: "session_bob",
      },
    });

    // Slot Gamma (AVAILABLE)
    const slotGamma = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        campaignTitle: "Gamma Slot",
        date: new Date(Date.now() + 86400000 * 42),
        startTime: "11:00 AM",
        endTime: "12:00 PM",
        status: "AVAILABLE",
      },
    });

    // Test 3.1: Alice attempts to switch to occupied Slot Beta -> FAILS & Alice retains Slot Alpha
    const aliceFailedSwitch = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotBeta.id,
      sessionId: "session_alice",
      previousSlotId: slotAlpha.id,
    });

    check(aliceFailedSwitch.success === false, "Alice switch to occupied Beta fails", `Response: ${JSON.stringify(aliceFailedSwitch)}`);
    check(aliceFailedSwitch.error === "SLOT_ALREADY_HELD", "Alice receives SLOT_ALREADY_HELD error");

    const alphaPostCheck = await db.bookingSlot.findUnique({ where: { id: slotAlpha.id } });
    check(
      alphaPostCheck?.status === "HELD" && alphaPostCheck?.heldBySessionId === "session_alice",
      "Alice retains hold on Slot Alpha after failed switch attempt",
      `Alpha status: ${alphaPostCheck?.status}, heldBy: ${alphaPostCheck?.heldBySessionId}`
    );

    // Test 3.2: Alice and Bob simultaneously race to switch to AVAILABLE Slot Gamma
    console.log("  Simultaneous switch race: Alice and Bob race to claim Slot Gamma while holding Alpha and Beta...");
    const [aliceGamma, bobGamma] = await Promise.all([
      holdBookingSlot({
        tenantId: luminaTenant.id,
        slotId: slotGamma.id,
        sessionId: "session_alice",
        previousSlotId: slotAlpha.id,
      }),
      holdBookingSlot({
        tenantId: luminaTenant.id,
        slotId: slotGamma.id,
        sessionId: "session_bob",
        previousSlotId: slotBeta.id,
      }),
    ]);

    const winnerIsAlice = aliceGamma.success && !bobGamma.success;
    const winnerIsBob = bobGamma.success && !aliceGamma.success;

    check(
      winnerIsAlice || winnerIsBob,
      "Exactly one switcher acquires Slot Gamma while the other is rejected",
      `Alice: ${aliceGamma.success}, Bob: ${bobGamma.success}`
    );

    const gammaInDb = await db.bookingSlot.findUnique({ where: { id: slotGamma.id } });
    const alphaInDb = await db.bookingSlot.findUnique({ where: { id: slotAlpha.id } });
    const betaInDb = await db.bookingSlot.findUnique({ where: { id: slotBeta.id } });

    if (winnerIsAlice) {
      check(gammaInDb?.heldBySessionId === "session_alice", "Gamma is held by Alice");
      check(alphaInDb?.status === "AVAILABLE" && alphaInDb?.heldBySessionId === null, "Winner Alice's previous slot Alpha is freed to AVAILABLE");
      check(betaInDb?.status === "HELD" && betaInDb?.heldBySessionId === "session_bob", "Loser Bob's prior slot Beta is PRESERVED as HELD");
    } else {
      check(gammaInDb?.heldBySessionId === "session_bob", "Gamma is held by Bob");
      check(betaInDb?.status === "AVAILABLE" && betaInDb?.heldBySessionId === null, "Winner Bob's previous slot Beta is freed to AVAILABLE");
      check(alphaInDb?.status === "HELD" && alphaInDb?.heldBySessionId === "session_alice", "Loser Alice's prior slot Alpha is PRESERVED as HELD");
    }

    // Clean up
    await db.bookingSlot.delete({ where: { id: slotAlpha.id } });
    await db.bookingSlot.delete({ where: { id: slotBeta.id } });
    await db.bookingSlot.delete({ where: { id: slotGamma.id } });
  }

  // ---------------------------------------------------------------------------
  // 4. CROSS-TENANT INFORMATION LEAKAGE MATRIX
  // ---------------------------------------------------------------------------
  console.log("\n>>> STRESS 4: Cross-Tenant Information Leakage Matrix");
  {
    // Lumina slots with different statuses
    const statuses = ["AVAILABLE", "HELD", "BOOKED", "BLOCKED"] as const;
    const createdLuminaSlots: Record<string, string> = {};

    for (const st of statuses) {
      const s = await db.bookingSlot.create({
        data: {
          tenantId: luminaTenant.id,
          category: "COMMERCIAL",
          campaignTitle: `Cross-Tenant Test ${st}`,
          date: new Date(Date.now() + 86400000 * 43),
          startTime: "01:00 PM",
          endTime: "02:00 PM",
          status: st,
          heldUntil: st === "HELD" ? new Date(Date.now() + 600000) : null,
          heldBySessionId: st === "HELD" ? "lumina_internal_user" : null,
        },
      });
      createdLuminaSlots[st] = s.id;
    }

    // Apex attacker tries to hold each of these slots using Apex's tenantId
    for (const st of statuses) {
      const slotId = createdLuminaSlots[st]!;
      const res = await holdBookingSlot({
        tenantId: apexTenant.id, // Mismatched tenant
        slotId,
        sessionId: "apex_attacker",
      });

      check(
        res.success === false,
        `Apex hold probe on Lumina ${st} slot is rejected`,
        `Response: ${JSON.stringify(res)}`
      );

      check(
        res.error === "SLOT_NOT_FOUND",
        `Apex hold probe on Lumina ${st} slot returns SLOT_NOT_FOUND (no status leak)`,
        `Received error: ${res.error}`
      );
    }

    // Clean up Lumina slots
    for (const st of statuses) {
      await db.bookingSlot.delete({ where: { id: createdLuminaSlots[st] } });
    }
  }

  // ---------------------------------------------------------------------------
  // 5. RESERVED SLUG EXHAUSTIVE CASE & SYMBOL ADVERSARIAL MATRIX
  // ---------------------------------------------------------------------------
  console.log("\n>>> STRESS 5: Reserved Slug Exhaustive Case & Boundary Testing");
  {
    const attackSlugs = [
      "SUPER-ADMIN",
      "Super-Admin",
      "sUpEr-AdMiN",
      "CREATE-STUDIO",
      "Api",
      "ADMIN",
      "public",
      "Uploads",
      "_NEXT",
      "favicon.ico",
      "settings",
      "Dashboard",
      "-super-admin",
      "super-admin-",
      "---",
      "super--admin",
      "super admin",
      "super/admin",
      "super.admin",
    ];

    for (const slug of attackSlugs) {
      const avail = await checkSlugAvailability(slug);
      check(
        avail.available === false,
        `checkSlugAvailability cleanly rejects adversarial slug '${slug}'`,
        `Available: ${avail.available}`
      );

      const onboardRes = await onboardStudio({
        name: `Adversarial ${slug}`,
        slug,
        ownerName: "Hacker",
        ownerEmail: `hacker_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
        password: "ValidPassword123!",
      });

      check(
        onboardRes.success === false,
        `onboardStudio strictly blocks tenant creation with adversarial slug '${slug}'`,
        `Result: ${JSON.stringify(onboardRes)}`
      );

      // Verify no tenant record in DB
      const tenantCheck = await db.tenant.findUnique({ where: { slug: slug.toLowerCase() } });
      check(
        tenantCheck === null,
        `DB has no tenant record created for '${slug}'`,
        `Tenant: ${tenantCheck?.id}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`   EMPIRICAL CHALLENGER STRESS HARNESS: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error(`\n❌ VERDICT: REQUEST_CHANGES — ${failed} failures detected.`);
    process.exit(1);
  } else {
    console.log(`\n✅ VERDICT: APPROVE — Concurrency, slot switching, isolation, and slug security fully verified.`);
    process.exit(0);
  }
}

runEmpiricalStressHarness()
  .catch((err) => {
    console.error("FATAL ERROR in stress harness:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
