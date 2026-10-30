/**
 * CineFlow OS — Zero-Dependency E2E Test Assertion Harness
 * Provides structured test execution, timing, colorized ANSI output,
 * deterministic exit code tracking, and fixture isolation utilities.
 */

import assert from "node:assert/strict";

export interface TestResult {
  tier: string;
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface SuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  exitCode: number;
  results: TestResult[];
}

export class TestHarness {
  private results: TestResult[] = [];
  private currentTier = "SYSTEM";
  private currentSuite = "General";
  private suiteStartTime = Date.now();
  private teardownCallbacks: (() => Promise<void> | void)[] = [];

  constructor(tier?: string, suite?: string) {
    if (tier) this.currentTier = tier;
    if (suite) this.currentSuite = suite;
    this.suiteStartTime = Date.now();
  }

  setSuite(tier: string, suite: string) {
    this.currentTier = tier;
    this.currentSuite = suite;
    console.log(`\n\x1b[1m\x1b[36m>>> [${tier}] ${suite}\x1b[0m`);
  }

  registerTeardown(fn: () => Promise<void> | void) {
    this.teardownCallbacks.push(fn);
  }

  async runTeardown() {
    while (this.teardownCallbacks.length > 0) {
      const fn = this.teardownCallbacks.pop();
      if (fn) {
        try {
          await fn();
        } catch (err: any) {
          console.warn(`\x1b[33m[Teardown Warning]\x1b[0m Failed cleanup hook:`, err?.message || err);
        }
      }
    }
  }

  assert(condition: boolean, name: string, detail?: string) {
    const passed = Boolean(condition);
    if (passed) {
      console.log(`  \x1b[32m✓ PASS:\x1b[0m ${name}`);
      this.results.push({
        tier: this.currentTier,
        suite: this.currentSuite,
        name,
        passed: true,
        durationMs: 0,
      });
    } else {
      console.error(`  \x1b[31m✗ FAIL:\x1b[0m ${name}${detail ? ` (${detail})` : ""}`);
      this.results.push({
        tier: this.currentTier,
        suite: this.currentSuite,
        name,
        passed: false,
        durationMs: 0,
        error: detail || "Assertion failed",
      });
    }
  }

  assertEqual<T>(actual: T, expected: T, name: string, detail?: string) {
    try {
      assert.equal(actual, expected, detail);
      this.assert(true, name);
    } catch (err: any) {
      this.assert(false, name, `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}: ${err.message}`);
    }
  }

  assertNotEqual<T>(actual: T, expected: T, name: string, detail?: string) {
    try {
      assert.notEqual(actual, expected, detail);
      this.assert(true, name);
    } catch (err: any) {
      this.assert(false, name, `Expected not to equal ${JSON.stringify(expected)}: ${err.message}`);
    }
  }

  assertDeepEqual<T>(actual: T, expected: T, name: string, detail?: string) {
    try {
      assert.deepEqual(actual, expected, detail);
      this.assert(true, name);
    } catch (err: any) {
      this.assert(false, name, `Deep equality mismatch: ${err.message}`);
    }
  }

  async assertRejects(fn: () => Promise<any>, expectedErrorSubstring: string, name: string) {
    try {
      await fn();
      this.assert(false, name, `Expected function to reject with substring "${expectedErrorSubstring}", but it resolved`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes(expectedErrorSubstring)) {
        this.assert(true, name);
      } else {
        this.assert(false, name, `Expected error containing "${expectedErrorSubstring}", got "${msg}"`);
      }
    }
  }

  assertRange(val: number, min: number, max: number, name: string, detail?: string) {
    const inRange = val >= min && val <= max;
    this.assert(inRange, name, detail || `Value ${val} not in range [${min}, ${max}]`);
  }

  async test(name: string, fn: () => Promise<void> | void) {
    const t0 = Date.now();
    try {
      await fn();
      const durationMs = Date.now() - t0;
      console.log(`  \x1b[32m✓ PASS:\x1b[0m ${name} \x1b[90m(${durationMs}ms)\x1b[0m`);
      this.results.push({
        tier: this.currentTier,
        suite: this.currentSuite,
        name,
        passed: true,
        durationMs,
      });
    } catch (err: any) {
      const durationMs = Date.now() - t0;
      const errorMsg = err?.message || String(err);
      console.error(`  \x1b[31m✗ FAIL:\x1b[0m ${name} \x1b[90m(${durationMs}ms)\x1b[0m`);
      console.error(`     ↳ \x1b[31m${errorMsg}\x1b[0m`);
      if (err.stack) {
        console.error(`     \x1b[90m${err.stack.split("\n").slice(1, 4).join("\n     ")}\x1b[0m`);
      }
      this.results.push({
        tier: this.currentTier,
        suite: this.currentSuite,
        name,
        passed: false,
        durationMs,
        error: errorMsg,
      });
    }
  }

  merge(other: TestHarness) {
    this.results.push(...other.results);
  }

  summary(): SuiteSummary {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = total - passed;
    const durationMs = Date.now() - this.suiteStartTime;
    return {
      total,
      passed,
      failed,
      durationMs,
      exitCode: failed === 0 ? 0 : 1,
      results: [...this.results],
    };
  }

  printSummary() {
    const { total, passed, failed, durationMs, exitCode } = this.summary();
    const elapsedSec = (durationMs / 1000).toFixed(2);
    console.log("\n================================================================================");
    console.log(`   TEST HARNESS EXECUTION SUMMARY: ${total} assertions in ${elapsedSec}s`);
    console.log(`   \x1b[32mPassed: ${passed}\x1b[0m | \x1b[31mFailed: ${failed}\x1b[0m`);
    console.log("================================================================================");
    if (exitCode === 0) {
      console.log("\x1b[32m✓ 100% OF TEST ASSERTIONS PASSED WITH STATUS CODE 0\x1b[0m\n");
    } else {
      console.error("\x1b[31m✗ TEST SUITE FAILED WITH STATUS CODE 1\x1b[0m\n");
    }
  }
}
