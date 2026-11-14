/**
 * After a user signs out on purpose, their destination carries `?signedOut=1`, and
 * SignedOutNotice (in the root layout) confirms it with a toast and then removes the flag
 * from the URL. Works for full reloads and client-side navigation alike. Client-safe.
 */
export const SIGNED_OUT_PARAM = "signedOut";

/** `path` with the signed-out flag added, keeping any query it already has. */
export function signedOutHref(path: string): string {
  const [base, query = ""] = path.split("?", 2);
  const params = new URLSearchParams(query);
  params.set(SIGNED_OUT_PARAM, "1");
  return `${base}?${params.toString()}`;
}
