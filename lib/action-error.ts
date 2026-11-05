/**
 * The message a server action returns to the browser when it fails. A Zod validation
 * error's own `message` is a JSON dump of every issue, so show the first issue's
 * sentence instead (e.g. "The deposit can't be more than the package price.").
 */
export function actionErrorMessage(error: unknown, fallback: string): string {
  const e = error as { issues?: Array<{ message?: string }>; message?: string } | null;
  return e?.issues?.[0]?.message || e?.message || fallback;
}
