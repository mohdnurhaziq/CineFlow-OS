import { TestHarness } from "./test-harness";
import { runTier45AuditFixesTests } from "./tier45-audit-fixes.test";
const h = new TestHarness();
await runTier45AuditFixesTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
