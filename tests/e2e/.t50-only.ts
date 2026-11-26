import { TestHarness } from "./test-harness";
import { runTier50ReadableUiTests } from "./tier50-readable-ui.test";
const h = new TestHarness();
await runTier50ReadableUiTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
