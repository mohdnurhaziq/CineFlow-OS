/**
 * When a client gets their files.
 *
 * A studio chooses (Settings → Photo delivery) whether clients see watermarked previews
 * until the balance is paid, or get the full-resolution files as soon as they are uploaded.
 * Either way, paying the balance releases everything.
 *
 * Not a "use server" module.
 */
export function filesReleased(
  project: { isFinalBalancePaid: boolean },
  tenant: { releaseFilesBeforePayment: boolean }
): boolean {
  return project.isFinalBalancePaid || tenant.releaseFilesBeforePayment;
}
