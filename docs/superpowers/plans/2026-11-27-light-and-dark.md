# Light and Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A light theme beside today's dark one: each studio picks its website's theme, and each person picks their own for the admin, client portal and CineFlow's pages.

**Architecture:** Raw colour classes become colour names whose values are CSS variables in `app/theme.css`. Dark is the default on `:root`; server-rendered hidden markers say which theme a page wants, and CSS `:has()` on `<html>` switches the values, so the first paint is right without scripts and client-side navigation switches by itself. Parts that must stay dark redefine the variables on their own subtree.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS 4 (`@theme inline`), Prisma/SQLite, the repo's e2e harness (`tests/e2e`), `sharp` (already installed) for screenshot comparison, Playwright (the session's browser tool) for capture.

**Spec:** `docs/superpowers/specs/2026-11-27-light-and-dark-design.md`

## Global Constraints

- Dark is the default everywhere: `Tenant.siteTheme = "DARK"` for every studio, person's choice `dark`.
- Person's choice: `Dark`, `Light`, `Match my device`. Cookie `cineflow_theme`, values `dark|light|system`; domain as `sessionCookieFor(host).domain`.
- Studio website theme: `Dark` or `Light`, in Admin → Settings → Studio.
- Always dark: landing page `/`, not-found, global error, photo and video viewers, wall-art room scenes, signature boxes and saved signatures, text over photos or video. Invoices stay white paper; QR codes on white. Emails unchanged. Printing looks as today.
- Normal text is at least 4.5:1 in both themes. Nothing under 11px (tier 50 stays).
- No new npm dependencies.
- Work on branch `theme-light-dark`. Local commits on that branch only; no push, merge or deploy without the owner asking. No Claude attribution in commits.
- After UI changes: `docker compose up -d --build app` before any browser check; `python -m graphify update .` before each commit.
- Single tier: `DATABASE_URL=file:./test.db npx tsx --import ./tests/e2e/mocks/register.mjs tests/e2e/.t53-only.ts` (after `DATABASE_URL=file:./test.db npx prisma migrate deploy` and `... npx tsx prisma/seed.ts` when the schema changed). Full suite: `pnpm test:e2e`, expected `Failed: 0`.
- Long scripts and edits: write files with the editor tool, not shell heredocs (backslashes get lost in this shell).

## Review Focus

- A studio with a **Light** website whose owner uses a **Dark** admin: the admin must be dark, the website light, and moving between them without a reload must switch both ways. (Task 4)
- `cineflow_theme` missing, junk (`blue`, `DARK `, empty) or a second theme cookie from a subdomain: dark, never a broken or half-styled page. (Task 4)
- A studio accent colour near white (`#fffbe6`) or near black (`#0a0a0a`): its text and the text on it stay readable in both themes; the saved colour is unchanged. (Task 7)
- Printing a call sheet, release or invoice while in light mode: the printout matches today's. (Task 4)
- Pop-ups drawn outside the page's wrapper (toast messages, dialogs, dropdown menus, date pickers) must follow the page's theme. (Task 4)

---

## Colour names (used by Tasks 2 and 3)

`app/theme.css` defines these variables; `@theme inline` exposes each as `--color-<name>`, giving `bg-<name>`, `text-<name>`, `border-<name>` and so on.

