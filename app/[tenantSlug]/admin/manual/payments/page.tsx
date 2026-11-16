import type { Metadata } from "next";
import { Banknote } from "lucide-react";
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
import { ONLINE_HOLD_MINUTES } from "@/lib/payments/settle";

interface PaymentsManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Payments, invoices and verification | Manual | Studio Admin",
  description: "How clients pay, how the studio confirms a payment, and how invoices work.",
};

const SECTIONS = [
  { id: "in-short", title: "In short" },
  { id: "invoice-types", title: "What gets invoiced, and when" },
  { id: "ways-to-pay", title: "The three ways a client pays" },
  { id: "verification", title: "Checking payments in Verification" },
  { id: "invoices", title: "The Invoices page" },
  { id: "statuses", title: "Invoice statuses" },
  { id: "setup", title: "Setting up how you get paid" },
  { id: "refunds", title: "Refunds and late payments" },
  { id: "guidelines", title: "Guidelines" },
  { id: "questions", title: "Common questions" },
];

/** Manual → Payments, invoices and verification. Times come from the constants the code uses. */
export default async function PaymentsManualPage({ params }: PaymentsManualPageProps) {
  const { tenantSlug } = await params;
  const admin = `/${tenantSlug}/admin`;
  const deposit = `${DEPOSIT_HOLD_HOURS} hours`;
  const online = `${ONLINE_HOLD_MINUTES} minutes`;
  const balanceDays = `${BALANCE_DUE_AFTER_SESSION_DAYS} days`;

  return (
    <ManualPage
      tenantSlug={tenantSlug}
      icon={Banknote}
      area="Payments"
      title="Payments, invoices and verification"
      description="How clients pay you, how a payment is confirmed, and what each invoice and status means."
      sections={SECTIONS}
    >
      <ManualSection id="in-short" title="In short">
        <ManualList
          items={[
            <>
              Everything a client owes is an <B>invoice</B>. The system issues most invoices by itself; you rarely write one.
            </>,
            <>
              A client pays in one of three ways: <B>online</B>, by <B>bank transfer (QR)</B>, or in <B>cash at the studio</B>.
            </>,
            <>
              Online payments confirm themselves. Bank transfers and cash wait in{" "}
              <ManualLink href={`${admin}/verification`}>Finance → Verification</ManualLink> until the studio owner approves them.
            </>,
            <>
              <B>Approving a payment is what moves things forward:</B> a deposit confirms the booking, a final balance unlocks the
              client&apos;s full-resolution photos, a print order goes into production.
            </>,
            <>Only the studio owner can approve, reject, record or cancel payments. Any team member can send a reminder.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="invoice-types" title="What gets invoiced, and when">
        <ManualTable
          head={["Invoice", "Issued when", "Paying it"]}
          rows={[
            [
              <Ui key="d">Booking deposit</Ui>,
              "A client or your team makes a booking.",
              "Confirms the booking and locks the slot.",
            ],
            [
              <Ui key="b">Session balance</Ui>,
              <>
                The deposit is paid. It is the session price minus the deposit, due {balanceDays} after the session.
              </>,
              "Unlocks the full-resolution photos in the booking's gallery.",
            ],
            [
              <Ui key="r">Project retainer (50%)</Ui>,
              "A client accepts a proposal for a production.",
              "Starts the project and issues the final balance invoice.",
            ],
            [
              <Ui key="f">Project final balance (50%)</Ui>,
              "The retainer is paid. It is the project budget minus the retainer.",
              "Unlocks the client's master files in their delivery vault.",
            ],
            [
              <Ui key="p">Print &amp; frame order</Ui>,
              "A client orders framed prints that cost more than their package includes.",
              "Moves the order to New, ready for production.",
            ],
            [
              <Ui key="c">Invoice</Ui>,
              <>
                The owner presses <Ui>New invoice</Ui> for anything else, for example an extra hour of coverage.
              </>,
              "Marks it paid. Nothing else changes.",
            ],
          ]}
        />
        <ManualP>
          Invoice numbers run in order for your studio, starting again each year: INV-2026-0001, INV-2026-0002 and so on.
        </ManualP>
      </ManualSection>

      <ManualSection id="ways-to-pay" title="The three ways a client pays">
        <ManualTable
          head={["Method", "What the client does", "What you do"]}
          rows={[
            [
              "Online (card or FPX)",
              "Pays on the bank's page and comes back to your site.",
              "Nothing. The system checks with the payment provider itself and marks the invoice paid.",
            ],
            [
              "Bank transfer (QR)",
              "Scans your QR code or copies your bank details, pays in their banking app, then uploads the receipt slip (an image or PDF) with an optional reference.",
              "Check the slip against your bank account, then approve or reject it in Verification.",
            ],
            [
              "Cash at the studio",
              "Chooses cash and receives a cash invoice. They pay at your counter.",
              "Take the cash, then approve the payment in Verification.",
            ],
          ]}
        />
        <ManualList
          items={[
            <>
              Online payment is offered only when you have connected it in{" "}
              <ManualLink href={`${admin}/settings?tab=payments`}>Settings → Getting paid</ManualLink>. Without it, clients choose
              between bank transfer and cash.
            </>,
            <>
              A client paying a deposit online has {online} to finish. A client paying a deposit by bank transfer or cash has{" "}
              {deposit} before the booking is cancelled.
            </>,
            <>Clients pay later invoices, such as a balance, from their account, with the same three methods.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="verification" title="Checking payments in Verification">
        <ManualP>
          <ManualLink href={`${admin}/verification`}>Finance → Verification</ManualLink> lists every payment that is waiting for
          you. The Finance menu shows a number when there is something to check.
        </ManualP>
        <ManualSteps
          items={[
            <>
              Select a payment under <Ui>Payments waiting for verification</Ui>. You see the client, what the invoice is for and the
              amount due.
            </>,
            <>
              <B>For a bank transfer,</B> press <Ui>Zoom receipt</Ui> and compare the slip with your bank account: the amount, the
              date and the account it was paid into. Don&apos;t rely on the slip alone.
            </>,
            <>
              <B>For cash,</B> the payment is marked &quot;Paid at the cash desk. Check your till.&quot; Approve it only once the
              money is in your hand.
            </>,
            <>
              <B>For a print order,</B> press <Ui>View order</Ui> to see the framed prints the payment is for.
            </>,
            <>
              Press <Ui>Approve</Ui>, or <Ui>Reject</Ui> and choose the reason.
            </>,
          ]}
        />
        <ManualTable
          head={["You press", "What happens"]}
          rows={[
            [
              <Ui key="a">Approve</Ui>,
              <>
                The invoice is marked paid under your name, and the client is emailed. A deposit confirms the booking, issues the
                balance invoice and creates the gallery. A balance unlocks the full-resolution photos. A print order moves to New.
              </>,
            ],
            [
              <Ui key="r">Reject</Ui>,
              <>
                You choose a reason, such as an unreadable slip, a wrong amount, or cash that was not received. The client is
                emailed and asked for a new slip. The booking and its slot are kept for another {deposit}.
              </>,
            ],
          ]}
        />
        <ManualList
          items={[
            <>
              After approving or rejecting, the confirmation offers a <Ui>WhatsApp Receipt</Ui> or <Ui>WhatsApp Notice</Ui> button
              to message the client as well.
            </>,
            <>
              <Ui>WhatsApp client</Ui> on a payment opens a chat with them, for when a slip needs a question rather than a
              rejection.
            </>,
            <>The lower part of the page keeps a record of every payment already settled: who verified it and when.</>,
            <>Team members who are not the owner can see the queue but can&apos;t approve or reject.</>,
          ]}
        />
        <ManualCallout tone="warning" title="An approval can't be undone here">
          Once an invoice is paid, the booking is confirmed and the client is told. There is no button to reverse it. Check the
          money has really arrived before you approve.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="invoices" title="The Invoices page">
        <ManualP>
          <ManualLink href={`${admin}/invoices`}>Finance → Invoices</ManualLink> lists every invoice your studio has issued, with
          the totals <Ui>Outstanding</Ui> and <Ui>Collected</Ui>. Filter by status or invoice type, or search by number, client,
          booking or project. Open an invoice to act on it:
        </ManualP>
        <ManualTable
          head={["Action", "Who", "What it does"]}
          rows={[
            [
              <Ui key="r">Record payment</Ui>,
              "Owner",
              <>
                For money you received outside the app. You choose how it was paid (cash, bank transfer, QR / DuitNow or the
                studio&apos;s card terminal) and may add a reference. It has the same effect as approving a slip.
              </>,
            ],
            [
              <Ui key="s">Send reminder</Ui>,
              "Any team member",
              "Emails the client the invoice number, the amount and the due date. It works only while something is still owed and the client has an email address.",
            ],
            [
              <Ui key="c">Cancel invoice</Ui>,
              "Owner",
              "Cancels an unpaid invoice. You give a reason. A paid invoice can't be cancelled.",
            ],
            [
              <Ui key="n">New invoice</Ui>,
              "Owner",
              <>
                On the Invoices page. Choose the client, say what it is for, enter the amount and the due date, and tick{" "}
                <Ui>Email the invoice to the client</Ui> if you want it sent.
              </>,
            ],
          ]}
        />
        <ManualList
          items={[
            <>Every invoice can be printed from its page, and the client sees the same document in their account.</>,
            <>
              <B>A booking&apos;s deposit invoice can&apos;t be cancelled while the booking is active.</B> Cancel the booking
              instead, in <ManualLink href={`${admin}/bookings`}>Bookings</ManualLink>; that cancels its unpaid invoices too.
            </>,
            <>
              <B>Cancelling a print order&apos;s invoice cancels the order</B> and gives back any included prints it used.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="statuses" title="Invoice statuses">
        <ManualTable
          head={["Status", "What it means"]}
          rows={[
            [<Ui key="1">Unpaid</Ui>, "Issued and waiting for the client to pay."],
            [<Ui key="2">Awaiting verification</Ui>, "The client says they paid by bank transfer or cash. It is in your Verification queue."],
            [<Ui key="3">Paid</Ui>, "Settled, online or by your approval."],
            [<Ui key="4">Rejected</Ui>, "You rejected the payment slip. The client can upload another."],
            [
              <Ui key="5">Overdue</Ui>,
              "An online payment for a booking was started and never finished, and the booking has been released.",
            ],
            [<Ui key="6">Cancelled</Ui>, "Cancelled by the owner, or by the system when its booking was cancelled. Nothing is owed."],
          ]}
        />
      </ManualSection>

      <ManualSection id="setup" title="Setting up how you get paid">
        <ManualP>
          The owner sets this once in <ManualLink href={`${admin}/settings?tab=payments`}>Settings → Getting paid</ManualLink>:
        </ManualP>
        <ManualTable
          head={["Setting", "What it is for"]}
          rows={[
            [<Ui key="c">Currency</Ui>, "The currency of your prices, invoices and payments."],
            [
              <Ui key="b">Bank transfer</Ui>,
              "Your bank name, account name and account number. Shown at checkout with a button to copy them.",
            ],
            [<Ui key="q">Payment QR code</Ui>, "The QR image clients scan in their banking app."],
            [
              <Ui key="o">Online payments</Ui>,
              "Card and FPX through your own Toyyibpay account. You enter the user secret key and category code from your Toyyibpay dashboard. The money goes straight to your account.",
            ],
          ]}
        />
        <ManualList
          items={[
            <>Online payments work in Malaysian ringgit only. A studio priced in another currency can&apos;t turn them on.</>,
            <>
              <Ui>Turn off online payments</Ui> removes the option at checkout. Clients then pay by bank transfer or cash.
            </>,
            <>Check your bank details and QR code by making a small test booking yourself before you take real ones.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="refunds" title="Refunds and late payments">
        <ManualP>
          The system records what was paid. It does not send money back. A refund is always made by you, from your bank or till.
        </ManualP>
        <ManualList
          items={[
            <>
              <B>Cancelled booking with a paid deposit:</B> the deposit stays on record as paid. Refund it or move the client to a
              new date.
            </>,
            <>
              <B>Online payment that arrives too late:</B> if the client pays after their {online} and the slot is still free, the
              booking is confirmed as normal. If the slot has gone to someone else, the payment is kept on its invoice with a
              &quot;REFUND REQUIRED&quot; note and the client is told the studio will contact them.
            </>,
            <>
              <B>Payment for a cancelled invoice:</B> a cancelled invoice is never turned back into a paid one. The payment is
              flagged for refund instead.
            </>,
            <>
              <B>Cancelled print order that was paid:</B> the order&apos;s notes record that a refund is owed.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="guidelines" title="Guidelines">
        <ManualP>
          <B>Do</B>
        </ManualP>
        <ManualList
          items={[
            <>Open Verification at least once a day. Every waiting payment is a client waiting and a slot nobody else can book.</>,
            <>Match every slip to your bank statement before approving. Edited slips exist.</>,
            <>Approve cash the moment you receive it, so the booking can&apos;t be cancelled for non-payment.</>,
            <>Choose the true reason when you reject. The client reads it and acts on it.</>,
            <>Use Send reminder for balances that are past their due date, before you chase by phone.</>,
          ]}
        />
        <ManualP>
          <B>Don&apos;t</B>
        </ManualP>
        <ManualList
          items={[
            <>Don&apos;t approve a payment to be helpful and collect later. Approval confirms the booking and may unlock the photos.</>,
            <>Don&apos;t record a payment twice: either approve the slip in Verification or use Record payment, never both.</>,
            <>Don&apos;t cancel an invoice to give a discount. Cancel it and issue a new invoice for the agreed amount.</>,
            <>Don&apos;t share the owner&apos;s sign-in so others can approve payments. Each approval is recorded under a name.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="questions" title="Common questions">
        <div className="space-y-5">
          <ManualQa question="A client paid, but the booking still says pending. Why?">
            <p>
              For a bank transfer or cash, the payment is waiting for the owner in Verification. For an online payment, the client
              may not have finished on the bank&apos;s page. The system checks with the payment provider itself; you never need to
              mark an online payment by hand.
            </p>
          </ManualQa>
          <ManualQa question="The client paid the balance in cash on the day. How do I record it?">
            <p>
              Open the invoice in Invoices and press <Ui>Record payment</Ui>, choosing cash. If the client already chose cash in
              their account, approve it in Verification instead.
            </p>
          </ManualQa>
          <ManualQa question="Why can't I approve payments?">
            <p>Only the studio owner can approve, reject, record or cancel payments. Ask the owner to check the queue.</p>
          </ManualQa>
          <ManualQa question="A client can't download their photos. What is missing?">
            <p>
              Almost always the balance. Full-resolution downloads unlock when the final balance is paid. Check the booking&apos;s
              invoices, and approve the payment if it is waiting in Verification.
            </p>
          </ManualQa>
          <ManualQa question="Can I change the amount on an invoice?">
            <p>
              No. Cancel the unpaid invoice and issue a new one with <Ui>New invoice</Ui>. A paid invoice stays as it is.
            </p>
          </ManualQa>
          <ManualQa question="Does the studio pay a fee on payments?">
            <p>
              Bank transfers and cash go directly to you. Online payments go through your own Toyyibpay account, and any fee is
              between you and Toyyibpay.
            </p>
          </ManualQa>
        </div>
      </ManualSection>
    </ManualPage>
  );
}
