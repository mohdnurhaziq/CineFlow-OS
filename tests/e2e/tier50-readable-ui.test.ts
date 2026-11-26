/**
 * Tier 50: readable and consistent (audit A2, A3 and B1)
 * - Money is written one way, through lib/money: "RM 1,900.00", on screens, in emails and in the PDF
 * - Dialogs close with one shared button: named "Close", 44px
 * - Muted text is light enough to read on the dark theme (and dark enough on the white invoice),
 *   and nothing is smaller than 11px
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TestHarness } from "./test-harness";
import { provideReactGlobal } from "./react-tree";
import { formatMoney, currencySymbol } from "@/lib/money";
import { priceLabel } from "@/components/visualizer/cart";
import { sendNotification } from "@/lib/notifications";
import { DialogCloseButton } from "@/components/ui/dialog-close-button";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const slash = (p: string) => p.split(path.sep).join("/");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(p) ? [slash(p)] : [];
  });
}
const ALL = () => ["app", "components", "lib"].flatMap(sources);

/** Every line matching `re`, as "file:line". */
function lines(files: string[], re: RegExp): string[] {
  return files.flatMap((f) => read(f).split("\n").flatMap((l, i) => (re.test(l) ? [`${f}:${i + 1}`] : [])));
}

/** Every <button> whose only content is an X, with its opening tag. */
function xOnlyButtons(): { at: string; open: string }[] {
  const found: { at: string; open: string }[] = [];
  for (const f of ALL().filter((p) => p.endsWith(".tsx"))) {
    const s = read(f);
    const re = /<(button|Button)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      let i = m.index + m[0].length;
      let depth = 0;
      for (; i < s.length; i++) {
        if (s[i] === "{") depth++;
        else if (s[i] === "}") depth--;
        else if (s[i] === ">" && depth === 0) break;
      }
      const open = s.slice(m.index, i + 1);
      if (open.endsWith("/>")) continue;
      const inner = s.slice(i + 1, s.indexOf(`</${m[1]}>`, i)).trim();
      if (/^(<(X|XIcon)\b[^>]*\/>|×|&times;|✕|✖)$/.test(inner)) found.push({ at: `${f}:${s.slice(0, m.index).split("\n").length}`, open });
    }
  }
  return found;
}

