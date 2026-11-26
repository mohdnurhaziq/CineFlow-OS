import { TestHarness } from "./test-harness";
import { runTier52InviteApprovalTests } from "./tier52-invite-approval.test";
const h = new TestHarness();
await runTier52InviteApprovalTests(h);
await h.runTeardown();
h.printSummary();
process.exit(h.summary().exitCode);
