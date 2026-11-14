# Project page: header, upload, notify — design

Date: 2026-11-14 · Status: approved by the studio owner in conversation ("go with all three")

## Why

The project page's main job is getting finished photos to the client, but it reads like a generic
project form: no shoot date or booking on it, a stage that never moves on its own, a three-step
upload with the browser's bare file picker, and "Notify client" placed above the upload.

## Design

**A. Header that says where the job stands.**
- Shows the shoot date and time, the package, a link to the booking, and payment status
  ("Paid in full" / "RM 150 due"), next to the client's name and contact.
- Sessions show a progress line: Booked → Shot → Editing → Delivered.
  Stages map to the stored status: PRE_PRODUCTION = Booked, PRODUCTION = Shot,
  POST_PRODUCTION = Editing, IN_REVIEW / DELIVERED = Delivered (IN_REVIEW reads "previews sent,
  full files after payment").
- It moves forward on its own, never back: shot once the booking's slot start time has passed or
  the session is marked done; editing on the first upload; delivered on "Notify client"
  (existing). Staff can still set the stage by hand.
- Productions keep the existing stage selector. The rarely used Kind switch moves out of the
  header to a small "Project type" row at the foot of the page.
- New project titles use the category in words ("Convocation"), not its code in capitals.

**B. Drag-and-drop upload.**
- One drop area: "Drop photos here, or browse". Each photo uploads as soon as it is added, one
  request per photo, with its own progress, done or failed state, and a retry for failures.
- The album name is a quiet "Album: Final selects · Change" line. Video stays available as a
  secondary "Add a video" option with its master and review copy.

**C. Notify is the last step.**
- Below the photos: what the client will get ("12 photos · full-resolution downloads" or
  "watermarked previews until the balance is paid"), the client's favourites count and every
  retouch note in full, then the "Notify <first name>" button.
- The bin on each photo stays behind its confirmation.

## Approaches considered

- Stage advance stored on events (upload, session done) plus a "shot" stage derived at read time
  from the slot time, applied on page load — chosen: no background job needed, and the list and
  the page agree.
- A scheduled job that advances stages — rejected: no job runner in the app.