export async function runTier50ReadableUiTests(harness: TestHarness) {
  harness.setSuite("Tier 50", "Readable and consistent");
  await provideReactGlobal();

  // ── B1: money ───────────────────────────────────────────────────────────────────────────
  await harness.test("T50-MONEY-01: one way to write money, from a currency code or its symbol", async () => {
    harness.assertEqual(formatMoney("MYR", 1900), "RM 1,900.00", "Ringgit");
    harness.assertEqual(formatMoney("RM", 150), "RM 150.00", "Given the symbol, the same");
    harness.assertEqual(formatMoney("USD", 5), "$5.00", "Dollars");
    harness.assertEqual(formatMoney("$", 5), "$5.00", "…from the symbol too");
    harness.assertEqual(formatMoney("SGD", 5.5), "SGD 5.50", "Anything else keeps its code");
    harness.assertEqual(formatMoney("MYR", -50), "-RM 50.00", "The minus comes first");
    harness.assertEqual(formatMoney("MYR", -0.001), "RM 0.00", "No minus zero");
    harness.assertEqual(currencySymbol("MYR"), "RM", "The symbol on its own");
  });

  await harness.test("T50-MONEY-02: the print cart and the payment email write it the same way", async () => {
    harness.assertEqual(priceLabel({ kind: "PAID" } as never, { lineAmount: 1200, upgradeAmount: 0 } as never, "RM"), "RM 1,200.00", "Print cart");
    harness.assertEqual(priceLabel({ kind: "INCLUDED" } as never, { lineAmount: 0, upgradeAmount: 20 } as never, "RM"), "Upgrade +RM 20.00", "Upgrade");
    const mail = await sendNotification(
      { event: "PAYMENT_APPROVED", studioName: "S", studioSlug: "s", clientName: "C", clientEmail: "c@example.test", invoiceNumber: "INV-1", amount: 1200, currency: "MYR", projectTitle: "P", milestoneType: "BOOKING_DEPOSIT" } as never,
      "EMAIL"
    );
    harness.assert(mail.emailSubject.includes("RM 1,200.00"), "Subject", mail.emailSubject);
    harness.assert(!/MYR ?1,?200/.test(`${mail.emailHtml}${mail.emailText}${mail.whatsappMessage ?? ""}`), "No other spelling anywhere in it");
  });

  await harness.test("T50-MONEY-03: no screen, email or PDF builds money by hand", async () => {
    const files = ALL().filter((f) => f !== "lib/money.ts");
    harness.assertDeepEqual(lines(files, /=== ?"MYR" ?\? ?"RM/), [], "No home-made RM-or-dollar");
    harness.assertDeepEqual(lines(files, /formatCurrency|style: "currency"/), [], "No second money formatter");
    harness.assertDeepEqual(lines(files, /\.toLocaleString\([^)]*(minimum|maximum)FractionDigits|(minimum|maximum)FractionDigits: \d,?$/), [], "No hand-set decimals");
    harness.assertDeepEqual(lines(files, /\.(amount|depositAmount|totalPrice|depositRequired)\.toFixed\(2\)|\{(currency|doc\.currency)\} \{|\$\{(currency|doc\.currency|payload\.currency|due\.currency)\} /), [], "No currency glued to a number");
    // The one bare toLocaleString left on amounts has no decimals to give it away.
    harness.assertDeepEqual(lines(files, /\b(price|amount|deposit\w*|total\w*|\w+Price|\w+Revenue|\w+Amount)\.toLocaleString\(/i), [], "No bare amount.toLocaleString()");
  });

  // ── A3: closing dialogs ─────────────────────────────────────────────────────────────────
  await harness.test("T50-CLOSE-01: the shared close button is named, 44px, and never submits a form", async () => {
    const html = renderToStaticMarkup(createElement(DialogCloseButton, { onClick: () => undefined }));
    harness.assert(html.includes('aria-label="Close"') && html.includes('title="Close"'), "Named for screen readers and on hover", html);
    harness.assert(/\bsize-11\b/.test(html), "44px", html);
    harness.assert(html.includes('type="button"'), "Doesn't submit the form it sits in", html);
    const named = renderToStaticMarkup(createElement(DialogCloseButton, { onClick: () => undefined, label: "Close video", disabled: true }));
    harness.assert(named.includes('aria-label="Close video"') && named.includes("disabled"), "Can be named more exactly, and switched off", named);
  });

  await harness.test("T50-CLOSE-02: no X button is nameless, and every dialog's X is the shared one", async () => {
    const raw = xOnlyButtons().filter((b) => !b.at.startsWith("components/ui/dialog-close-button"));
    harness.assertDeepEqual(raw.filter((b) => !/aria-label=/.test(b.open)).map((b) => b.at), [], "Every X says what it does");
    const closers = raw.filter((b) => /onClick=\{(onClose|handleClose|close)\}|onClose\(\)|onOpenChange\(false\)|setOpen\(false\)|setIsOpen\(false\)|aria-label="Close/.test(b.open));
    harness.assertDeepEqual(closers.map((b) => b.at), [], "Closing a dialog goes through DialogCloseButton");
    // The few X buttons that remove or dismiss something else still need a finger-sized target.
    harness.assertDeepEqual(raw.filter((b) => !/\b(size-10|size-11|min-h-11|min-h-10|p-3)\b/.test(b.open)).map((b) => b.at), [], "At least 40px");
  });

  // ── A2: faint text ──────────────────────────────────────────────────────────────────────
  await harness.test("T50-TEXT-01: muted text on the dark theme is at least zinc-400", async () => {
    const dark = ALL().filter((f) => f !== "components/invoices/invoice-document.tsx");
    const faint = dark.flatMap((f) =>
      read(f).split("\n").flatMap((l, i) => {
        // A control that can't be used may look switched off; accessibility rules allow that.
        const rest = l.replace(/"[^"\n]*cursor-not-allowed[^"\n]*"/g, (cls) => cls.replace(/text-zinc-600/g, ""));
        return /(text|placeholder)-zinc-(500|600|700)\b/.test(rest) ? [`${f}:${i + 1}`] : [];
      })
    );
    harness.assertDeepEqual(faint, [], "No grey too faint to read");
    harness.assert(read("components/ui/date-picker.tsx").includes('"text-zinc-600 cursor-not-allowed"'), "A day that can't be picked still looks it");
  });

  await harness.test("T50-TEXT-02: on the white invoice, grey text is dark enough", async () => {
    harness.assertDeepEqual(lines(["components/invoices/invoice-document.tsx"], /text-zinc-(300|400)\b/), [], "No pale grey on paper");
  });

  await harness.test("T50-PHONE-01: the Services filters fit a phone", async () => {
    const s = read("components/admin/services/services-dashboard.tsx");
    harness.assert(/<div className="flex flex-wrap items-center gap-2">\s*<select/.test(s), "The two filters can wrap");
    harness.assertEqual((s.match(/className="min-w-0 flex-1 sm:flex-none px-3 py-2 rounded-xl/g) ?? []).length, 2, "…and shrink to the screen");
  });

  await harness.test("T50-PHONE-02: on a phone the slot list breaks lines only between a time's start and end", async () => {
    const s = read("components/admin/calendar/slot-table.tsx");
    harness.assert(s.includes('<div className="font-bold text-white text-xs whitespace-nowrap">{dateStr}</div>'), "The date stays whole");
    harness.assert(s.includes('<span className="whitespace-nowrap">{slot.startTime} –</span>') && s.includes('<span className="whitespace-nowrap">{slot.endTime}</span>'), "Each time stays whole, and the end can go under the start, clear of the pinned buttons");
    harness.assert(s.includes('<td className="px-4 py-3 font-sans whitespace-nowrap">'), "The category stays whole");
  });

  await harness.test("T50-PHONE-03: the client portal label stays on one line in a phone's header", async () => {
    const s = read("components/account/client-account-header.tsx");
    harness.assert(/uppercase whitespace-nowrap tracking-normal sm:tracking-widest">\s*Client portal/.test(s), "One line, with tighter letter spacing on a phone");
  });

  await harness.test("T50-PHONE-04: the gear list doesn't break codes and serial numbers apart", async () => {
    harness.assert(read("components/gear/gear-dashboard.tsx").includes('<td className="py-3.5 px-3 font-mono text-zinc-300 whitespace-nowrap">'), "One line each");
  });

  await harness.test("T50-TEXT-03: nothing is smaller than 11px, and emails use readable grey", async () => {
    harness.assertDeepEqual(lines(ALL(), /text-\[([0-9]|10)(\.\d+)?px\]/), [], "No 8, 9 or 10px text");
    harness.assertDeepEqual(lines(["lib/notifications.ts"], /color: #(71717a|52525b)/), [], "No faint grey in emails");
  });
}
