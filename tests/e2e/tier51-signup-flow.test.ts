/**
 * Tier 51: the studio sign-up flow (27 November walkthrough, packages A and B)
 * A1. The web address follows the whole studio name, as it is typed
 * A2. A new owner can use the main "Sign in" with the password they chose; it opens nothing the
 *     studio's own sign-in page wouldn't, and a failure still says nothing about the email
 * B.  Back and refresh keep the answers; problems are shown where they are; the last step is a real
 *     review; failed tries don't lock a person out
 */
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TestHarness } from "./test-harness";
import { provideReactGlobal } from "./react-tree";
import { db } from "@/lib/db";
import { slugFromName } from "@/lib/studio-slug";
import { draftToStore, isFullEmail, parseDraft, reachableStep, stepForField } from "@/lib/onboarding/wizard-draft";
import { ReviewSummary } from "@/components/onboarding/review-summary";
import { checkSignupCode, onboardStudio } from "@/lib/actions/onboarding";
import { loginToPlatform } from "@/lib/actions/one-login";
import { createLoginFromProof } from "@/lib/auth/login";
import { COOKIE_NAME, decodeSessionToken } from "@/lib/auth/token";
import { withIp, withRequest } from "./mocks/session";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const WIZARD = "app/(saas)/create-studio/page.tsx";

