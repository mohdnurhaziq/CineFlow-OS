/**
 * Runs work one at a time per key, within this app process. CineFlow OS runs as a single
 * process on one SQLite database, so this is enough to stop simultaneous requests from racing
 * through a "find, else create" step. Different keys never wait for each other.
 */

type Tails = Map<string, Promise<void>>;

// Kept on globalThis so a development reload doesn't start a second, separate set of locks.
const globalLocks = globalThis as typeof globalThis & { __cineflowKeyedLocks?: Tails };
const tails: Tails = (globalLocks.__cineflowKeyedLocks ??= new Map());

export async function withKeyedLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const before = tails.get(key) ?? Promise.resolve();
  const run = before.then(work);
  // The next caller waits for this one to finish, whether it succeeded or failed.
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  tails.set(key, tail);
  try {
    return await run;
  } finally {
    if (tails.get(key) === tail) tails.delete(key);
  }
}
