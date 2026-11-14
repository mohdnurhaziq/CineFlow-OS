/**
 * Helpers for tests that call a server-component page as a plain async function and inspect
 * the React element tree it returns (no DOM, no renderer).
 */

/** Ensures `React` is a global, since tsx compiles the pages' JSX to `React.createElement`. */
export async function provideReactGlobal(): Promise<void> {
  (globalThis as { React?: unknown }).React ??= await import("react");
}

/**
 * Depth-first search of an element tree for the first element whose props include `key`,
 * returning that prop's value. `T` is the type the caller expects that prop to have.
 */
export function findProp<T = unknown>(node: unknown, key: string): T | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProp<T>(child, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return undefined;
  if (key in props) return props[key] as T;
  return findProp<T>(props.children, key);
}
