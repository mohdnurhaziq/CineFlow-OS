# Team, roles, access and shoot assignments: design

Date: 2026-11-16. Status: for approval.

## Why

Today nobody can add a team member: not the studio owner, not the platform administrator. The only
team accounts are the demo data. Every team member also gets the whole admin console except a few
owner-only money and settings tasks, so a studio can't hire a photographer who just shoots and
uploads.

The system will be used by many studios, each with its own way of working, its own job titles and
its own split of tasks. The owner needs to:

- add and remove their own team;
- decide what each kind of team member can do, and change it later;
- give one person extra access now and then ("sometimes a photographer helps me with bookings");
- assign who shoots each booking, so every team member opens the app and sees their own shoots.

## Goals

1. The owner invites team members, gives each a role, and removes them when they leave.
2. Each studio creates its own roles with its own names. A role sets what everyone with it can do.
   Changing a role changes it for everyone who has it.
3. The owner can add extra access for one person on top of their role.
4. Access is set per admin area as None / Only their own / View / Manage, plus separate ticks for the
   powers that move money.
5. The owner assigns one or more team members to each booking, one booking at a time, or several
   ticked bookings at once.
6. A team member's main screen is "My schedule": their assigned sessions, with what they need to do
   the shoot.
7. Team members are emailed when assigned, and when an assigned booking moves or is cancelled.

## Non-goals (this round)

- Assigning by day or time block, or to calendar slots before anyone books.
- Linking the typed crew list on production shoot days to team accounts.
- Handing the owner role to someone else, or a studio with two owners.
- A team member's own availability, leave or working hours.
- Per-record exceptions ("can see this one client only").

## Anti-goals (would be a failure even if it works)

- A team member can ever give themselves, or anyone, more access.
- Removing someone deletes or blanks their past work: galleries, approvals, collected releases.
- Upgrading changes what an existing studio's team can do before the owner touches anything.
- A role or access change only applies after the person signs out and in again.
- A page hides a button but its action still works for someone without access (every check is on
  the server; the menu only mirrors it).

## Approaches considered

