/**
 * Test stand-in for `next/font/google`. Next turns font calls into CSS at build time; outside a build
 * (plain Node, as the tests run) there is nothing to call, so any font name returns a fixed result.
 */
const font = () => ({ className: "font-stub", variable: "font-stub-var", style: { fontFamily: "stub" } });
export default new Proxy({}, { get: () => font });
export const Instrument_Serif = font;
export const Geist = font;
export const Geist_Mono = font;
