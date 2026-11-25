import { platformUrl } from "@/lib/domain-name";

/**
 * Client-side helpers for the custom-domain handoff (see lib/auth/handoff.ts). Plain module: safe in
 * client components. `target` and `returnPath` are paths on the studio's own domain.
 *
 * Both go to the platform as a form POST, never a link: the browser adds an Origin header to a
 * cross-site POST, which is how the platform knows the request came from the studio's own page and not
 * from a page someone else built to log a visitor into their account.
 */

function postForm(action: string, fields: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/** After a sign-in on a studio's own domain: the platform signs the browser in too, then returns to `target`. */
export function handoffNavigate(code: string, target: string): void {
  postForm(platformUrl("/auth/handoff"), { code, next: `${window.location.origin}${target}` });
}

/** After signing out on a studio's own domain: the platform clears its cookie too, then returns to `returnPath`. */
export function signOutNavigate(via: string, returnPath: string): void {
  postForm(via, { next: `${window.location.origin}${returnPath}` });
}
