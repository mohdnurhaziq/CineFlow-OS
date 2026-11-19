import { appEnvFrom } from "@/lib/app-env";

/**
 * The two demo studios (Lumina CineWorks, Apex Photo & Motion) exist only in dev and staging,
 * which load demo data. Production never has them, so its public pages don't link to them,
 * and its sign-in pages never offer their demo accounts, even if a real studio takes the address.
 */

const DEMO_PERSONAS: Record<string, { owner: string; staff: string }> = {
  "lumina-cine": { owner: "alex@luminacine.com", staff: "sarah@luminacine.com" },
  "apex-media": { owner: "david@apexmedia.com", staff: "aisyah@apexmedia.com" },
};

export type DemoPersonas = { owner: string; staff: string };

/** Whether this copy shows the demo studios (and the super-admin link) on its public pages. */
export function showsDemoStudios(env: Record<string, string | undefined> = process.env): boolean {
  return appEnvFrom(env) !== "production";
}

/** The demo accounts to offer on a studio's sign-in page, or null for any real studio. */
export function demoPersonasFor(slug: string, env: Record<string, string | undefined> = process.env): DemoPersonas | null {
  if (!showsDemoStudios(env)) return null;
  return DEMO_PERSONAS[slug] ?? null;
}
