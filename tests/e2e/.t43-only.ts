import { TestHarness } from "./test-harness";
import { runTier43GoogleSignInTests } from "./tier43-google-sign-in.test";
const h = new TestHarness();
await runTier43GoogleSignInTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