| Name | Dark | Light | Replaces |
|---|---|---|---|
| `page` | `#09090b` | `#f4f4f5` | `#09090b`, `zinc-950`, `#0b0b0e`, `#0a0a0d`, `#070709`, `#0c0c0f` |
| `sunken` | `#0d0d10` | `#ececee` | `#0d0d10`, `#0e0e11`, `#0f0f12`, `#111115` |
| `panel` | `#121215` | `#ffffff` | `#121215`, `#141417`, `#141418`, `#151518`, `#15151a`, `#16161b`, `#16161c` |
| `raised` | `#18181b` | `#f4f4f5` | `#18181b`, `#18181c`, `bg-zinc-900` |
| `hover` | `#1f1f23` | `#ececee` | `bg-zinc-850` |
| `control` | `#27272a` | `#e4e4e7` | `bg-zinc-800` |
| `control-strong` | `#3f3f46` | `#d4d4d8` | `bg-zinc-700`, `bg-zinc-750` |
| `dot` | `#71717a` | `#a1a1aa` | `bg-zinc-500` |
| `line` | `#27272a` | `#e4e4e7` | borders, dividers, rings `zinc-800/850/900` |
| `line-strong` | `#3f3f46` | `#d4d4d8` | borders `zinc-700/750` |
| `line-bold` | `#52525b` | `#a1a1aa` | borders `zinc-400/500/600` |
| `ink` | `#fafafa` | `#09090b` | `text-white`, `zinc-50`, `zinc-100`, `#fafafa`; `border-white` |
| `ink-soft` | `#e4e4e7` | `#18181b` | `text-zinc-200` |
| `ink-mid` | `#d4d4d8` | `#27272a` | `text-zinc-300` |
| `ink-muted` | `#a1a1aa` | `#52525b` | `text-zinc-400`, `placeholder-zinc-400` |
| `ink-faint` | `#52525b` | `#a1a1aa` | `text-zinc-600` (only controls that can't be used) |

Same in both themes: `on-accent` `#000000` (was `text-black`), `on-solid` and `on-media` `#ffffff`, `scrim` `#000000` (was `bg-black/NN`, `from/via/to-black`, `border-black`, `fill-black`, `shadow-black`), `paper` `#ffffff` (was solid `bg-white`/`bg-zinc-50`/`bg-zinc-100`), `on-paper` `#18181b`, `line-paper` `#d4d4d8` (was `border-zinc-200/300`).

**Accent text** keeps its hue and level: `text-{hue}-{100..500}` → `text-ink-{hue}-{level}`. Dark value `var(--color-{hue}-{level})` (identical to today); light value `var(--color-{hue}-800)` for levels 100–200 and `var(--color-{hue}-700)` for 300–500. Hues: amber, yellow, orange, emerald, green, teal, red, rose, blue, sky, cyan, indigo, violet, purple. Accent text at level 600+ (only on light surfaces) and accent backgrounds/borders are left as they are.

**Context rules**, judged on the one quoted class string a token is in:
1. A string with a solid colour background (`bg-{hue}-{500,600,700}` with no `/NN`, except amber/yellow) turns `text-white` into `text-on-solid`.
2. A string with `bg-black`/`bg-scrim` turns `text-white` into `text-on-media`.
3. `bg-black` without `/NN` is not rewritten: the codemod lists it for a decision (media surround → `bg-scrim`; field or card → `bg-page`).
4. Variant prefixes (`hover:`, `disabled:`, `sm:`, `group-hover:`…) and `/NN` opacity are kept.

---

### Task 1: Branch, screenshot tools and the "before" pictures

**Files:**
- Create: `scripts/theme/pages.json`, `scripts/theme/capture.js`, `scripts/theme/compare.mjs`

**Interfaces:**
- Produces: `node scripts/theme/compare.mjs <beforeDir> <afterDir>` → one line per picture, `name  changed=NN.NN%` (a pixel counts when any channel differs by more than 12/255), a `<name>.diff.png` for any above 0.10%, exit 1 if sizes differ or a picture is missing.
- `capture.js`: an `async (page) => {}` for the browser tool's run-code-from-file; saves `.playwright-mcp/theme/<OUT>/<name>-<width>.png` for widths 390 and 1280, with animations and transitions disabled by an injected style. `OUT` is a constant at the top.
- `pages.json`: `[{ name, path, as: "visitor"|"owner"|"client"|"super" }]` covering `/`, `/login`, `/privacy`, `/create-studio`, `/lumina-cine`, `/lumina-cine/book`, `/lumina-cine/visualizer`, `/lumina-cine/login`, the 15 admin sections, one invoice, one booking, `/lumina-cine/account`, `/super-admin`. Sign-ins use the seed's demo accounts.

- [ ] **Step 1:** `git checkout -b theme-light-dark` (the working tree must be clean).
- [ ] **Step 2:** Write the three files.
- [ ] **Step 3:** `docker compose up -d --build app`, run `capture.js` with `OUT="before"`. Expected: two PNGs per entry in `pages.json`.
- [ ] **Step 4:** Check the comparer: run `capture.js` again with `OUT="before2"`, then `node scripts/theme/compare.mjs .playwright-mcp/theme/before .playwright-mcp/theme/before2`. Expected: every line ≤ 0.50%; note any noisy page (clock, random content) in the ledger.
- [ ] **Step 5:** Commit `chore(theme): screenshot capture and comparison for the colour move`.

### Task 2: Colour names, dark only (no visible change)

**Files:**
- Create: `app/theme.css`, `scripts/theme/codemod.mjs`, `tests/e2e/tier53-theme.test.ts`, `tests/e2e/.t53-only.ts`
- Modify: `app/globals.css` (import theme.css; body uses the variables), `tests/e2e/runner.ts`, every file the codemod rewrites under `app/` and `components/`, `tests/e2e/tier39-landing-page.test.ts`, `tests/e2e/tier50-readable-ui.test.ts`

**Interfaces:**
- Produces: the names in "Colour names"; `transform(source: string): { code: string; changes: number; manual: string[] }` and CLI `node scripts/theme/codemod.mjs [--write] <dirs…>` (without `--write` it only reports).
- Produces: `RAW_ALLOWED: string[]` in the tier test: `components/landing/`, `app/(saas)/page.tsx`, `components/invoices/invoice-document.tsx`, `app/global-error.tsx`.

- [ ] **Step 1: Write the failing tests** (`T53-MAP-01`, `T53-MAP-02`, `T53-GUARD-01`)

```ts
const t = (cls: string) => transform(`const a = "${cls}";`).code.slice('const a = "'.length, -2);
// T53-MAP-01: names
eq(t("bg-[#09090b] text-[#fafafa] border-zinc-800"), "bg-page text-ink border-line");
eq(t("hover:bg-zinc-800/60 sm:text-zinc-400 placeholder-zinc-400"), "hover:bg-control/60 sm:text-ink-muted placeholder-ink-muted");
eq(t("text-amber-400 hover:text-emerald-300 bg-amber-500/10"), "text-ink-amber-400 hover:text-ink-emerald-300 bg-amber-500/10");
eq(t("from-[#121215] to-[#18181c] via-black"), "from-panel to-raised via-scrim");
// T53-MAP-02: context
eq(t("bg-red-600 text-white hover:bg-red-500"), "bg-red-600 text-on-solid hover:bg-red-500");
eq(t("bg-black/60 text-white"), "bg-scrim/60 text-on-media");
eq(t("bg-red-500/10 text-white"), "bg-red-500/10 text-ink");
eq(t("bg-amber-500 text-black"), "bg-amber-500 text-on-accent");
deepEq(transform('"bg-black text-sm"').manual.length, 1);
eq(transform(transform('"bg-zinc-900 text-white"').code).changes, 0); // running twice changes nothing
// T53-GUARD-01: no raw neutral, hex or accent-text class outside RAW_ALLOWED
deepEq(filesWith(/(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|divide|from|via|to|fill|stroke|shadow|outline|placeholder|decoration)-(?:zinc-\d{2,3}|white|black|\[#[0-9a-fA-F]{3,8}\])/, appAndComponents, RAW_ALLOWED), []);
deepEq(filesWith(/(?<![\w-])(?:[a-z-]+:)*text-(?:amber|yellow|orange|emerald|green|teal|red|rose|blue|sky|cyan|indigo|violet|purple)-[1-5]00/, appAndComponents, RAW_ALLOWED), []);
// …and every name used in a class exists in app/theme.css
```

- [ ] **Step 2:** Run the single tier. Expected: FAIL (codemod and theme.css missing). Add a `transform` stub returning its input, run again: the MAP and GUARD assertions fail.
- [ ] **Step 3:** Write `app/theme.css` with the **Dark** column only on `:root, [data-theme-scope="dark"]`, plus the `ink-{hue}-{level}` variables and the constant names; add `color-scheme: dark`. Write the codemod: it rewrites tokens only inside quoted strings and template literals, by the table and context rules.
- [ ] **Step 4:** `node scripts/theme/codemod.mjs app components` (report), then `--write`. Skip `RAW_ALLOWED`. Decide every `manual` entry by rule 3 and ledger the list.
- [ ] **Step 5:** Update older tests that quote exact classes to the new names (tier39 line with `text-zinc-400">&copy;`; tier50 `T50-TEXT-01`, `T50-PHONE-02`, `T50-PHONE-04`; `date-picker.tsx` now has `"text-ink-faint cursor-not-allowed"`, and tier50's faint-grey rule becomes: `text-ink-faint` only beside `cursor-not-allowed`). `T50-TEXT-02` stays (paper is not rewritten).
- [ ] **Step 6:** Run the single tier, `npx tsc --noEmit -p .`, then `pnpm test:e2e`. Expected: `Failed: 0`.
- [ ] **Step 7:** Rebuild, capture with `OUT="after-names"`, compare with `before`. Open every diff picture above 0.10%. Each is either fixed or listed for the owner (spec: differences that can be seen are listed).
- [ ] **Step 8:** Commit `refactor(theme): colour names in place of raw colours, dark unchanged`.

**Checkpoint:** report the comparison to the owner before Task 3.

### Task 3: Light values, proven readable

**Files:**
- Create: `lib/theme/contrast.ts`
- Modify: `app/theme.css`
- Test: `tests/e2e/tier53-theme.test.ts`

**Interfaces:**
- Produces: `contrastRatio(a: string, b: string): number` (hex), `blend(color: string, over: string, alpha: number): string`, `themeValues(css: string): { dark: Record<string,string>; light: Record<string,string>; system: Record<string,string> }` (name → hex, resolving `var(--color-…)` from the Tailwind palette hexes listed in the file's test fixture).
- Produces: light values apply under exactly these selectors:

```css
html:has([data-theme-user="light"]):not(:has([data-theme-lock])),
html:has([data-theme-site="light"]):not(:has([data-theme-user])):not(:has([data-theme-lock])),
[data-theme-scope="light"] { color-scheme: light; /* Light column */ }
@media (prefers-color-scheme: light) {
  html:has([data-theme-user="system"]):not(:has([data-theme-lock])) { color-scheme: light; /* the same values */ }
}
```

- [ ] **Step 1: Write the failing tests**

```ts
// T53-LIGHT-01: both light blocks are identical, and every dark name has a light value (constants excepted)
deepEq(v.system, v.light);  deepEq(missingNames(v.dark, v.light), []);
// T53-LIGHT-02: readable in BOTH themes
for (const theme of [v.dark, v.light]) {
  for (const ink of ["ink","ink-soft","ink-mid","ink-muted"]) for (const bg of ["page","sunken","panel","raised","hover","control"]) atLeast(contrastRatio(theme[ink], theme[bg]), 4.5);
  for (const ink of ["ink","ink-soft"]) atLeast(contrastRatio(theme[ink], theme["control-strong"]), 4.5);
  for (const hue of HUES) for (const level of [100,200,300,400]) for (const bg of ["page","panel","raised"]) {
    atLeast(contrastRatio(theme[`ink-${hue}-${level}`], theme[bg]), 4.5);
    atLeast(contrastRatio(theme[`ink-${hue}-${level}`], blend(PALETTE[hue][500], theme[bg], 0.1)), 4.5);
  }
}
// T53-LIGHT-03: text-ink-{hue}-500 is only used on icons or text of 18px+ (list offenders)
// T53-LIGHT-04: scrollbars follow the theme: globals.css has `scrollbar-color: var(--line-strong) transparent`
```

- [ ] **Step 2:** Run. Expected: FAIL (no light values).
- [ ] **Step 3:** Add the Light column and accent light values. Where a pair misses 4.5, change the light value (never the dark one) and ledger it.
- [ ] **Step 4:** Run the tier. Expected: PASS. **Step 5:** Commit `feat(theme): light colour values, checked for contrast`.

### Task 4: Which theme each page gets

**Files:**
- Create: `lib/theme/choice.ts`, `components/theme/theme-marker.tsx`
- Modify: `app/[tenantSlug]/layout.tsx`, `app/[tenantSlug]/admin/layout.tsx`, `app/[tenantSlug]/account/layout.tsx`, `app/(saas)/layout.tsx`, `app/(saas)/page.tsx`, `app/not-found.tsx`, `app/layout.tsx` (drop `className="dark"` and raw body colours; Toaster styled with `var(--panel)`, `var(--line)`, `var(--ink)`), `app/theme.css` (print)
- Test: `tests/e2e/tier53-theme.test.ts`

**Interfaces:**
- Produces: `type ThemeChoice = "dark"|"light"|"system"`; `const THEME_COOKIE = "cineflow_theme"`; `themeChoiceFrom(value: string | null | undefined): ThemeChoice` (anything unknown → `"dark"`); `siteThemeFrom(value: string | null | undefined): "dark"|"light"` (only `"LIGHT"` → `"light"`); `themeColor(theme: ThemeChoice): string | { media: string; color: string }[]` (`#09090b`, `#f4f4f5`).
- Produces: `ThemeMarker(props: { user?: ThemeChoice; site?: "dark"|"light"; lock?: true })` renders one `<span hidden>` with `data-theme-user`, `data-theme-site` or `data-theme-lock`.
- Consumes: Task 3's selectors. Task 6 passes the studio's saved value to `site`; until then the tenant layout passes `"dark"`.

Markers: tenant layout → `site`; admin, account and `(saas)` layouts → `user` from the cookie; landing page and not-found → `lock`. Each of those layouts also exports `generateViewport` returning `themeColor(...)` for its theme.

- [ ] **Step 1: Write the failing tests** (`T53-PAGE-01` … `-05`)

```ts
eq(themeChoiceFrom("light"),"light"); eq(themeChoiceFrom("system"),"system");
for (const junk of [undefined,null,""," ","blue","DARK ","Light"]) eq(themeChoiceFrom(junk),"dark");
eq(siteThemeFrom("LIGHT"),"light"); for (const x of [undefined,"DARK","light","x"]) eq(siteThemeFrom(x),"dark");
// markers by page: call each layout as a function (react-tree helper) and look for ThemeMarker's props
eq(markerOf(await TenantLayout(args("lumina-cine"))).site, "dark");
eq(markerOf(await AdminLayout(args("lumina-cine"))).user, "dark");      // owner session, no cookie
eq(markerOf(await withCookie("cineflow_theme=light", () => AccountLayout(args("lumina-cine")))).user, "light");
ok(markerOf(NotFound()).lock && markerOf(await SaasLandingPage()).lock);
// Review Focus: person beats studio; lock beats both — selector text in theme.css is exactly Task 3's
// Review Focus: pop-ups follow — theme.css sets values on html (not on a wrapper), and app/layout.tsx's Toaster uses var(--panel)
// Review Focus: print — theme.css has an @media print block giving html (all marker selectors) the Dark values, and a test asserts it equals the dark block
```

- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run tier and full suite. Expected: `Failed: 0`.
- [ ] **Step 5:** Rebuild. In the browser, with the cookie set by hand to `light`: `/lumina-cine/admin` is light, `/lumina-cine` dark; navigating between them by link switches both ways; `/` and `/no-such-page` stay dark; with `system` and an emulated light device the first paint is light with JavaScript disabled.
- [ ] **Step 6:** Commit `feat(theme): each page gets its theme from server-rendered markers`.

### Task 5: The person's choice

**Files:**
- Create: `components/theme/theme-switch.tsx`
- Modify: `components/auth/session-menu.tsx` (new prop `themeChoice?: boolean`), `components/admin/admin-user-nav.tsx` and `components/account/client-user-nav.tsx` (pass it; **not** `client-account-menu.tsx`, which also sits on studios' public pages), `components/saas/saas-footer.tsx`
- Test: `tests/e2e/tier53-theme.test.ts`

**Interfaces:**
- Consumes: `ThemeChoice`, `THEME_COOKIE`, `themeChoiceFrom`, `sessionCookieFor` (`lib/auth/cookie-name.ts`, client-safe).
- Produces: `themeCookieString(choice: ThemeChoice, host: string): string` in `lib/theme/choice.ts` (`path=/; max-age=31536000; samesite=lax`, plus `domain=` when `sessionCookieFor(host).domain` is set, plus `secure` on https). `ThemeSwitch({ variant: "menu" | "footer" })`: radios **Dark**, **Light**, **Match my device**, labelled **Theme**, each at least 40px high; on change writes the cookie, sets every `[data-theme-user]` marker's value at once, then `router.refresh()`. The footer one renders nothing when the path is `/`.

- [ ] **Step 1: Write the failing tests** (`T53-SWITCH-01` … `-03`): cookie string for `localhost:3000` (no domain) and, with subdomains on (set env before import, as tier33 does), `.<base>` for both the base host and a studio subdomain, none for a custom domain; static render of `ThemeSwitch` has the three labels and marks the current one; `SessionMenu` includes it only with `themeChoice`; `client-account-menu.tsx` does not pass it; footer hides it on `/` (`usePathname` mock).
- [ ] **Step 2:** Run. FAIL. **Step 3:** Implement. **Step 4:** Tier + full suite pass.
- [ ] **Step 5:** Browser at 390 and 1280: change in admin menu, client menu and footer; choice survives reload and sign-out.
- [ ] **Step 6:** Commit `feat(theme): Dark, Light or Match my device for each person`.

### Task 6: The studio's website theme

**Files:**
- Create: `prisma/migrations/20261128090000_site_theme/migration.sql`, `components/admin/settings/site-theme-preview.tsx`
- Modify: `prisma/schema.prisma` (`siteTheme String @default("DARK")`), `lib/validations/admin-settings.ts`, `lib/actions/admin-settings.ts`, `components/admin/settings/studio-tab.tsx`, `components/admin/settings/settings-ui.tsx` (type), `app/[tenantSlug]/layout.tsx`, `app/[tenantSlug]/admin/manual/settings-and-team/page.tsx`
- Test: `tests/e2e/tier53-theme.test.ts`

**Interfaces:**
- Consumes: `siteThemeFrom`, `ThemeMarker`.
- Produces: `UpdateStudioSettingsInput.siteTheme?: "DARK" | "LIGHT"`; `SiteThemePreview({ theme: "DARK"|"LIGHT"; name: string; logoUrl: string; brandColor: string })` — a small studio header and button inside `data-theme-scope={siteThemeFrom(theme)}`, followed by the text **Check your logo here: a white logo can disappear on a light page.**
- The field is labelled **Website theme**, options **Dark** and **Light**, in the "Look" section, whose description becomes **Your logo and accent colour on your public pages and emails, and your website's theme.**

- [ ] **Step 1: Write the failing tests** (`T53-SITE-01` … `-04`): a new studio and every seeded one have `"DARK"`; the owner can save `"LIGHT"` and `TenantLayout` then marks `site="light"`; a crew account without settings access and another studio's owner are refused and nothing changes; `"BLUE"` is rejected by validation; the preview renders in the chosen scope with the logo and the warning; the manual page says "Website theme".
- [ ] **Step 2:** Run. FAIL. **Step 3:** Implement; check `prisma migrate diff` reports no difference. **Step 4:** Tier + full suite pass.
- [ ] **Step 5:** Commit `feat(theme): studios choose their website's theme`.

### Task 7: Studio accent colours stay readable

**Files:**
- Create: `lib/theme/brand.ts`
- Modify: each place found by `grep -rn "brandColor" components app --include=*.tsx | grep "style="` (about 22), `app/theme.css` (`--brand-ink` picks `--brand-ink-dark` or `--brand-ink-light` by theme; utilities `text-brand-ink`, `bg-brand`, `text-brand-on`)
- Test: `tests/e2e/tier53-theme.test.ts`

**Interfaces:**
- Consumes: `contrastRatio`.
- Produces: `readableInk(color: string, surface: string, min = 4.5): string` (the colour itself if it passes; otherwise mixed toward black or white, the smallest step that passes); `textOn(color: string): "#000000" | "#ffffff"` (the higher contrast); `brandVars(color: string | null | undefined): Record<"--brand"|"--brand-ink-dark"|"--brand-ink-light"|"--brand-on", string>` (invalid or empty → `#f59e0b`; 3-digit hex accepted). Surfaces: dark `#121215`, light `#ffffff`.

- [ ] **Step 1: Write the failing tests** (`T53-BRAND-01` … `-03`)

```ts
for (const c of ["#f59e0b","#06b6d4","#10b981","#f43f5e","#8b5cf6","#fffbe6","#0a0a0a","#777777","#fff","not-a-colour"]) {
  const v = brandVars(c);
  atLeast(contrastRatio(v["--brand-ink-dark"], "#121215"), 4.5); atLeast(contrastRatio(v["--brand-ink-light"], "#ffffff"), 4.5);
  atLeast(contrastRatio(v["--brand-on"], v["--brand"]), 4.5);
}
for (const preset of ["#f59e0b","#06b6d4","#10b981","#f43f5e","#8b5cf6"]) { eq(brandVars(preset)["--brand-ink-dark"], preset); eq(brandVars(preset)["--brand-on"], "#000000"); } // dark looks as today
// no component sets `color: brandColor` or puts fixed text on a raw brand background any more
```

- [ ] **Step 2:** Run. FAIL. **Step 3:** Implement and apply `brandVars` where a studio colour is used for text or has text on it (decorative dots may keep `var(--brand)`). **Step 4:** Tier + full suite pass.
- [ ] **Step 5:** Commit `feat(theme): studio accent colours stay readable in both themes`.

### Task 8: What stays dark

**Files:**
- Modify (add `data-theme-scope="dark"` to the outermost element of each): `components/showcase/media-lightbox-modal.tsx`, `components/showcase/video-reel-modal.tsx`, `components/vault/video-player-card.tsx`, the lightbox in `components/vault/photo-grid.tsx`, `components/visualizer/room-scene.tsx`, `components/visualizer/sofa-mockup.tsx`, `components/proposals/signature-pad.tsx`, `components/logistics/release-signature-pad.tsx`, the saved-signature box in `components/logistics/release-form-shell.tsx` (and wherever a saved proposal signature is shown), and every container that draws text over a photo or video
- Test: `tests/e2e/tier53-theme.test.ts`

- [ ] **Step 1:** List the photo overlays: files under `components/showcase`, `components/vault`, `components/admin/cms`, `components/admin/projects`, `components/landing` excluded, that have `from-scrim`, `to-scrim`, `bg-scrim/` or an absolutely placed text layer over an `<img>`/`<video>`. Ledger the list; it goes into the test as `DARK_SCOPES`.
- [ ] **Step 2: Write the failing tests** (`T53-KEEP-01`, `-02`): every file in the list above and in `DARK_SCOPES` contains `data-theme-scope="dark"`; QR images sit on `bg-paper` (`payments-tab.tsx`, `qr-payment-form.tsx`); invoice-document contains no theme names.
- [ ] **Step 3:** Run. FAIL. **Step 4:** Add the scopes. **Step 5:** Tier + full suite pass.
- [ ] **Step 6:** Commit `feat(theme): viewers, photo overlays and signatures stay dark`.

### Task 9: Every page, both themes

**Files:**
- Modify: `scripts/theme/pages.json` (add booking, checkout, my-booking, register, a proposal, a release, the vault, a call sheet, the remaining admin detail pages and manual, sign-up, `/studios`), `scripts/theme/capture.js` (takes a theme: sets the cookie, and the seeded studio's `siteTheme` through the settings page), and whatever the check finds
- Test: `tests/e2e/tier53-theme.test.ts` (one regression assertion for each fault fixed)

- [ ] **Step 1:** Capture every page in dark and in light, 390 and 1280.
- [ ] **Step 2:** In the browser, in both themes, run a contrast check on every visible text element (computed colour against the nearest non-transparent background, 4.5 or 3.0 for 18px+; skip elements inside `[data-theme-scope]` over images) and a sideways-scroll check. List every failure.
- [ ] **Step 3:** Also open and check: each dialog type, a toast, a dropdown menu, the date and time pickers, both signature pads, both lightboxes, print preview of an invoice and a call sheet in light mode (same as dark's printout).
- [ ] **Step 4:** Compare the dark pictures with Task 1's `before` set once more.
- [ ] **Step 5:** Fix faults by area (public pages, booking and checkout, client portal, admin by section, CineFlow pages, super-admin), a regression assertion first for each; re-capture.
- [ ] **Step 6:** `pnpm test:e2e` (`Failed: 0`), `npx tsc --noEmit -p .`, commit `fix(theme): readability fixes from checking every page in both themes`.
- [ ] **Step 7:** Report to the owner with pictures of a few key pages in both themes, anything that couldn't be checked, and ask about staging (staging's `.env` needs `DEPLOY_BRANCH=theme-light-dark` for the test, set back to `main` after merging).
