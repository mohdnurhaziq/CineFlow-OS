import type { Metadata } from "next";
import { Compass } from "lucide-react";
import {
  B,
  ManualCallout,
  ManualLink,
  ManualList,
  ManualP,
  ManualPage,
  ManualQa,
  ManualSection,
  ManualSteps,
  ManualTable,
  Ui,
} from "@/components/admin/manual/manual-ui";
import { studioPath } from "@/lib/domain-name";

interface GettingStartedManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Start here | Manual | Studio Admin",
  description: "How the whole system fits together: the client's journey, the admin menu, and a daily routine.",
};

const SECTIONS = [
  { id: "in-short", title: "In short" },
  { id: "three-parts", title: "The three parts of the system" },
  { id: "journey", title: "A client's journey, start to finish" },
  { id: "menu", title: "The admin menu" },
  { id: "setup", title: "Setting up a new studio" },
  { id: "daily", title: "A daily routine" },
  { id: "principles", title: "Five things to remember" },
  { id: "questions", title: "Common questions" },
];

/** Manual → Start here. The overview every other manual page hangs from. */
export default async function GettingStartedManualPage({ params }: GettingStartedManualPageProps) {
  const { tenantSlug } = await params;
  const admin = studioPath(tenantSlug, "/admin");
  const manual = `${admin}/manual`;

  return (
    <ManualPage
      tenantSlug={tenantSlug}
      icon={Compass}
      area="Start here"
      title="Start here: how the system fits together"
      description="The whole system on one page: what a client goes through, where each job is done in the admin console, and what to check every day."
      sections={SECTIONS}
    >
      <ManualSection id="in-short" title="In short">
        <ManualList
          items={[
            <>
              The system runs your studio from the first enquiry to the framed print on the client&apos;s wall:{" "}
              <B>booking, payment, the shoot, photo delivery and print orders</B>.
            </>,
            <>
              Clients do most of the work themselves online. Your team steps in at a few fixed points: opening times, checking
              payments, uploading photos and fulfilling orders.
            </>,
            <>
              <B>Payment drives everything.</B> A paid deposit confirms a booking. A paid balance releases the photos and opens
              print ordering.
            </>,
            <>This manual is for your team only. Clients never see it.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="three-parts" title="The three parts of the system">
        <ManualTable
          head={["Part", "Who uses it", "What it is for"]}
          rows={[
            [
              "Your studio website",
              "Anyone",
              "Your public page: your work, your packages, a wall art preview and the button to book a session.",
            ],
            [
              "The client account",
              "Clients, after signing in",
              "Their bookings, invoices, proposals, photo galleries and print orders.",
            ],
            [
              "The admin console",
              "Your team, after signing in",
              "Everything on this page. It is where you are now.",
            ],
          ]}
        />
        <ManualP>
          Team members and clients sign in on the same page. The system sends each person to the right place: your team to the
          admin console, clients to their account. The owner invites team members from Settings → Team; see{" "}
          <ManualLink href={`${manual}/team`}>Team, roles and assigning shoots</ManualLink>.
        </ManualP>
      </ManualSection>

      <ManualSection id="journey" title="A client's journey, start to finish">
        <ManualSteps
          items={[
            <>
              <B>They find you.</B> The client opens your studio website and looks at your work and packages.
            </>,
            <>
              <B>They book.</B> They pick an open time, choose a package, create an account and pay the deposit. The time they
              picked is reserved for them while they do this. See <ManualLink href={`${manual}/bookings`}>Bookings</ManualLink> and{" "}
              <ManualLink href={`${manual}/slot-hold`}>Slot holds</ManualLink>.
            </>,
            <>
              <B>The deposit is confirmed.</B> Online payments confirm themselves. A bank transfer or cash payment is approved in Verification by
              the owner or a team member given <Ui>Approve or reject payments</Ui>. The booking is now confirmed and its gallery is created. See{" "}
              <ManualLink href={`${manual}/payments`}>Payments</ManualLink>.
            </>,
            <>
              <B>The session happens.</B> You mark it done. For larger productions you plan shoot days, crew and gear first. See{" "}
              <ManualLink href={`${manual}/production`}>Shoot days, crew and gear</ManualLink>.
            </>,
            <>
              <B>You deliver the photos.</B> You upload them to the gallery and notify the client. They see previews, mark
              favourites and ask for retouches. See <ManualLink href={`${manual}/galleries`}>Galleries</ManualLink>.
            </>,
            <>
              <B>They pay the balance.</B> The full-resolution files unlock for download.
            </>,
            <>
              <B>They order framed prints.</B> From their own photos, including any prints their package includes. You produce and
              hand over the order. See <ManualLink href={`${manual}/prints`}>Framed prints</ManualLink>.
            </>,
          ]}
        />
        <ManualP>
          A larger job can start differently: you send a <B>proposal</B>, the client signs it online, and a production begins with a
          retainer instead of a booking deposit. See{" "}
          <ManualLink href={`${manual}/clients-and-proposals`}>Clients and proposals</ManualLink>.
        </ManualP>
      </ManualSection>

      <ManualSection id="menu" title="The admin menu">
        <ManualTable
          head={["Menu", "Page", "What you do there"]}
          rows={[
            [
              <Ui key="o">Overview</Ui>,
              "",
              "See money received and waiting, upcoming shoot days, open proposals and gear at a glance.",
            ],
            [<Ui key="ms">My schedule</Ui>, "", "Your own upcoming sessions, with the client's contact details and brief. Everyone on the team sees it, and team members land here after signing in."],
            [<Ui key="c">Clients</Ui>, "", "Look up a client, their bookings, galleries and balance, and keep private notes."],
            [
              <Ui key="p">Production</Ui>,
              "Galleries",
              "Upload and deliver photos. Plan shoot days for productions.",
            ],
            ["", "Bookings", "See every booking, book for a customer, move or cancel a booking."],
            ["", "Print orders", "Fulfil framed print orders."],
            ["", "Calendar", "Open, block and manage the times clients can book."],
            ["", "Gear & Fleet", "Track equipment, kits, reservations and checks."],
            [<Ui key="f">Finance</Ui>, "Invoices", "See and manage every invoice."],
            ["", "Verification", "Approve or reject bank-transfer and cash payments."],
            ["", "Proposals", "Send quotes for larger jobs and manage optional extras."],
            [
              <Ui key="cat">Catalog &amp; CMS</Ui>,
              "Services",
              "Your packages, prices and categories.",
            ],
            ["", "Frames & Prints", "The print sizes and frames you sell."],
            ["", "Showcase CMS", "The work shown on your studio website."],
            [<Ui key="s">Settings</Ui>, "", "Your studio's name, address, look, payment details and delivery options."],
            [<Ui key="m">Manual</Ui>, "", "These pages."],
          ]}
        />
        <ManualList
          items={[
            <>
              A <B>number on a menu</B> means something is waiting for you: payments to verify under Finance, new print orders under
              Production.
            </>,
            <>
              <Ui>View studio website</Ui> at the top right opens your public page, so you can see what clients see.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="setup" title="Setting up a new studio">
        <ManualP>
          The <ManualLink href={admin}>Overview</ManualLink> shows a guide called <Ui>Get your studio ready</Ui> until setup is
          finished. Each step ticks itself off when it is done:
        </ManualP>
        <ManualSteps
          items={[
            <>
              <B>Brand your studio.</B> Add your logo and accent colour in{" "}
              <ManualLink href={`${admin}/settings`}>Settings</ManualLink>.
            </>,
            <>
              <B>Add your first service and price.</B> Create a category and a package in{" "}
              <ManualLink href={`${admin}/services`}>Services</ManualLink>.
            </>,
            <>
              <B>Open your booking times.</B> Add slots in the <ManualLink href={`${admin}/calendar`}>Calendar</ManualLink>.
            </>,
            <>
              <B>Set up how clients pay you.</B> Add a QR code, bank details or online payments in{" "}
              <ManualLink href={`${admin}/settings?tab=payments`}>Settings → Getting paid</ManualLink>.
            </>,
            <>
              <B>Show your best work.</B> Add a few projects in <ManualLink href={`${admin}/cms`}>Showcase CMS</ManualLink>.
            </>,
            <>
              <B>Share your booking page.</B> Copy the link from the guide and send it to clients.
            </>,
          ]}
        />
        <ManualP>
          <Ui>Take the tour</Ui> on the same guide walks you through the admin console screen by screen. The setup and settings are
          explained in <ManualLink href={`${manual}/services-and-website`}>Services and your website</ManualLink> and{" "}
          <ManualLink href={`${manual}/settings-and-team`}>Settings and your team</ManualLink>.
        </ManualP>
      </ManualSection>

      <ManualSection id="daily" title="A daily routine">
        <ManualTable
          head={["When", "Check", "Why"]}
          rows={[
            [
              "Every morning",
              <>
                <ManualLink href={`${admin}/verification`}>Verification</ManualLink>
              </>,
              "Approve or reject waiting payments. Each one is a client waiting and a slot nobody else can book.",
            ],
            [
              "Every morning",
              <>
                <ManualLink href={`${admin}/bookings`}>Bookings</ManualLink>, under Upcoming
              </>,
              "Know today's and tomorrow's sessions, and read each client's brief.",
            ],
            [
              "Every morning",
              <>
                <ManualLink href={`${admin}/bookings`}>Bookings</ManualLink> → Unassigned
              </>,
              "Assign who shoots each booking. The Overview also tells you how many upcoming bookings have nobody assigned.",
            ],
            [
              "After each session",
              "The booking",
              "Mark the session done, or record a no-show.",
            ],
            [
              "When editing is finished",
              <>
                <ManualLink href={`${admin}/projects`}>Galleries</ManualLink>
              </>,
              "Upload the photos and notify the client.",
            ],
            [
              "Every day",
              <>
                <ManualLink href={`${admin}/print-orders`}>Print orders</ManualLink>
              </>,
              "Start new orders and move the others to their next step.",
            ],
            [
              "Every week",
              <>
                <ManualLink href={`${admin}/calendar`}>Calendar</ManualLink> and{" "}
                <ManualLink href={`${admin}/invoices`}>Invoices</ManualLink>
              </>,
              "Open times for the coming weeks, and send reminders for unpaid balances.",
            ],
          ]}
        />
      </ManualSection>

      <ManualSection id="principles" title="Five things to remember">
        <ManualList
          items={[
            <>
              <B>Record everything in the system.</B> A booking, payment or order kept only in a chat can&apos;t protect you from
              double bookings or missed work.
            </>,
            <>
              <B>Approve a payment only when the money has arrived.</B> Approval confirms bookings and unlocks photos, and
              can&apos;t be undone here.
            </>,
            <>
              <B>The system doesn&apos;t refund.</B> It records what is owed back; you send the money yourself.
            </>,
            <>
              <B>Let the timers work.</B> Unfinished bookings and unpaid deposits are released automatically. You rarely need to
              step in.
            </>,
            <>
              <B>Money decisions are given on purpose.</B> Approving payments, setting prices and cancelling paid bookings need a tick the owner gives
              each person. Settings and the team itself stay with the owner.
            </>,
          ]}
        />
        <ManualCallout title="Where to find an answer">
          Each manual page ends with common questions. If a screen behaves in a way you don&apos;t expect, look up its page from the{" "}
          <ManualLink href={manual}>Manual</ManualLink> front page first.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="questions" title="Common questions">
        <div className="space-y-5">
          <ManualQa question="Do clients need an account?">
            <p>
              Yes, to book online, pay, see their photos and order prints. Creating one is part of booking, so it is not an extra
              step for them. A customer you book by hand gets an account they can claim later with the same email.
            </p>
          </ManualQa>
          <ManualQa question="Can the team use the system on a phone?">
            <p>
              Yes. The admin console is built to work on a phone or tablet. The on-set call sheet and shot list are made for it,
              with large buttons.
            </p>
          </ManualQa>
          <ManualQa question="What does the client get by email?">
            <p>
              A booking confirmation, payment approvals and rejections, changes to their booking, a notice when their photos are
              ready, and updates on print orders. Emails only go out when email is set up for your studio.
            </p>
          </ManualQa>
          <ManualQa question="Is anything deleted automatically?">
            <p>
              No client data is. The system only releases things that were never completed: a time a client selected and left, and
              a booking whose deposit was never paid.
            </p>
          </ManualQa>
        </div>
      </ManualSection>
    </ManualPage>
  );
}
