import { TestHarness } from "./test-harness";
import { runTier47NewStudioTests } from "./tier47-new-studio.test";
const h = new TestHarness();
await runTier47NewStudioTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
