import { TestHarness } from "./test-harness";
import { runTier46SystemHealthTests } from "./tier46-system-health.test";
const h = new TestHarness();
await runTier46SystemHealthTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
