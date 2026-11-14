/**
 * Typing helpers for tests that inspect action results.
 *
 * Server actions return discriminated unions such as
 * `{ success: true; invoiceId: string } | { success: false; error: string; message: string }`.
 * Tests often read fields from either side (`res.error`, `res.invoiceId`) and assert on them,
 * which TypeScript rejects without narrowing. `loose()` widens the union to one object where
 * every member's keys are optional: honest about what may be missing, unlike `any`.
 */

type KeysOfUnion<T> = T extends unknown ? keyof T : never;

export type Loose<T> = {
  [K in KeysOfUnion<T>]?: T extends unknown ? (K extends keyof T ? T[K] : never) : never;
};

export function loose<T>(value: T): Loose<T> {
  return value as Loose<T>;
}

/**
 * Deliberately wrong-typed input, for tests that check an action's runtime validation
 * (e.g. an unknown status). Spells out the intent instead of `as any`.
 */
export function invalid<T>(value: unknown): T {
  return value as T;
}

/**
 * The success branch(es) of an action result union. Results written with `as const` or an
 * explicit type have `success: true` literals. Most actions here return plain object literals,
 * where TypeScript widens `success` to `boolean`; there the failure branches are the ones
 * carrying `error: string`, so the success branches are the rest.
 */
export type Succeeded<T> = [Extract<T, { success: true }>] extends [never]
  ? Exclude<T, { error: string }>
  : Extract<T, { success: true }>;

/**
 * Narrows an action result to its success branch, or throws with the whole result.
 * Use after `harness.assert(res.success === true, ...)` when later steps need the success
 * fields (ids, numbers): harness.assert records a failure and carries on, so without this
 * a failed setup would feed `undefined` into the next step.
 */
export function expectSuccess<T extends { success: boolean }>(
  res: T,
  what: string
): asserts res is Succeeded<T> {
  if (!res.success) throw new Error(`${what} did not succeed: ${JSON.stringify(res)}`);
}

/**
 * A value a test needs (an id from a result, a seeded row), or a clear error if it is missing.
 * For fields an action's type declares optional even on success.
 */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`${what} is missing`);
  return value;
}
