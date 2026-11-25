import { TestHarness } from "./test-harness";
import { runTier41OneLoginTests } from "./tier41-one-login.test";
const h = new TestHarness();
await runTier41OneLoginTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
