# Every booking gets a gallery — design

Date: 2026-11-14 · Status: approved by the studio owner in conversation

## Why

A studio owner finished editing a client's photos and could not find where to upload them.
Uploads live on a project, but only "big job" categories (weddings, commercial) get a project
automatically; studio portraits, convocation and Raya sessions get none, so there is nowhere to
upload. A second, unrelated path ("Mark delivered" with a pasted Google Drive link) bypasses the
gallery, watermark setting, balance and "photos ready" email.

The owner's rule: **photos are always uploaded here, and every booking gets a gallery.**

## Goals

- Every confirmed booking has a gallery (a project) to upload to, whatever its category.
- From a booking, one obvious button leads to its gallery: **Upload photos**.
- The Projects list is not flooded with small sessions.
- Small sessions get a simple page: files, "Notify client: photos ready", payments.

## Non-goals / anti-goals

- No second gallery system attached to bookings (rejected approach C).
- No delivery by pasted external link any more.
- Not a failure mode we accept: a confirmed booking with nowhere to upload.

## Approaches considered

- **A. Every confirmed booking gets a project automatically — chosen.** Reuses the vault, downloads,
  watermark setting, balance unlock and notification as they are; clients see job progress in
  their account from the day they book. Cost: more projects, handled by labelling them.
- B. Create the project on first upload. Hides progress from the client until delivery and puts a
  creation step on the delivery path.
- C. Gallery directly on the booking. Duplicates every project-keyed delivery feature.

## Design

1. **Kind of job.** Each project is a **Session** or a **Production** (`Project.kind`, `SESSION` |
   `PRODUCTION`). Set when the project is created: from a booking, by its category; from a
   proposal, always Production. Staff can switch it on the project page.
2. **Category setting.** The per-category "auto-create project" switch becomes a
   **Session / Production** choice. Existing answers carry over: categories that auto-created
   projects are Production, the rest Session. (The keyword fallback for categories without a
   setting stays: wedding/commercial/event… → Production.)
3. **Provisioning.** Every path that confirms a booking (card, gateway, QR/cash approval, booking
   created by staff) creates its project, for every category, labelled by kind. "Promote to
   Project" disappears: there is always a project.
4. **Backfill.** Existing confirmed/completed/delivered bookings without a project get one, once,
   labelled from their category.
5. **Projects page.** Tabs: **Productions** (default) · **Sessions** · **All**, with counts.
6. **Booking page.** **Upload photos →** opens the session's project at its files section.
7. **Session page.** A Session's project page shows only: files for the client (with
   "Notify client: photos ready"), and payments/invoices. Call sheets, gear and shot lists are
   Production-only. Stage selector stays.
8. **Retire "Mark delivered" with a link.** "Notify client: photos ready" also marks the linked
   booking Delivered. Bookings that already have a `deliveryUrl` keep showing it to the client
   (read-only); no new links are set.

## Left to the builder

- Exact placement and wording of the Session/Production switch on the project page.
- Where the one-off backfill runs (script vs. lazy on first visit), as long as it is idempotent.
