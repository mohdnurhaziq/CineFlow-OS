import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
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
import { DEPOSIT_HOLD_HOURS } from "@/lib/bookings/expiry";
import { BALANCE_DUE_AFTER_SESSION_DAYS } from "@/lib/bookings/billing";

interface BookingsManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Bookings and the Calendar | Manual | Studio Admin",
  description: "Opening times for clients, taking bookings, and looking after a booking until the session is done.",
};

const SECTIONS = [
  { id: "in-short", title: "In short" },
  { id: "open-times", title: "Opening times for clients" },
  { id: "slot-actions", title: "Changing or closing a slot" },
  { id: "new-bookings", title: "How a booking comes in" },
  { id: "statuses", title: "Booking statuses" },
  { id: "working", title: "Looking after a booking" },
  { id: "automatic", title: "What the system does by itself" },
  { id: "roles", title: "Who can do what" },
  { id: "guidelines", title: "Guidelines" },
  { id: "questions", title: "Common questions" },
];

/** Manual → Bookings and the Calendar. Times come from the constants the code uses. */
export default async function BookingsManualPage({ params }: BookingsManualPageProps) {
  const { tenantSlug } = await params;
  const admin = `/${tenantSlug}/admin`;
  const deposit = `${DEPOSIT_HOLD_HOURS} hours`;
  const balanceDays = `${BALANCE_DUE_AFTER_SESSION_DAYS} days`;

  return (
    <ManualPage
      tenantSlug={tenantSlug}
      icon={CalendarCheck}
      area="Bookings & Calendar"
      title="Bookings and the Calendar"
      description="How to open times for clients, take bookings online or by hand, and look after each booking until the session is done."
      sections={SECTIONS}
    >
      <ManualSection id="in-short" title="In short">
        <ManualList
          items={[
            <>
              A client can only book a time you have opened. You open times as <B>slots</B> in{" "}
              <ManualLink href={`${admin}/calendar`}>Production → Calendar</ManualLink>.
            </>,
            <>
              A booking is made in one of two ways: the client books on your booking page, or a team member books for them (phone,
              WhatsApp, walk-in).
            </>,
            <>
              A booking is <B>confirmed once its deposit is paid</B>. Until then it is pending and the slot is kept for the client
              for a limited time.
            </>,
            <>
              Every booking is listed in <ManualLink href={`${admin}/bookings`}>Production → Bookings</ManualLink>, with the
              client&apos;s details, the deposit and everything you can do with it.
            </>,
            <>A confirmed booking gets its own gallery automatically, ready for the photos after the session.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="open-times" title="Opening times for clients">
        <ManualP>
          Open <ManualLink href={`${admin}/calendar`}>Production → Calendar</ManualLink>. There are two ways to add slots:
        </ManualP>
        <ManualTable
          head={["Button", "Use it for", "What you fill in"]}
          rows={[
            [
              <Ui key="n">New Slot</Ui>,
              "One session time.",
              <>
                The date, start and end time, the category, an optional campaign title, and whether it starts as{" "}
                <Ui>Available for Booking</Ui> or <Ui>Blocked / Maintenance</Ui>.
              </>,
            ],
            [
              <Ui key="b">Batch Generate</Ui>,
              "Many slots at once, for example a whole convocation week.",
              <>
                A date range, the daily start and end time, how long each session lasts, the break between sessions, the category
                and a campaign title. The dialog shows how many slots it will create before you press <Ui>Generate</Ui>.
              </>,
            ],
          ]}
        />
        <ManualList
          items={[
            <>
              <B>Times that clash are skipped.</B> A slot that overlaps an existing one, or whose time has already passed, is not
              created. Batch Generate tells you how many were skipped.
            </>,
            <>
              <B>The category decides the price.</B> When the category has packages in{" "}
              <ManualLink href={`${admin}/services`}>Catalog &amp; CMS → Services</ManualLink>, the client must choose one, and the
              package sets the deposit and the session price. The Calendar shows <Ui>By package</Ui> for these slots.
            </>,
            <>
              <B>A category without packages</B> uses the fee and deposit set on the slot itself. Only the studio owner can set
              those. A team member who tries is asked to have the owner add a package for the category first.
            </>,
            <>
              Slots whose time has passed are hidden. Tick <Ui>Show past slots</Ui> to see them. A past slot nobody booked is marked{" "}
              <Ui>Passed · not booked</Ui>.
            </>,
          ]}
        />
        <ManualCallout title="Open more than you think you need">
          A client who finds their preferred time taken will pick the next one, but only if there is a next one. Before a busy
          period, generate the full range of times you are willing to work.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="slot-actions" title="Changing or closing a slot">
        <ManualP>Each row in the Calendar has its own actions. What is offered depends on the slot&apos;s status.</ManualP>
        <ManualTable
          head={["Action", "What it does", "Limits"]}
          rows={[
            [<Ui key="bc">Book for Customer</Ui>, "Books a customer straight into this slot.", "Available slots only."],
            [
              <>
                <Ui>Block Slot</Ui> / <Ui>Unblock Slot</Ui>
              </>,
              "Closes the slot so clients can't select it, or opens it again. Use it for breaks, maintenance or a day off.",
              "Only an available slot can be blocked.",
            ],
            [
              <Ui key="e">Edit Slot</Ui>,
              "Changes the date, time, category or campaign title.",
              "Not while a client is booked into the slot or booking it right now. To change a client's time, use Move to another slot on their booking. Only the owner can change a fee or deposit.",
            ],
            [
              <Ui key="d">Delete Slot</Ui>,
              "Removes the slot.",
              "Not while a client is booked into it or booking it right now. Cancel or move the booking first.",
            ],
            [
              <Ui key="ds">Delete Selected</Ui>,
              "Removes every slot you ticked.",
              "Slots a client is booked into, or booking right now, are skipped.",
            ],
            [
              <Ui key="f">Force Release Hold</Ui>,
              "Ends a client's reservation while they are still booking.",
              <>
                Rarely needed. Read <ManualLink href={`${admin}/manual/slot-hold`}>Slot holds</ManualLink> first.
              </>,
            ],
          ]}
        />
        <ManualP>
          The five slot statuses (<Ui>Available</Ui>, <Ui>Held in Checkout</Ui>, <Ui>Awaiting verification</Ui>, <Ui>Booked</Ui>,{" "}
          <Ui>Blocked</Ui>) are explained in <ManualLink href={`${admin}/manual/slot-hold`}>Slot holds</ManualLink>.
        </ManualP>
      </ManualSection>

      <ManualSection id="new-bookings" title="How a booking comes in">
        <ManualP>
          <B>Online, by the client.</B> The client opens your booking page, selects a time, chooses a package, signs in or creates
          an account, and pays the deposit online, by bank transfer (QR) or in cash at the studio. You don&apos;t do anything until
          a payment needs checking.
        </ManualP>
        <ManualP>
          <B>By your team.</B> Use this for bookings that reach you by phone, WhatsApp or in person:
        </ManualP>
        <ManualSteps
          items={[
            <>
              Open <ManualLink href={`${admin}/bookings`}>Bookings</ManualLink> and press <Ui>New booking</Ui>, then pick an open
              session. Or press <Ui>Book for Customer</Ui> on a slot in the Calendar.
            </>,
            <>
              Choose an <Ui>Existing Customer</Ui> by searching their name, email or phone, or enter a new customer&apos;s full name,
              email and phone.
            </>,
            <>Choose the package. Your team may book without one; a client booking online may not.</>,
            <>Add a creative brief if the customer told you what they want.</>,
            <>
              Set the <Ui>Payment Status</Ui>: <Ui>Pending (needs verification)</Ui> if the deposit hasn&apos;t reached you, or{" "}
              <Ui>Paid (confirm booking)</Ui> if it has. Choose how it is paid: cash, QR / bank transfer or card.
            </>,
          ]}
        />
        <ManualList
          items={[
            <>
              <B>Only the studio owner can record a deposit as paid.</B> Other team members book it as pending, and the payment is
              approved in <ManualLink href={`${admin}/verification`}>Finance → Verification</ManualLink>.
            </>,
            <>
              <B>Booked as paid:</B> the booking is confirmed at once, the slot becomes <Ui>Booked</Ui>, the balance invoice is
              issued and the gallery is created.
            </>,
            <>
              <B>Booked as pending:</B> the slot becomes <Ui>Awaiting verification</Ui> and the deposit appears in Verification.
            </>,
            <>
              If the email already has an account at your studio, the booking is linked to it. Otherwise an account is created that
              the customer can claim by signing up with the same email.
            </>,
            <>The customer is emailed a confirmation, the same as for an online booking.</>,
          ]}
        />
        <ManualCallout tone="warning" title="A pending cash or bank-transfer booking does not wait forever">
          If the deposit isn&apos;t approved and no payment slip is uploaded within {deposit}, the booking is cancelled and the slot
          opens again. This applies to bookings your team makes too. Approve cash as soon as you receive it.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="statuses" title="Booking statuses">
        <ManualP>
          The <ManualLink href={`${admin}/bookings`}>Bookings</ManualLink> page shows one status per booking. The filters at the
          top group them: <Ui>Upcoming</Ui>, <Ui>Needs verification</Ui>, <Ui>Confirmed</Ui>, <Ui>Past</Ui> and <Ui>Cancelled</Ui>.
        </ManualP>
        <ManualTable
          head={["Status", "What it means", "What to do"]}
          rows={[
            [<Ui key="1">Pending</Ui>, "The booking is made and the deposit is not yet paid.", "Nothing yet, or follow up with the client."],
            [
              <Ui key="2">Awaiting online payment</Ui>,
              "The client chose to pay online and hasn't finished on the bank's page.",
              "Nothing. It settles or is released by itself.",
            ],
            [
              <Ui key="3">Awaiting verification</Ui>,
              "A bank-transfer or cash deposit is waiting for you to confirm it.",
              <>
                Check it in <ManualLink href={`${admin}/verification`}>Verification</ManualLink>.
              </>,
            ],
            [
              <Ui key="4">Payment rejected</Ui>,
              "You rejected the payment slip. The client can upload a new one.",
              `Wait for the new slip. With none in ${deposit}, the booking is cancelled.`,
            ],
            [<Ui key="5">Confirmed</Ui>, "The deposit is paid. The session will happen.", "Prepare for the session."],
            [
              <Ui key="6">Confirmed · balance due</Ui>,
              "Confirmed, and the rest of the price is still owed.",
              "Nothing before the session. The balance is collected afterwards.",
            ],
            [<Ui key="7">Balance awaiting verification</Ui>, "The client sent proof of paying the balance.", "Check it in Verification."],
            [<Ui key="8">Fully paid</Ui>, "Deposit and balance are both paid.", "Nothing."],
            [
              <>
                <Ui>Session done</Ui> / <Ui>Session done · balance due</Ui>
              </>,
              "You marked the session as done.",
              "Upload the photos to the booking's gallery.",
            ],
            [<Ui key="10">Delivered</Ui>, "The gallery has been delivered to the client.", "Nothing."],
            [<Ui key="11">No-show</Ui>, "The client didn't come.", "Contact the client. A paid deposit stays on record as paid."],
            [<Ui key="12">Cancelled</Ui>, "The booking was cancelled by your team or by the system.", "Nothing. The slot is open again."],
          ]}
        />
      </ManualSection>

      <ManualSection id="working" title="Looking after a booking">
        <ManualP>
          Select a booking on the Bookings page to open <Ui>Booking Details</Ui>. It shows the client, the session, the creative
          brief, the deposit and the balance, and these actions:
        </ManualP>
        <ManualTable
          head={["Action", "When it is offered", "What happens"]}
          rows={[
            [
              <Ui key="m">Move to another slot</Ui>,
              "Pending and confirmed bookings.",
              <>
                You pick an open slot <B>in the same category</B>, so the price still applies. The old slot opens again, the client
                is emailed the new date and time, and an unpaid balance becomes due {balanceDays} after the new session.
              </>,
            ],
            [
              <Ui key="r">Resend confirmation email</Ui>,
              "Pending and confirmed bookings.",
              "Sends the booking confirmation again. You are told whether it went out and to which address.",
            ],
            [
              <Ui key="d">Mark session done</Ui>,
              "Confirmed bookings, once the session time has started.",
              "The booking becomes Session done and its gallery moves on to the production stage.",
            ],
            [
              <Ui key="ns">Client didn&apos;t show</Ui>,
              "Confirmed bookings, once the session time has started.",
              "Records the booking as a No-show.",
            ],
            [
              <>
                <Ui>Upload photos</Ui> / <Ui>Create gallery</Ui>
              </>,
              "Any booking that is no longer pending.",
              "Opens the booking's gallery so you can add the photos. Create gallery appears only for older bookings that have none.",
            ],
            [
              <Ui key="c">Cancel booking</Ui>,
              "Pending and confirmed bookings.",
              "You give a reason, which the client sees. The slot opens again, anything unpaid is cancelled and the client is emailed.",
            ],
          ]}
        />
        <ManualList
          items={[
            <>
              <Ui>Verify payment →</Ui> appears on a booking whose payment is waiting, and takes you to Verification.
            </>,
            <>
              <Ui>Open Project →</Ui> takes you to the booking&apos;s gallery and production page.
            </>,
          ]}
        />
        <ManualCallout tone="warning" title="Cancelling a paid booking does not refund it">
          Only the studio owner can cancel a booking whose deposit is paid. The deposit stays on record as paid, and the client is
          told the studio will contact them about it. Refund it or agree a new date with the client; a refund is made outside the
          system.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="automatic" title="What the system does by itself">
        <ManualList
          items={[
            <>
              <B>Confirms the booking</B> when the deposit is paid online, or when it is approved in Verification.
            </>,
            <>
              <B>Issues the balance invoice</B> the moment the deposit is paid: the session price minus the deposit, due{" "}
              {balanceDays} after the session.
            </>,
            <>
              <B>Creates the gallery</B> for every confirmed booking. The category decides whether it is a quick session or a full
              production.
            </>,
            <>
              <B>Emails the client</B> when they book and when you move or cancel their booking.
            </>,
            <>
              <B>Cancels unpaid bookings.</B> A bank-transfer or cash booking with no payment slip and no approval after {deposit}{" "}
              is cancelled, its deposit invoice is voided and the slot opens again.
            </>,
            <>
              <B>Releases abandoned checkouts.</B> A client who selects a time and leaves holds it only for a few minutes. See{" "}
              <ManualLink href={`${admin}/manual/slot-hold`}>Slot holds</ManualLink>.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="roles" title="Who can do what">
        <ManualTable
          head={["Task", "Studio owner", "Other team members"]}
          rows={[
            ["Open, edit, block and delete slots", "Yes", "Yes"],
            ["Set a fee or deposit on a slot", "Yes", "No"],
            ["Book a customer as pending", "Yes", "Yes"],
            ["Book a customer as already paid", "Yes", "No"],
            ["Move a booking, mark it done or no-show", "Yes", "Yes"],
            ["Cancel an unpaid booking", "Yes", "Yes"],
            ["Cancel a booking whose deposit is paid", "Yes", "No"],
          ]}
        />
      </ManualSection>

      <ManualSection id="guidelines" title="Guidelines">
        <ManualP>
          <B>Do</B>
        </ManualP>
        <ManualList
          items={[
            <>
              Record every booking in the system, including phone and walk-in ones. A booking kept only in WhatsApp can be double
              booked.
            </>,
            <>Move a booking instead of cancelling and rebooking it. Moving keeps the deposit, the invoices and the gallery together.</>,
            <>Mark the session done on the day. It keeps the Bookings list honest and shows which galleries are waiting for photos.</>,
            <>Write a clear reason when you cancel. The client reads it word for word.</>,
            <>
              Check <Ui>Needs verification</Ui> every day, so no client waits on you and no slot stays blocked.
            </>,
          ]}
        />
        <ManualP>
          <B>Don&apos;t</B>
        </ManualP>
        <ManualList
          items={[
            <>Don&apos;t delete a slot to get rid of a booking. The system refuses, and cancelling is what informs the client.</>,
            <>Don&apos;t try to change a booking&apos;s price by moving it. A booking can only move within its own category.</>,
            <>Don&apos;t record a deposit as paid before the money has reached you.</>,
            <>Don&apos;t close a day by deleting its slots. Block them, so you can open them again with one click.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="questions" title="Common questions">
        <div className="space-y-5">
          <ManualQa question="A client wants a time that isn't on the booking page. What do I do?">
            <p>
              Add it with <Ui>New Slot</Ui> in the Calendar. They can then book it online, or you can book it for them with{" "}
              <Ui>Book for Customer</Ui>.
            </p>
          </ManualQa>
          <ManualQa question="Why can't I mark a session as done?">
            <p>
              The booking must be confirmed and its session time must have started. A pending booking has no confirmed session to
              finish: its deposit has to be approved first.
            </p>
          </ManualQa>
          <ManualQa question="A booking disappeared from Upcoming. Where did it go?">
            <p>
              Look under <Ui>Cancelled</Ui>. A booking whose deposit was not paid in time is cancelled by the system. If the client
              still wants the session, book them again while the slot is free.
            </p>
          </ManualQa>
          <ManualQa question="The client lost the confirmation email. Can I send it again?">
            <p>
              Yes. Open the booking and press <Ui>Resend confirmation email</Ui>. A client who has not set a password yet gets a
              fresh link to set one.
            </p>
          </ManualQa>
          <ManualQa question="What time zone does the Calendar use?">
            <p>
              The studio&apos;s own time, not the time on the device you are using. A slot counts as passed when its start time has
              gone by in the studio&apos;s time zone.
            </p>
          </ManualQa>
        </div>
      </ManualSection>
    </ManualPage>
  );
}
