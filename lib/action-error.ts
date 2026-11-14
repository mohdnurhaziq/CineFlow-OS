/**
 * The message a server action returns to the browser when it fails. A Zod validation
 * error's own `message` is a JSON dump of every issue, so show the first issue's
 * sentence instead (e.g. "The deposit can't be more than the package price.").
 */
export function actionErrorMessage(error: unknown, fallback: string): string {
  const e = error as { issues?: Array<{ message?: string }>; message?: string } | null;
  return e?.issues?.[0]?.message || e?.message || fallback;
}

/**
 * The `message` of a caught value, or undefined if it has none (something other than an
 * Error was thrown). For `catch (err)` blocks, where `err` is `unknown`. Safe in client code.
 */
export function errorMessageOf(error: unknown): string | undefined {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return undefined;
}
