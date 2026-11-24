// Module-resolution hook: redirect `next/headers` to the test stub, and load stylesheets as
// empty modules (pages like the admin Overview import CSS, which Node can't load).
const STUB_URL = new URL("./next-headers-stub.mjs", import.meta.url).href;
const FONT_STUB_URL = new URL("./next-font-stub.mjs", import.meta.url).href;
const EMPTY_MODULE = "data:text/javascript,export default {};";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") {
    return { url: STUB_URL, shortCircuit: true };
  }
  if (specifier === "next/font/google") {
    return { url: FONT_STUB_URL, shortCircuit: true };
  }
  if (/\.css(\?.*)?$/.test(specifier)) {
    return { url: EMPTY_MODULE, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