export async function runTier51SignupFlowTests(harness: TestHarness) {
  harness.setSuite("Tier 51", "Studio sign-up flow");
  await provideReactGlobal();

  const run = Date.now().toString(36);
  const slugs: string[] = [];
  const emails: string[] = [];
  harness.registerTeardown(async () => {
    await db.tenant.deleteMany({ where: { slug: { in: slugs } } });
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.login.deleteMany({ where: { email: { in: emails } } });
  });

  const emailFor = (name: string) => {
    const e = `t51-${name}-${run}@example.test`;
    emails.push(e);
    return e;
  };
  /** A studio with one account, made directly. */
  const makeAccount = async (name: string, email: string, password: string | null, opts: { role?: string; removed?: boolean; closed?: boolean; studioName?: string } = {}) => {
    const slug = `t51-${name}-${run}`;
    slugs.push(slug);
    const tenant = await db.tenant.create({
      data: { name: opts.studioName ?? `T51 ${name}`, slug, discipline: "HYBRID", ...(opts.closed ? { subscriptionStatus: "CANCELLED" } : {}) },
    });
    const user = await db.user.create({
      data: {
        tenantId: tenant.id,
        name: "T51 Person",
        email,
        role: opts.role ?? "STUDIO_OWNER",
        passwordHash: password ? await bcrypt.hash(password, 10) : null,
        ...(opts.removed ? { deactivatedAt: new Date() } : {}),
      },
    });
    return { slug, tenant, user };
  };
  type SignIn = { success: boolean; error?: string; redirectTo?: string; studios?: { slug: string; name: string; role: string }[] };
  const signIn = (email: string, password: string, slug?: string) =>
    withRequest(async (jar) => ({
      res: (await (loginToPlatform as (e: string, p: string, s?: string) => Promise<unknown>)(email, password, slug)) as SignIn,
      session: await decodeSessionToken(jar.get(COOKIE_NAME) ?? ""),
    }));

  const signUpInput = (slug: string, extra: Record<string, unknown> = {}) => {
    slugs.push(slug);
    const ownerEmail = (extra.ownerEmail as string) ?? emailFor(`signup-${slug}`);
    return { name: "T51 Signup", slug, discipline: "HYBRID", currency: "MYR", ownerName: "T51 Owner", ownerEmail, password: "password123", ...extra } as never;
  };
  type Made = { success: boolean; error?: string; field?: string };

  // ── A1: the web address ─────────────────────────────────────────────────────────────────
  await harness.test("T51-ADDR-01: the address comes from the whole name", async () => {
    const cases: [string, string][] = [
      ["Flow Review Studio", "flow-review-studio"],
      ["Aina's Photography", "ainas-photography"],
      ["Aina’s Photography", "ainas-photography"],
      ["  Haz — Wedding Films!  ", "haz-wedding-films"],
      ["Café Éclair & Co.", "cafe-eclair-co"],
      ["Studio9", "studio9"],
      ["", ""],
    ];
    for (const [name, address] of cases) harness.assertEqual(slugFromName(name), address, `"${name}"`);
    const long = slugFromName("The Extremely Long Name Of A Wedding Photography And Film Company In Penang");
    harness.assert(long.length <= 50 && !long.endsWith("-"), "At most 50, never ending in a dash", long);
  });

  await harness.test("T51-ADDR-02: typed letter by letter, and corrected, the address keeps up", async () => {
    // What the wizard does on each keystroke, while the owner hasn't typed an address of their own.
    const typeThrough = (steps: string[]) => steps.reduce((_, name) => slugFromName(name), "");
    const full = "Flow Review Studio";
    harness.assertEqual(typeThrough(Array.from(full, (_, i) => full.slice(0, i + 1))), "flow-review-studio", "Every keystroke");
    harness.assertEqual(typeThrough(["M", "Mx", "Mxy", "Mxya", "Mxy", "Mx", "M", "Ma", "May", "Maya"]), "maya", "A typo that was fixed leaves no trace");
    const wizard = read(WIZARD);
    harness.assert(!wizard.includes("autoSlug.slice(0, -1)"), "The old rule that stopped after the first word is gone");
    harness.assert(/slug: addressEdited \? prev\.slug : slugFromName\(val\)/.test(wizard), "It follows the name until the owner edits the address");
  });

  await harness.test("T51-ADDR-03: the address is checked as soon as it changes, and Continue waits for the answer", async () => {
    const wizard = read(WIZARD);
    harness.assert(/useEffect\(\(\) => \{\n\s*const slug = formData\.slug;[\s\S]{0,700}checkSlugAvailability\(slug\)[\s\S]{0,500}\[formData\.slug\]\);/.test(wizard), "Checked whenever it changes, however it was filled in");
    harness.assert(!/onBlur=\{handleSlugBlur\}/.test(wizard), "Not only when someone clicks into the box and out again");
    harness.assert(/const addressChecked = slugStatus\.slug === formData\.slug/.test(wizard) && /isStep1Valid =[\s\S]{0,200}addressChecked/.test(wizard), "Continue needs the answer for this address");
  });

  // ── A2: the main "Sign in" ──────────────────────────────────────────────────────────────
  await harness.test("T51-SIGNIN-01: a brand-new owner signs in on the main page and lands in their studio", async () => {
    const slug = `t51-new-${run}`;
    const email = emailFor("new-owner");
    const made = (await onboardStudio(signUpInput(slug, { ownerEmail: email }))) as Made;
    harness.assert(made.success, "Registered", JSON.stringify(made));
    const ok = await signIn(email, "password123");
    harness.assert(ok.res.success === true && Boolean(ok.res.redirectTo?.endsWith(`/${slug}/admin`)), "Signed in, into the studio's admin", JSON.stringify(ok.res));
    const owner = await db.user.findFirstOrThrow({ where: { tenant: { slug }, role: "STUDIO_OWNER" } });
    harness.assertEqual(ok.session?.user.id, owner.id, "As that account");
    harness.assert(!ok.session?.user.loginId && !ok.session?.accounts, "A stand-alone session: no one sign-in is made, because the email isn't proven");
    harness.assertEqual(await db.login.count({ where: { email } }), 0, "…and none was created");
    const upper = await signIn(`  ${email.toUpperCase()} `, "password123");
    harness.assert(upper.res.success === true, "Capitals and spaces in the email don't matter");
    const wrong = await signIn(email, "password124");
    harness.assertDeepEqual(wrong.res, { success: false, error: "INVALID_CREDENTIALS" }, "A wrong password");
    harness.assertEqual(wrong.session, null, "…signs nobody in");
  });

  await harness.test("T51-SIGNIN-02: one password at two studios asks which; each studio's own password opens only that one", async () => {
    const email = emailFor("two");
    const a = await makeAccount("two-a", email, "same-pass-123", { studioName: "T51 Alpha" });
    const b = await makeAccount("two-b", email, "same-pass-123", { role: "CLIENT", studioName: "T51 Beta" });
    const ask = await signIn(email, "same-pass-123");
    harness.assertEqual(ask.res.error, "CHOOSE_STUDIO", "Asks which studio");
    harness.assertDeepEqual(ask.res.studios, [{ slug: a.slug, name: "T51 Alpha", role: "Owner" }, { slug: b.slug, name: "T51 Beta", role: "Client" }], "Owner first, then the client account");
    harness.assertEqual(ask.session, null, "Nobody is signed in yet");
    const chosen = await signIn(email, "same-pass-123", b.slug);
    harness.assert(chosen.res.success === true && chosen.session?.user.id === b.user.id && Boolean(chosen.res.redirectTo?.endsWith(`/${b.slug}/account`)), "The chosen one, in the client's own place", JSON.stringify(chosen.res));
    const notTheirs = await signIn(email, "same-pass-123", "lumina-cine");
    harness.assertDeepEqual(notTheirs.res, { success: false, error: "INVALID_CREDENTIALS" }, "A studio the password doesn't open is refused");
    await db.user.update({ where: { id: b.user.id }, data: { passwordHash: await bcrypt.hash("other-pass-123", 10) } });
    const onlyA = await signIn(email, "same-pass-123");
    harness.assert(onlyA.res.success === true && onlyA.session?.user.id === a.user.id, "Different passwords: straight in");
  });

  await harness.test("T51-SIGNIN-03: it opens nothing that shouldn't open", async () => {
    const removed = emailFor("removed");
    await makeAccount("removed", removed, "pass-12345", { removed: true });
    const closed = emailFor("closed");
    await makeAccount("closed", closed, "pass-12345", { closed: true });
    const invited = emailFor("invited");
    await makeAccount("invited", invited, null, { role: "CREW" });
    const joined = emailFor("joined");
    await makeAccount("joined", joined, "old-pass-123");
    await createLoginFromProof(joined, await bcrypt.hash("new-pass-123", 10));
    const superRow = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
    const cases: [string, string, string][] = [
      ["an account its studio removed", removed, "pass-12345"],
      ["a closed studio's account", closed, "pass-12345"],
      ["an invite nobody has taken up", invited, ""],
      ["the old password of an account now on one sign-in", joined, "old-pass-123"],
      ["the platform super-admin", superRow.email, "password123"],
      ["an email nobody has", emailFor("nobody"), "whatever-123"],
    ];
    for (const [what, email, password] of cases) {
      const out = await signIn(email, password);
      harness.assert(JSON.stringify(out.res) === JSON.stringify({ success: false, error: "INVALID_CREDENTIALS" }) && out.session === null, `${what}: the same refusal, no session`, JSON.stringify(out.res));
    }
    const viaLogin = await signIn(joined, "new-pass-123");
    harness.assert(viaLogin.res.success === true && viaLogin.res.redirectTo === "/studios", "One sign-in works as before");
  });

  await harness.test("T51-SIGNIN-04: someone else's studio made with your email can't change which studio your password opens", async () => {
    const email = emailFor("victim");
    const mine = await makeAccount("mine", email, "my-pass-1234");
    await makeAccount("theirs", email, "their-pass-1234");
    const out = await signIn(email, "my-pass-1234");
    harness.assert(out.res.success === true && out.session?.user.id === mine.user.id, "Mine, and only mine", JSON.stringify(out.res));
  });

  await harness.test("T51-SIGNIN-05: every refusal does the same work, however many accounts the email has", async () => {
    const one = emailFor("work-one");
    await makeAccount("work-1", one, "pass-12345");
    const many = emailFor("work-many");
    for (let i = 0; i < 6; i++) await makeAccount(`work-many-${i}`, many, `pass-${i}-12345`);
    const superRow = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
    const real = bcrypt.compareSync;
    const counts: number[] = [];
    try {
      for (const email of [emailFor("work-nobody"), one, many, superRow.email]) {
        let count = 0;
        bcrypt.compareSync = ((p: string, h: string) => {
          count += 1;
          return real(p, h);
        }) as typeof bcrypt.compareSync;
        await signIn(email, "not-the-password");
        counts.push(count);
      }
    } finally {
      bcrypt.compareSync = real;
    }
    harness.assert(counts.every((c) => c === counts[0]) && counts[0]! >= 2, "The same number of password checks, so timing tells nothing", counts.join(", "));
  });

  await harness.test("T51-SIGNIN-06: the sign-in page offers the choice of studios and a way to start one", async () => {
    const form = read("components/auth/platform-account-login-form.tsx");
    harness.assert(/CHOOSE_STUDIO/.test(form) && /Which studio\?/.test(form), "Asks which studio");
    harness.assert(/href=\{platformUrl\("\/create-studio"\)\}/.test(form), "Links to starting a studio");
    harness.assert(!form.includes("It starts when you confirm your email from a studio you use"), "No longer says sign-in waits for a confirmed email");
  });

  // ── B: Back and refresh ─────────────────────────────────────────────────────────────────
  await harness.test("T51-DRAFT-01: the saved answers never include the password, and come back as typed", async () => {
    const stored = draftToStore({ step: 3, addressEdited: true, google: false, form: { name: "My Studio", slug: "mine", ownerEmail: "a@b.my", password: "secret-pass-1" } });
    harness.assert(!stored.includes("secret-pass-1") && !stored.includes("password"), "No password", stored);
    const back = parseDraft(stored);
    harness.assertDeepEqual(back, { step: 3, addressEdited: true, google: false, form: { name: "My Studio", slug: "mine", ownerEmail: "a@b.my" } }, "The rest is intact");
    for (const bad of [null, "", "not json", "42", "{}"]) harness.assertEqual(parseDraft(bad), null, `Unreadable (${String(bad)}): start afresh`);
  });

  await harness.test("T51-DRAFT-02: nobody lands on the review without the owner step done", async () => {
    harness.assertEqual(reachableStep(4, false), 3, "Password gone after a refresh: back to it");
    harness.assertEqual(reachableStep(4, true), 4, "Ready: the review");
    harness.assertEqual(reachableStep(2, false), 2, "Earlier steps as asked");
    harness.assertEqual(reachableStep(9, true), 4, "Nonsense is clamped");
    harness.assertEqual(reachableStep(Number.NaN, true), 1, "…or starts over");
  });

  await harness.test("T51-DRAFT-03: steps are in the browser's history, and a finished sign-up clears the draft", async () => {
    const wizard = read(WIZARD);
    harness.assert(/window\.history\.pushState\(/.test(wizard) && /addEventListener\("popstate"/.test(wizard), "Back and Forward move between steps");
    harness.assert(/sessionStorage\.removeItem\(SAVE_KEY\)/.test(wizard), "Cleared once the studio exists");
    harness.assert(/draftToStore\(/.test(wizard) && /parseDraft\(/.test(wizard), "Saved and restored through the safe helpers");
    harness.assert(!/setCurrentStep\([1-4]\)\}/.test(wizard), "No button skips the history");
  });

  // ── B: problems where they are ──────────────────────────────────────────────────────────
  await harness.test("T51-ERR-01: a half-typed email is caught on its own step, by the same rule as the server", async () => {
    for (const bad of ["maya@", "maya", "@x.my", "maya@studio", "ma ya@x.my"]) harness.assertEqual(isFullEmail(bad), false, bad);
    for (const good of ["maya@veloxcinema.com", "  Maya@Studio.MY "]) harness.assertEqual(isFullEmail(good), true, good);
    const wizard = read(WIZARD);
    harness.assert(/isStep3Valid =[\s\S]{0,200}isFullEmail\(formData\.ownerEmail\)/.test(wizard), "Continue needs a whole address");
    harness.assert(wizard.includes("Enter a full email address, like name@example.com"), "…and says so beside the box");
  });

  await harness.test("T51-ERR-02: the server says which field is wrong", async () => {
    const taken = (await onboardStudio(signUpInput(`t51-x-${run}`, { slug: "lumina-cine" }))) as Made;
    harness.assertEqual(taken.field, "slug", "A taken address");
    const reserved = (await onboardStudio(signUpInput(`t51-y-${run}`, { slug: "privacy" }))) as Made;
    harness.assertEqual(reserved.field, "slug", "A reserved address");
    const badEmail = (await onboardStudio(signUpInput(`t51-z-${run}`, { ownerEmail: "maya@" }))) as Made;
    harness.assertEqual(badEmail.field, "ownerEmail", "A bad email");
    const short = (await onboardStudio(signUpInput(`t51-w-${run}`, { password: "abc" }))) as Made;
    harness.assertEqual(short.field, "password", "A short password");
    const email = emailFor("has-login");
    await createLoginFromProof(email, await bcrypt.hash("right-pass-123", 10));
    const wrongPw = (await onboardStudio(signUpInput(`t51-v-${run}`, { ownerEmail: email, password: "wrong-pass-123" }))) as Made;
    harness.assertEqual(wrongPw.field, "password", "A one sign-in email with the wrong password");
  });

  await harness.test("T51-ERR-03: the wizard goes to the step with the problem and keeps the message there", async () => {
    harness.assertEqual(stepForField("slug"), 1, "Address");
    harness.assertEqual(stepForField("signupCode"), 1, "Invite code");
    harness.assertEqual(stepForField("name"), 1, "Name");
    harness.assertEqual(stepForField("tagline"), 2, "Tagline");
    harness.assertEqual(stepForField("ownerEmail"), 3, "Email");
    harness.assertEqual(stepForField("password"), 3, "Password");
    harness.assertEqual(stepForField(undefined), 4, "Anything else stays on the review");
    const wizard = read(WIZARD);
    harness.assert(/goToStep\(stepForField\(res\.field\)\)/.test(wizard), "Goes there");
    harness.assert(/role="alert"[\s\S]{0,300}\{submitError\.message\}/.test(wizard), "Stays on screen, announced");
    harness.assert(!/toast\.error\(res\.error/.test(wizard), "Not a pop-up that vanishes");
  });

  // ── B: a real review ────────────────────────────────────────────────────────────────────
  await harness.test("T51-REVIEW-01: the last step shows every answer, with a way back to change it", async () => {
    const html = renderToStaticMarkup(
      createElement(ReviewSummary, {
        details: { name: "Maya Films", address: "cineflow-os.my/maya-films", discipline: "Photo & video", tagline: "", ownerName: "Maya Lin", ownerEmail: "maya@films.my", ownerPhone: "", google: false },
        onChange: () => undefined,
      })
    );
    for (const text of ["Maya Films", "cineflow-os.my/maya-films", "Photo &amp; video", "Maya Lin", "maya@films.my", "The password you chose", "None"]) {
      harness.assert(html.includes(text), `Shows ${text}`);
    }
    harness.assertEqual((html.match(/>Change/g) ?? []).length, 3, "Change for each earlier step");
    const google = renderToStaticMarkup(createElement(ReviewSummary, { details: { name: "A", address: "x/a", discipline: "Photo", tagline: "T", ownerName: "B", ownerEmail: "b@c.my", ownerPhone: "012", google: true }, onChange: () => undefined }));
    harness.assert(google.includes("Google") && !google.includes("The password you chose"), "Google sign-up says so");
    harness.assert(/<ReviewSummary/.test(read(WIZARD)) && read(WIZARD).includes("Review and choose your plan"), "On the last step");
  });

  // ── B: the try limit ────────────────────────────────────────────────────────────────────
  await harness.test("T51-LIMIT-01: mistakes don't lock a person out; five new studios an hour is still the most", async () => {
    await withIp("198.51.100.201", async () => {
      for (let i = 0; i < 8; i++) {
        const res = (await onboardStudio(signUpInput(`t51-lim-bad-${i}-${run}`, { slug: "lumina-cine" }))) as Made;
        harness.assert(res.field === "slug", `Mistake ${i + 1} is just a mistake`, JSON.stringify(res));
      }
      for (let i = 0; i < 5; i++) {
        const res = (await onboardStudio(signUpInput(`t51-lim-ok-${i}-${run}`))) as Made;
        harness.assert(res.success, `Studio ${i + 1} is made`, JSON.stringify(res));
      }
      const sixth = (await onboardStudio(signUpInput(`t51-lim-six-${run}`))) as Made;
      harness.assert(!sixth.success && /Too many/.test(sixth.error ?? ""), "The sixth waits", JSON.stringify(sixth));
    });
  });

  await harness.test("T51-LIMIT-02: endless attempts are still stopped", async () => {
    await withIp("198.51.100.202", async () => {
      let refusedAt = 0;
      for (let i = 1; i <= 31 && !refusedAt; i++) {
        const res = (await onboardStudio(signUpInput(`t51-flood-${i}-${run}`, { slug: "lumina-cine" }))) as Made;
        if (/Too many/.test(res.error ?? "")) refusedAt = i;
      }
      harness.assertEqual(refusedAt, 31, "The 31st attempt in an hour is refused");
    });
  });

  await harness.test("T51-LIMIT-03: five wrong invite codes is still the most, and checking the right one first costs nothing", async () => {
    const saved = { code: process.env.STUDIO_SIGNUP_CODE, env: process.env.APP_ENV };
    process.env.STUDIO_SIGNUP_CODE = "t51-right-code";
    try {
      await withIp("198.51.100.203", async () => {
        for (let i = 0; i < 5; i++) {
          const res = (await onboardStudio(signUpInput(`t51-code-${i}-${run}`, { signupCode: `guess-${i}` }))) as Made;
          harness.assert(res.field === "signupCode", `Guess ${i + 1}: wrong code`, JSON.stringify(res));
        }
        const right = (await onboardStudio(signUpInput(`t51-code-right-${run}`, { signupCode: "t51-right-code" }))) as Made;
        harness.assert(!right.success && /Too many/.test(right.error ?? ""), "After five wrong guesses, even the right code waits", JSON.stringify(right));
      });
      // Going back and forward through step 1 checks the code again each time.
      await withIp("198.51.100.204", async () => {
        for (let i = 0; i < 8; i++) await checkSignupCode("t51-right-code");
        const res = (await onboardStudio(signUpInput(`t51-code-patient-${run}`, { signupCode: "t51-right-code" }))) as Made;
        harness.assert(res.success, "An honest person still gets their studio", JSON.stringify(res));
      });
    } finally {
      if (saved.code === undefined) delete process.env.STUDIO_SIGNUP_CODE;
      else process.env.STUDIO_SIGNUP_CODE = saved.code;
    }
  });
}
