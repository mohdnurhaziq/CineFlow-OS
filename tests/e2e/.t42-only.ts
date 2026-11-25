import { TestHarness } from "./test-harness";
import { runTier42OneLoginSwitcherTests } from "./tier42-one-login-switcher.test";
const h = new TestHarness();
await runTier42OneLoginSwitcherTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
