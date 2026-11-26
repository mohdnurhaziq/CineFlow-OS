import { TestHarness } from "./test-harness";
import { runTier51SignupFlowTests } from "./tier51-signup-flow.test";
const h = new TestHarness();
await runTier51SignupFlowTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
