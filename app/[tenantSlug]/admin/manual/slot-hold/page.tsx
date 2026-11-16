import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/page";
import {
  ManualCallout,
  ManualContents,
  ManualList,
  ManualP,
  ManualQa,
  ManualSection,
  ManualSteps,
  ManualTable,
  Ui,
} from "@/components/admin/manual/manual-ui";
import { SLOT_HOLD_MINUTES, SLOT_HOLD_NUDGE_SECONDS } from "@/lib/bookings/hold";
import { ONLINE_HOLD_MINUTES } from "@/lib/payments/settle";
import { DEPOSIT_HOLD_HOURS } from "@/lib/bookings/expiry";

interface SlotHoldManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Slot holds | Manual | Studio Admin",
  description: "How the calendar prevents double bookings, and what the studio's team sees and can do.",
};

const SECTIONS = [
  { id: "in-short", title: "In short" },
  { id: "why", title: "Why it exists" },
  { id: "how", title: "How a hold works, step by step" },
  { id: "client-view", title: "What the client sees" },
  { id: "after-submit", title: "After the client submits the booking" },
  { id: "admin-view", title: "What you see in the Calendar" },
  { id: "actions", title: "What you can do" },
  { id: "guidelines", title: "Guidelines" },
  { id: "questions", title: "Common questions" },
  { id: "reference", title: "Quick reference" },
];

/**
 * Manual → Slot holds. Every time on this page comes from the constant the code itself uses,
 * so the page stays true when a value changes. Admin layout: the studio's team only.
 */
