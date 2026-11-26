import { TestHarness } from "./test-harness";
import { runTier49StudioDateTests } from "./tier49-studio-dates.test";
const h = new TestHarness();
await runTier49StudioDateTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
