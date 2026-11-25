import { TestHarness } from "./test-harness";
import { runTier44LegalPagesTests } from "./tier44-legal-pages.test";
const h = new TestHarness();
await runTier44LegalPagesTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