export default async function SlotHoldManualPage({ params }: SlotHoldManualPageProps) {
  const { tenantSlug } = await params;
  const admin = `/${tenantSlug}/admin`;
  const hold = `${SLOT_HOLD_MINUTES} minutes`;
  const nudge = `${SLOT_HOLD_NUDGE_SECONDS / 60} minutes`;
  const online = `${ONLINE_HOLD_MINUTES} minutes`;
  const deposit = `${DEPOSIT_HOLD_HOURS} hours`;

  const link = (href: string, label: string) => (
    <Link href={href} className="text-amber-400 hover:underline whitespace-nowrap">
      {label}
    </Link>
  );

  return (
    <PageShell width="document">
      <PageHeader
        icon={CalendarClock}
        eyebrow="Manual · Bookings & Calendar"
        title="Slot holds: how the calendar prevents double bookings"
        description="What happens behind the scenes when a client selects a time, what you see while it happens, and what to do when a slot looks stuck."
        back={{ href: `${admin}/manual`, label: "Manual" }}
      />

      <ManualContents items={SECTIONS} />

      <ManualSection id="in-short" title="In short">
        <ManualList
          items={[
            <>
              When a client selects a time on your booking page, that slot is <strong className="text-white">reserved for them for {hold}</strong>.
              Nobody else can select it during that time.
            </>,
            <>This is called a hold. It is the reason two clients can never book the same slot.</>,
            <>
              Clients are never shown the {hold} or a countdown. They only see that their time is selected, and a short reminder
              near the end.
            </>,
            <>If the client doesn&apos;t finish in time, the slot opens up again by itself. You don&apos;t need to do anything.</>,
            <>
              Once the client submits the booking, a longer reservation takes over: {online} for online payment, or up to {deposit}{" "}
              for a bank transfer or cash deposit.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="why" title="Why it exists">
        <ManualP>
          Booking takes a few minutes: the client picks a time, chooses a package, fills in their details and pays a deposit. Without
          a hold, two clients could pick the same time during those minutes and both believe it is theirs. One of them would then
          have to be turned away after paying.
        </ManualP>
        <ManualP>
          The hold closes that gap. The moment a client selects a time, the slot is theirs to finish booking, and everyone else sees
          it as taken for now. This matters most in busy periods such as convocation and festive seasons, when many clients book at
          the same moment.
        </ManualP>
        <ManualP>
          It is kept out of the client&apos;s view on purpose. A countdown makes booking feel rushed and raises questions, and the
          client doesn&apos;t need to understand the mechanism for it to protect them.
        </ManualP>
      </ManualSection>

      <ManualSection id="how" title="How a hold works, step by step">
        <ManualSteps
          items={[
            <>
              <strong className="text-white">The client selects an available time.</strong> The slot is reserved for them for {hold}{" "}
              from that moment. If two clients tap the same slot at the same instant, only the first one gets it. The other is told
              someone else is booking that time.
            </>,
            <>
              <strong className="text-white">The hold belongs to the client&apos;s browser.</strong> If they refresh the page or come
              back to it in the same browser, their time is still selected. On a different phone or browser, the same slot shows as
              taken until the hold ends.
            </>,
            <>
              <strong className="text-white">One hold at a time.</strong> If the client selects a different time, the first slot is
              released straight away and the new one is held for a fresh {hold}.
            </>,
            <>
              <strong className="text-white">The client fills in the booking.</strong> Choosing a package, signing in or creating an
              account, and choosing how to pay all happen inside the same {hold}.
            </>,
            <>
              <strong className="text-white">The hold ends</strong> in one of four ways: the client submits the booking, the client
              clears their selection, the {hold} run out, or a team member releases it by hand.
            </>,
          ]}
        />
        <ManualCallout title="An expired hold never blocks anyone">
          Once the {hold} have passed, another client can select that slot immediately, even if a screen somewhere still shows it as
          held. Screens catch up the next time they load.
        </ManualCallout>
        <ManualP>A session that has already started can&apos;t be selected or held.</ManualP>
      </ManualSection>

      <ManualSection id="client-view" title="What the client sees">
        <ManualP>The client sees plain words and no clock. This is what appears on the booking page and at checkout:</ManualP>
        <ManualTable
          head={["Moment", "What the client sees"]}
          rows={[
            [
              "They select a time",
              <>
                The slot is marked <Ui>SELECTED</Ui>, and a bar at the bottom of the page shows the date and time with{" "}
                <Ui>Clear selection</Ui> and <Ui>Proceed to Booking</Ui>.
              </>,
            ],
            [
              "Another client looks at that slot",
              <>
                The slot is marked <Ui>Being Booked</Ui> and can&apos;t be selected. If they try at the same moment, they read:
                &quot;Someone else is booking this time right now. Please choose another time or check back shortly.&quot;
              </>,
            ],
            [
              <>The last {nudge}</>,
              <>
                A short reminder: &quot;Please continue soon to keep this time.&quot; At checkout it reads &quot;Please complete your
                payment soon to keep this time slot.&quot;
              </>,
            ],
            [
              "The time runs out",
              <>
                The booking form closes and they read: &quot;This time is no longer reserved for you. Please select it again to
                continue.&quot; If nobody else has taken the slot, they can select it again right away.
              </>,
            ],
            [
              "They clear their selection",
              <>The bar disappears and the slot is available to everyone again at once.</>,
            ],
          ]}
        />
      </ManualSection>

      <ManualSection id="after-submit" title="After the client submits the booking">
        <ManualP>
          Submitting the booking ends the {SLOT_HOLD_MINUTES}-minute hold. What keeps the slot reserved after that depends on how the
          client pays the deposit.
        </ManualP>
        <ManualTable
          head={["Deposit paid by", "The slot becomes", "For how long", "Then"]}
          rows={[
            [
              "Online payment (FPX or card)",
              <>
                Stays <Ui>Held in Checkout</Ui>
              </>,
              <>{online}, while the client pays on the bank&apos;s page</>,
              <>
                Paid in time: the booking is confirmed and the slot becomes <Ui>Booked</Ui>. Not paid: the slot opens again, and the
                unfinished booking is cancelled when someone else books that slot.
              </>,
            ],
            [
              "Bank transfer (QR)",
              <Ui key="qr">Awaiting verification</Ui>,
              <>
                Up to {deposit} for the client to upload their payment slip. Once a slip is uploaded, the slot is kept until you
                check it.
              </>,
              <>
                You approve the slip in {link(`${admin}/verification`, "Verification")}: the booking is confirmed. No slip within{" "}
                {deposit}: the booking is cancelled, its deposit invoice is voided and the slot opens again.
              </>,
            ],
            [
              "Cash at the studio",
              <Ui key="cash">Awaiting verification</Ui>,
              <>Up to {deposit} for you to receive the cash and approve it</>,
              <>
                You approve the cash payment in {link(`${admin}/verification`, "Verification")}: the booking is confirmed. Not
                approved within {deposit}: the booking is cancelled and the slot opens again.
              </>,
            ],
          ]}
        />
        <ManualList
          items={[
            <>
              If you <strong className="text-white">reject a payment slip</strong>, the client gets another {deposit} to send a new
              one before the booking is cancelled.
            </>,
            <>
              If a client pays online <strong className="text-white">after the {online} have passed</strong> and the slot is still
              free, their booking is confirmed as normal. If someone else has booked the slot by then, the payment is kept on its
              invoice with a &quot;REFUND REQUIRED&quot; note, and the client is told the studio will contact them. Refund them or
              offer a new time; the refund itself is done outside the system.
            </>,
            <>
              Online payment is only offered when your studio has connected it in{" "}
              {link(`${admin}/settings?tab=payments`, "Settings → Getting paid")}.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="admin-view" title="What you see in the Calendar">
        <ManualP>
          Open {link(`${admin}/calendar`, "Production → Calendar")}. Every slot shows one of these statuses:
        </ManualP>
        <ManualTable
          head={["Status", "What it means"]}
          rows={[
            [<Ui key="a">Available</Ui>, "Open. A client can select it, or you can book a customer into it."],
            [
              <Ui key="h">Held in Checkout</Ui>,
              <>
                A client has selected it and is booking right now ({hold}), or has submitted and is paying online ({online}). No
                booking has been confirmed yet.
              </>,
            ],
            [
              <Ui key="p">Awaiting verification</Ui>,
              "A client has booked it and the deposit by bank transfer or cash has not been confirmed yet.",
            ],
            [<Ui key="b">Booked</Ui>, "The deposit is paid and the booking is confirmed."],
            [<Ui key="m">Blocked</Ui>, "You closed this slot. Clients can't select it."],
          ]}
        />
        <ManualList
          items={[
            <>
              The <Ui>In Hold</Ui> tile at the top counts the slots that are held right now. It lights up when there is at least one.
            </>,
            <>
              The status filter has <Ui>Held (Checkout)</Ui> to list only held slots.
            </>,
            <>
              A hold that a client hasn&apos;t submitted yet does not appear in {link(`${admin}/bookings`, "Bookings")} and has no
              invoice. There is nothing to follow up until the client submits.
            </>,
            <>
              Opening the Calendar clears any holds that have run out. If the page has been open for a while, it can still show an
              old hold; see the next section.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="actions" title="What you can do">
        <ManualTable
          head={["Action", "Where", "What it does", "When to use it"]}
          rows={[
            [
              <Ui key="c">Clean Expired Holds</Ui>,
              "Top of the Calendar page",
              "Opens every slot whose hold has already run out. It never touches a hold that is still running.",
              "The Calendar has been open for a while and you want it up to date. Safe to press at any time.",
            ],
            [
              <Ui key="f">Force release hold</Ui>,
              <>
                Under the <Ui>Held in Checkout</Ui> status on a slot
              </>,
              "Ends a hold that is still running and opens the slot immediately.",
              "Rarely. Only when you are sure the client is not going to finish, and you need the slot now.",
            ],
            [
              <Ui key="n">New booking</Ui>,
              <>
                {link(`${admin}/bookings`, "Bookings")} page, or <Ui>Book for Customer</Ui> on a Calendar slot
              </>,
              "Books a customer straight into an available slot. No hold is involved.",
              "Phone, WhatsApp and walk-in bookings.",
            ],
          ]}
        />
        <ManualCallout tone="warning" title="Force release interrupts a real client">
          The client whose hold you release can no longer finish that booking: they are told the time is no longer reserved for them.
          If they were paying online, their payment may arrive after the slot has gone to someone else, and you would then owe them a
          refund. A hold ends by itself within {hold} ({online} for online payment), so waiting is almost always the better choice.
        </ManualCallout>
        <ManualP>While a slot is held:</ManualP>
        <ManualList
          items={[
            <>
              You <strong className="text-white">can&apos;t book a customer into it, block it, edit it or delete it</strong>. Changing
              it would stop the client who is booking it at the last step. Its edit and delete buttons are greyed out, and{" "}
              <Ui>Delete Selected</Ui> skips it.
            </>,
            <>Wait for the hold to end, or release it first. A hold that has already run out doesn&apos;t count: that slot can be changed.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="guidelines" title="Guidelines">
        <ManualP>
          <strong className="text-white">Do</strong>
        </ManualP>
        <ManualList
          items={[
            <>Leave holds alone. They start and end by themselves, and most last only a few minutes.</>,
            <>
              Check {link(`${admin}/verification`, "Verification")} every day. A slot stays <Ui>Awaiting verification</Ui> until you
              approve or reject the client&apos;s payment slip, and nobody else can book it in the meantime.
            </>,
            <>
              Approve cash deposits in Verification as soon as you receive them. A cash booking that isn&apos;t approved is cancelled
              after {deposit}, even if the client has paid you.
            </>,
            <>
              Open enough slots before busy periods. Use <Ui>Batch Generate</Ui> on the Calendar so clients who miss one time can
              pick another.
            </>,
            <>
              Tell a client who lost their time to simply select it again. If someone else has taken it, offer another slot or add
              one.
            </>,
          ]}
        />
        <ManualP>
          <strong className="text-white">Don&apos;t</strong>
        </ManualP>
        <ManualList
          items={[
            <>Don&apos;t force release a hold just because the slot looks busy. Someone is in the middle of booking it.</>,
            <>
              Don&apos;t promise a client a slot that shows <Ui>Held in Checkout</Ui>. It may be confirmed for someone else within
              minutes.
            </>,
            <>
              Don&apos;t mention the {hold} to clients as a deadline. It is not a rule they need to follow, and a client who runs out
              of time can start again straight away.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="questions" title="Common questions">
        <div className="space-y-5">
          <ManualQa question="Can two clients ever end up with the same slot?">
            <p>
              No. Selecting a slot is a single all-or-nothing step: the system gives the slot to the first request and refuses every
              other one in the same instant. The same check runs again when the booking is submitted, and when a team member books a
              customer.
            </p>
          </ManualQa>
          <ManualQa question={`Can I change the ${hold}?`}>
            <p>
              No. The length is the same for every studio and is not a setting. It is long enough to choose a package, create an
              account and start a payment, and short enough that an abandoned slot comes back quickly.
            </p>
          </ManualQa>
          <ManualQa question="A client says the time they picked disappeared. What happened?">
            <p>
              They took longer than {hold} before submitting, so the hold ended and they were asked to select the time again. If the
              slot is still <Ui>Available</Ui>, they can select it and continue. If another client booked it meanwhile, it is gone;
              offer a different time.
            </p>
          </ManualQa>
          <ManualQa question={`A slot has shown "Held in Checkout" for more than ${hold}. Is it stuck?`}>
            <p>Usually it is one of two things:</p>
            <ManualList
              items={[
                <>The client submitted the booking and is paying online. That reservation lasts {online}.</>,
                <>
                  The Calendar page has been open for a while and is showing an old hold. Press <Ui>Clean Expired Holds</Ui> or
                  reload the page.
                </>,
              ]}
            />
            <p>A hold can&apos;t last longer than that. If the status remains after cleaning, a new client has selected the slot.</p>
          </ManualQa>
          <ManualQa question="A client started on their phone and switched to a laptop. Why is the slot taken?">
            <p>
              The hold belongs to the browser it started in. On the laptop, the slot shows as <Ui>Being Booked</Ui> until the phone&apos;s
              hold ends. They can go back to the phone and finish, tap <Ui>Clear selection</Ui> there, or wait up to {hold}.
            </p>
          </ManualQa>
          <ManualQa question="A client paid online but their booking is not confirmed. Why?">
            <p>
              The payment arrived after the {online} had passed, and someone else had booked the slot by then. The payment is on its
              invoice in {link(`${admin}/invoices`, "Invoices")} with a &quot;REFUND REQUIRED&quot; note. Contact the client to refund
              them or agree a new time.
            </p>
          </ManualQa>
          <ManualQa question="I need to book a walk-in customer into a slot that is held. What do I do?">
            <p>
              Wait a few minutes; the hold ends within {hold} unless the client submits. If you can&apos;t wait and are sure the
              online client has left, use <Ui>Force release hold</Ui>, then <Ui>Book for Customer</Ui>. Remember the online client
              will be stopped if they are still there.
            </p>
          </ManualQa>
          <ManualQa question="Does a hold create a booking, an invoice or a notification?">
            <p>
              No. A hold only marks the slot. The booking, its deposit invoice and any emails are created when the client submits the
              booking.
            </p>
          </ManualQa>
        </div>
      </ManualSection>

      <ManualSection id="reference" title="Quick reference">
        <ManualTable
          head={["What", "How long"]}
          rows={[
            ["A selected slot stays reserved for the client", hold],
            ["Reminder shown to the client before the hold ends", <>The last {nudge}</>],
            ["Slot reserved while the client pays online (FPX or card)", online],
            ["Slot kept for an unpaid bank transfer or cash deposit", deposit],
            ["Time to send a new slip after you reject one", deposit],
          ]}
        />
        <ManualP>
          These times are the same for every studio and can&apos;t be changed in Settings. This page always shows the values the
          system is using.
        </ManualP>
      </ManualSection>
    </PageShell>
  );
}
