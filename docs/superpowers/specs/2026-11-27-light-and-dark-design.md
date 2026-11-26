# Light and dark mode

Approach and defaults agreed in chat on 27 November 2026. Status: waiting for approval.

## Intent
CineFlow only has a dark design. Add a light one, so that:
- a studio can choose how its own website looks, as part of its brand;
- people who work in CineFlow can choose what is comfortable to read.

The owner did not give a particular trigger (a request from a studio or client, daylight reading).

## Goals
- Two complete themes, both readable, on phone and desktop.
- Nothing changes for anyone until they choose: studio websites and signed-in screens stay dark.
- Colour names that say what a colour is for, so new screens work in both themes by default.

## Not doing
- No theme switch for visitors on a studio's website.
- No custom colours or extra themes beyond the studio's accent colour that exists today.
- No layout or wording redesign. Emails are unchanged. No light version of the landing page.
- No theme question in the studio sign-up wizard.

## Anti-goals (it has failed if)
- dark mode looks noticeably different from today;
- any text, button or field is unreadable in either theme;
- a page flashes the wrong theme while loading;
- an invoice prints dark, or a signature, logo or QR code becomes hard to see.

## Who decides the theme
| Pages | Theme |
|---|---|
| Studio's public pages: its home page, booking, checkout and payment return, find my booking, wall-art preview | **Studio's website theme** |
| Studio's sign-in, register, forgot and reset password | Studio's website theme |
| Links a studio sends: proposal, release form, gallery vault, on-set call sheet | Studio's website theme |
| Studio admin (all of it) and the client portal (`/account`) | **The person's choice** |
| CineFlow sign-in, "Your studios", studio sign-up, Privacy, Terms, super-admin | The person's choice |
| CineFlow's main landing page `/` | Always dark |
| "Page not found" and the last-resort error page | Always dark |

- **Studio website theme:** `Dark` (default, including every existing studio) or `Light`. Set in
  Admin → Settings → Studio, next to the accent colour, by whoever may change studio settings. The setting
  shows a small preview with the studio's logo and accent colour on the chosen theme.
- **Person's choice:** `Dark` (default), `Light` or `Match my device`. Remembered in that browser, not on
  the account. With studios on their own subdomains, one choice covers CineFlow and every studio
  subdomain (a studio's own domain remembers its own).
- **Where to change it:** the account menu in the admin and client portal; a control in the footer of
  CineFlow's own pages, for people who aren't signed in (not shown on the landing page, which stays dark).

## What stays as it is in both themes
- Photo and video viewers (lightboxes, video player, reel) and the wall-art room scenes: dark surroundings.
- Text and buttons drawn on top of photos or video keep the colours that read on the picture.
- Invoices and receipts are white paper. QR codes sit on white.
- Signature boxes, and saved signatures where they are shown, keep a dark background. Signatures are saved
  as amber ink on nothing, which is faint on white, and signed ones must not be altered.
- Printing looks as it does today.

## Approaches considered
- **A. Redefine the existing colours in light mode:** the least editing, but the names then lie
  ("white" would mean dark text), exceptions pile up, and every new screen must know the trick.
- **B. Name colours by what they are for (chosen):** page, card, raised surface, main and muted text,
  border, and so on, each with a dark and a light value. More editing now; honest and easy to keep.
  It also settles the colour part of audit item B5.
- **C. A second `dark:` colour beside every colour:** thousands of pairs, easy to miss. Rejected.

## How it must behave
- The theme covers the whole page: pop-ups, dialogs, drop-down lists, date pickers, scrollbars, toast
  messages, the staging bar and the phone's browser bar colour.
- The first paint is already in the right theme, including `Match my device`. Moving between areas with
  different themes (a studio's website to the admin) switches without a reload.
- Accent colours: amber, green, red and blue text get darker shades on light backgrounds. A studio's accent
  colour, whatever it picked, stays readable: where it is used for text, or has text on it, the shade or
  the text colour adjusts. The studio's saved colour is never changed.
- A studio logo is shown as uploaded. A white logo can vanish on a light page, so the setting's preview is
  where the owner sees that before choosing; it says so.

## Order of work
1. **Move to colour names, dark only.** No switch yet. Very close shades of the same dark (for example
   `#15151a` and `#16161b`) become one. Proof: screenshots of the main pages before and after, phone and
   desktop, compared; any difference that can be seen is listed for the owner.
2. **Add the light values and both settings.** One new field on the studio (the website theme, default
   dark). The only database change, and it only adds.
3. **Check each area in both themes,** phone and desktop: public studio pages, booking and checkout,
   client portal, admin by section, CineFlow pages, super-admin.

Each step is finished and checked before the next.

## How we know it works
- A test refuses raw greys, black, white and hex colours in screens, except in the places listed under
  "What stays as it is", the landing page and the invoice.
- A test measures contrast for every text-on-surface pair in both themes: at least 4.5:1 for normal text.
  The same measure covers the five accent presets and awkward custom accents (very light, very dark).
- Tests cover which theme each kind of page gets, the defaults, who may change the studio's theme, and
  remembering a person's choice.
- A browser pass over every page in both themes at phone and desktop width, with screenshots.

## Delivery
Built on a separate branch, so fixes to the live site can still be released from `main` meanwhile. It is
checked locally, then on staging (pointed at the branch for the test), then merged and released to the
live site. Nothing is committed, pushed or deployed without the owner's say-so.

## Left to the builder
The names and values of the colours, how the theme is put on the page, how the choice is stored in the
browser, the exact look of the switch and the preview, and how the area-by-area work is split.