1. **Each role's access stored as one record (chosen).** A studio's roles live in a new table; each
   role stores its access as one small map ("bookings: MANAGE, galleries: OWN, approvePayments:
   false"). A person stores their extras the same way. One shared function combines them and every
   action, page and menu asks it. Adding an area later is one line, not a database change.
2. **One row per permission.** The textbook permissions table. Same result with more tables and
   code; it only pays off for cross-studio queries nobody needs.
3. **Fixed roles with switches.** Rejected: studios couldn't name their own roles or shape them.

The owner picked 1. Assignments have one sensible design: a link table between bookings and team
members.

## Decisions made with the owner

- Access is set on the role, with extra access per person on top (option 3 in conversation).
- Roles are each studio's own; none are fixed.
- Assignment is per booking, one at a time ("more flexible"), not by day or slot.
- A team member with limited access sees only their assigned shoots and the work for them.

## The design

### Account types and roles

- `User.role` keeps meaning the account type: `SUPER_ADMIN`, `STUDIO_OWNER`, `CLIENT`, or team. New
  team members get a single team account type (builder's call on the value; it must be in
  `STAFF_ROLES`). The existing `PHOTOGRAPHER`, `VIDEOGRAPHER` and `CREW` values stay valid team types.
- New `TeamRole` (per studio): name, the access map, sort order. Names are unique within a studio.
- `User` gains: `teamRoleId` (team members only), `extraAccess` (the same map shape, extras only),
  `deactivatedAt`.
- The owner and the platform super-admin always have everything; access settings never apply to them.

### Access areas and levels

| Area | Levels | What it covers |
|---|---|---|
| Bookings & Calendar | None / Only their own / View / Manage | Bookings list and details, Calendar and slots, booking for a customer, moving, marking done, cancelling unpaid bookings |
| Galleries & photos | None / Only their own / View / Manage | Galleries list and pages, uploading, removing photos, notifying the client, ordering prints for a client |
| Shoot days & gear | None / View / Manage | Shoot days, call sheets, shot lists, releases, Gear & Fleet |
| Print orders | None / View / Manage | Print orders and their statuses |
| Clients | None / View / Manage | Client directory, contact edits, studio notes, CSV export |
| Proposals | None / View / Manage | Proposals and the add-on catalogue (sending a proposal needs Set prices) |
| Invoices | None / View / Manage | Invoices list and pages; Manage = send payment reminders |
| Services | None / View / Manage | Categories (create, edit, switch on or off), featuring packages; View = see packages and prices |
| Catalog & website | None / View / Manage | Frames & prints, mat price, shipping zones, Showcase |

Separate ticks for anything that moves or sets money (off unless given):

- **Approve or reject payments**: the Verification queue. Gives access to that page even without
  Invoices: View.
- **Record or cancel payments**: record a payment, cancel an invoice, book a customer as already
  paid, cancel a booking whose deposit is paid, cancel a print order that has a payment.
- **Set prices**: create, edit or delete packages; set a slot's fee or deposit; delete a category;
  send a proposal; create an invoice.

These three ticks are exactly today's owner-only money tasks, so a role with Manage on every area
and no ticks is exactly today's team access.

Owner only, never grantable: **Team & roles** and **Studio settings** (Studio, Getting paid, Photo
delivery, Plan). The Manual and My schedule are open to every team member.

Combining a role and extras: for each area the higher level wins; a tick is on if either has it.

"Only their own" means full work on their own items and nothing else:

- Bookings: the bookings they are assigned to (view, mark done or no-show). No Calendar, no other
  bookings, no creating or moving.
- Galleries: galleries of bookings they are assigned to, and galleries where they are the studio
  lead (view, upload, notify the client). Nothing else.

Where a page mixes areas, each part follows its own area (e.g. the Overview shows only the tiles the
person may see; a booking's deposit and invoices show only with Invoices: View).

Pages outside `/admin` that the team opens (a client's gallery, a proposal, a call sheet, release
forms) follow the same areas: Galleries for the gallery (Only their own: their galleries), Proposals
for a proposal, Shoot days & gear for call sheets and releases.

Assigning people to bookings needs Bookings & Calendar: Manage.

### Starter roles

When a studio's roles are first set up:

- Studios that already have team members: each existing title becomes a role ("Photographer",
  "Videographer", "Crew") with **today's access**: Manage on every area, all three money ticks off.
  Every existing member is linked to the role matching their title. Nothing changes for them.
- Studios with no team members get starter roles they can rename, change or delete:
  - Photographer: Bookings Only their own, Galleries Only their own, Shoot days & gear View.
  - Videographer: same as Photographer.
  - Crew: Bookings Only their own, Shoot days & gear View.
  - Front desk: Bookings Manage, Clients Manage, Galleries View, Print orders Manage, Invoices View.

A role in use can't be deleted until its members are moved to another role.

### Team screen (Settings → Team, owner only)

```
Team                                                    [ Invite team member ]
  Aina Rahman     aina@…     Photographer  + Bookings   Active     Edit · Remove
  Daniel Lee      daniel@…   Crew                       Invited    Resend link · Edit · Remove
  Sarah Tan       sarah@…    Front desk                 Removed    Bring back

Roles                                                   [ New role ]
  Photographer    3 people   Bookings: Only their own · Galleries: Only their own · Shoot days: View   Edit
```

- **Invite:** name, email, role, and optional extras. The person is emailed a link to set their
  password (valid 30 days, reusing the existing invite token). The link is also shown on screen to
  copy, for WhatsApp, and when email isn't set up. Status shows Invited until they set a password;
  "Resend link" issues a new one.
- One email can be a team member at several studios (separate accounts), but can't be a client and
  a team member at the same studio; inviting a client's email is refused with a clear message.
- **Edit:** change name, role and extras. Takes effect on their next page load.
- **Remove:** they can't sign in, and any signed-in session ends at once (`sessionsValidAfter`). Their
  name stays on past records. Upcoming bookings assigned to them lose that assignment and show as
  unassigned. **Bring back** restores sign-in (not past assignments).
- The owner's own row is shown, can't be removed or limited.
- The role editor shows every area with its levels and the two money ticks, in plain words, plus how
  many people the change will affect.

### Assigning shoots

- New `BookingAssignment`: booking, team member, who assigned them, when. A booking can have several.
- **Booking Details** gets a Team section: add or remove people (team members who are active).
- **Bookings list** gets a Team column, an "Unassigned" filter, and tick-several → "Assign" for
  assigning one person to many bookings at once (each booking still holds its own assignment).
- **Overview** flags upcoming confirmed bookings with nobody assigned (for those with Bookings: View
  or Manage).
- No clash check is needed between a person's bookings: a studio's slots can't overlap.
- Cancelled bookings keep their assignment for the record but leave "My schedule". Moved bookings
  keep their assignment.

### My schedule

A page in the admin console for every team member, and where team members land after signing in
(the owner still lands on Overview). It lists their assigned sessions from today onwards, grouped by
day: time, client name and phone (tap to call or WhatsApp), category and package, the client's
brief, the booking's notes, and a link to the gallery when they have access to it. Past sessions
are one tap away.

### Emails

Using the existing notification system. An email that can't be sent (email not set up, or the
provider refuses) never blocks the action; the screen says so, as it does for clients today. To
the team member:

- **Invited** to the studio, with the set-password link.
- **Assigned** to a booking: date, time, client, package, brief.
- **Changed:** an assigned booking moved (old and new time) or was cancelled.
- **Unassigned** when removed from a booking.

### Enforcement

- One server-side check, e.g. `requireAccess(tenantId, area, level)` and
  `requireAccessTick(tenantId, tick)`, replaces the ~80 `requireStaff` / `requireOwner` calls across
  20 files, each mapped to its area. Access is read from the database on every call, never from the
  session cookie.
- "Only their own" is enforced inside the actions and queries (a list query filters to assigned
  bookings; a single-record action refuses another person's record), not only in the menu.
- Pages under `/admin` check access for their area and show a plain "You don't have access to this"
  page otherwise. The admin menu hides areas the person can't open.
- Sign-in refuses removed accounts with a plain message.

### Manual

- New page "Team, roles and assigning shoots".
- Rewrite the "who can do what" tables (Bookings, Payments, Settings and your team, Services) to
  say "the owner, and anyone given …" instead of "owner only". Remove the claim that team accounts
  are created by the platform administrator.

## Constraints

- Next.js App Router, Prisma, SQLite; schema changes reach Docker through `prisma db push` on start.
  The starter-role setup must therefore happen in code (idempotently, the first time a studio's
  access is read or its Team screen opens), not in a one-off migration.
- No browser `confirm()` dialogs; use the existing confirm dialog.
- Keep the existing header rule: admin pages use the admin bar.
- Every new rule gets an e2e test; the access mapping gets a test that fails if an admin action has
  no access check.

## Build order

1. **Team, roles and access**: models, starter-role setup, the shared check, replacing every
   existing check, menu and page gating, Team screen, invite and remove, sign-in refusal, manual.
   Usable on its own: today's team keeps today's access.
2. **Assigning shoots**: assignments, Booking Details Team section, Bookings list column, filter and
   bulk assign, Overview flag, My schedule, "Only their own" levels, emails, manual.

## Calls made while writing this (for the owner to check)

- Price-setting is its own tick ("Set prices"), separate from the two payment ticks, so existing
  team members keep exactly today's access on upgrade.
- Deleting a category sits under "Set prices", because today only the owner can do it.
- New team members land on My schedule after signing in; the owner still lands on Overview.
- A removed person who is brought back gets sign-in back, but not their old assignments.
- Starter roles for new studios (Photographer, Videographer, Crew, Front desk) and their defaults.

## Left to the builder

- The value for the new team account type, and the exact shape of the access map.
- Page and component structure, and the Team screen's exact layout within the existing Settings
  style.
- Wording of emails and empty states, in the app's plain-language style.
