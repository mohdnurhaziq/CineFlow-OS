import { TestHarness } from "./test-harness";
import { runTier48SignupPolishTests } from "./tier48-signup-polish.test";
const h = new TestHarness();
await runTier48SignupPolishTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
