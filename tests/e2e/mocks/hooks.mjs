// Module-resolution hook: redirect `next/headers` to the test stub.
const STUB_URL = new URL("./next-headers-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") {
    return { url: STUB_URL, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
