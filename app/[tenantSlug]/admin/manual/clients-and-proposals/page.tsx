import type { Metadata } from "next";
import { Users } from "lucide-react";
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

interface ClientsManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Clients and proposals | Manual | Studio Admin",
  description: "The client directory, client accounts, and quoting larger jobs with proposals the client signs online.",
};

const SECTIONS = [
  { id: "in-short", title: "In short" },
  { id: "directory", title: "The client directory" },
  { id: "accounts", title: "Client accounts: registered, invited, guest" },
  { id: "client-page", title: "A client's page" },
  { id: "proposals", title: "What a proposal is" },
  { id: "send", title: "Sending a proposal" },
  { id: "signing", title: "What happens when the client signs" },
  { id: "addons", title: "Optional extras (add-ons)" },
  { id: "guidelines", title: "Guidelines" },
  { id: "questions", title: "Common questions" },
];

/** Manual → Clients and proposals. */
export default async function ClientsManualPage({ params }: ClientsManualPageProps) {
  const { tenantSlug } = await params;
  const admin = `/${tenantSlug}/admin`;

  return (
    <ManualPage
      tenantSlug={tenantSlug}
      icon={Users}
      area="Clients & Sales"
      title="Clients and proposals"
      description="How to find and look after your clients, what the three kinds of client account mean, and how to quote a larger job with a proposal the client signs online."
      sections={SECTIONS}
    >
      <ManualSection id="in-short" title="In short">
        <ManualList
          items={[
            <>
              <ManualLink href={`${admin}/clients`}>Clients</ManualLink> lists everyone with an account at your studio, with their
              bookings, galleries and balance.
            </>,
            <>A client appears there by themselves, the first time they book or create an account. You don&apos;t add clients by hand.</>,
            <>
              A <B>proposal</B> is a quote for a larger job. The client reviews it, chooses extras and signs it online.
            </>,
            <>Signing a proposal starts a production and issues its first invoice, with no booking slot involved.</>,
            <>Only the studio owner can send a proposal.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="directory" title="The client directory">
        <ManualP>
          Open <ManualLink href={`${admin}/clients`}>Clients</ManualLink>. Each row shows the client&apos;s contact details, how
          many bookings and galleries they have, what they have paid, and when they were last active.
        </ManualP>
        <ManualList
          items={[
            <>Search by name, email or phone.</>,
            <>
              Filter by account type, or by <Ui>Balance due</Ui> to list only clients who still owe you money.
            </>,
            <>
              <Ui>Export CSV</Ui> downloads the clients currently shown, with the search and filter applied, for a mailing list or
              your own records.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="accounts" title="Client accounts: registered, invited, guest">
        <ManualTable
          head={["Badge", "What it means", "Can they sign in?"]}
          rows={[
            [<Ui key="r">Registered</Ui>, "The client has set a password.", "Yes."],
            [
              <Ui key="i">Invited</Ui>,
              "The client was sent a link to set a password and hasn't used it yet.",
              "Not until they set a password.",
            ],
            [<Ui key="g">Guest</Ui>, "The client was booked without making an account.", "Not until they claim the account."],
          ]}
        />
        <ManualList
          items={[
            <>
              A customer your team books by hand gets an account automatically. They claim it by signing up with the same email, or
              from the link in their confirmation email.
            </>,
            <>
              A client who has lost their link can use <Ui>Forgot password?</Ui> on the sign-in page, or you can resend the booking
              confirmation from their booking.
            </>,
            <>One email address is one client at your studio. Two clients can&apos;t share an email.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="client-page" title="A client's page">
        <ManualP>Select a client to open their page. It brings together everything about them:</ManualP>
        <ManualTable
          head={["Section", "What it shows"]}
          rows={[
            ["Summary", "The number of bookings and galleries, the total paid and the balance due."],
            ["Contact", "Name, email and phone, which you can edit."],
            [
              "Studio notes",
              "Private notes about the client: preferences, reminders, anything the team should know before the next session. Only your team sees them.",
            ],
            ["Bookings, Galleries, Invoices, Proposals", "Every record for this client, each linking to its own page."],
          ]}
        />
        <ManualCallout tone="warning" title="Changing a client's email changes how they sign in">
          Clients sign in with their email. After you save a new address, they must sign in with it. Tell the client before you
          change it, and never change it to an address that belongs to someone else.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="proposals" title="What a proposal is">
        <ManualP>
          A booking suits a session with a fixed package and an open time slot. A proposal suits a job you need to quote: a wedding,
          a brand campaign, an event. It has its own price, terms and optional extras.
        </ManualP>
        <ManualTable
          head={["", "Booking", "Proposal"]}
          rows={[
            ["Starts with", "The client picking a time on your booking page.", "The owner writing a quote for one client."],
            ["Price", "The package's price.", "A base price you enter, plus the extras the client chooses."],
            ["Confirmed by", "Paying the deposit.", "The client signing online."],
            ["First invoice", "Booking deposit.", "Project retainer."],
            ["Creates", "A session or production gallery.", "A production, with shoot days, shot list and gear."],
          ]}
        />
      </ManualSection>

      <ManualSection id="send" title="Sending a proposal">
        <ManualSteps
          items={[
            <>
              Open <ManualLink href={`${admin}/proposals`}>Finance → Proposals</ManualLink> and press <Ui>New proposal</Ui>.
            </>,
            <>Choose an existing client, or enter a new client&apos;s name, email and optional phone.</>,
            <>Enter the project title, the category and the discipline (photography or videography).</>,
            <>
              Enter the <Ui>Base price</Ui> and the <Ui>Deposit to book (%)</Ui>, between 10 and 100.
            </>,
            <>
              Review the <Ui>Terms the client agrees to</Ui>. They start from a standard set covering booking, balance, changes,
              cancellation and usage; edit them for this client.
            </>,
            <>
              Tick <Ui>Email the proposal to the client</Ui> and send. You also get a <Ui>Proposal link</Ui> to copy and share
              yourself.
            </>,
          ]}
        />
        <ManualP>The proposals list shows where each one stands:</ManualP>
        <ManualTable
          head={["Status", "What it means"]}
          rows={[
            [<Ui key="a">Awaiting Signature</Ui>, "Sent. The client has not signed yet."],
            [<Ui key="s">Signed &amp; Accepted</Ui>, "The client signed. The production exists and the retainer invoice is issued."],
          ]}
        />
        <ManualP>
          A proposal is sent the moment you create it; there is no draft to come back to. A client who doesn&apos;t want it simply
          doesn&apos;t sign, and it stays as <Ui>Awaiting Signature</Ui>.
        </ManualP>
      </ManualSection>

      <ManualSection id="signing" title="What happens when the client signs">
        <ManualSteps
          items={[
            <>The client opens the link and signs in. Only the client the proposal is addressed to can sign it.</>,
            <>They read the scope and terms and tick the extras they want. The total updates as they choose.</>,
            <>They draw their signature, type their legal name and accept the terms.</>,
            <>
              <B>The retainer invoice is issued,</B> for the deposit percentage of the total, due in 7 days. It is listed as{" "}
              <Ui>Project retainer</Ui>.
            </>,
            <>
              <B>The production appears</B> in <ManualLink href={`${admin}/projects`}>Galleries</ManualLink>, ready for shoot days,
              gear and, later, the photos.
            </>,
            <>
              When the retainer is paid, the <Ui>Project final balance</Ui> invoice is issued for the rest. Paying it unlocks the
              client&apos;s master files.
            </>,
          ]}
        />
        <ManualList
          items={[
            <>Once a proposal is signed, its extras and price can no longer change. For a change of scope, send a new proposal or issue a separate invoice.</>,
            <>The signed proposal stays available to you and the client as a record of what was agreed.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="addons" title="Optional extras (add-ons)">
        <ManualP>
          Add-ons are the extras a client can add to a proposal, such as a second shooter, drone coverage or faster delivery. You
          keep them in a catalogue on the <ManualLink href={`${admin}/proposals`}>Proposals</ManualLink> page and reuse them on
          every proposal.
        </ManualP>
        <ManualTable
          head={["Setting", "What it does"]}
          rows={[
            ["Name and description", "What the client reads when deciding."],
            ["Rate and unit", "A fixed flat fee, a price per hour or a price per day."],
            [<Ui key="p">Pre-Select by Default</Ui>, "The extra is already ticked on new proposals. The client can untick it."],
            [<Ui key="a">Active in Catalog</Ui>, "Whether clients are offered this extra. Turn it off to retire an extra without deleting it."],
          ]}
        />
        <ManualP>
          Press <Ui>New Add-On Template</Ui> to add one. Deleting an add-on only stops it being offered on new proposals.
        </ManualP>
      </ManualSection>

      <ManualSection id="guidelines" title="Guidelines">
        <ManualP>
          <B>Do</B>
        </ManualP>
        <ManualList
          items={[
            <>Write studio notes after every session. The next team member to serve that client will thank you.</>,
            <>Check the client&apos;s email before sending a proposal. Only that account can sign it.</>,
            <>Read the terms each time. The standard set is a starting point, not legal advice for every job.</>,
            <>Keep your add-on catalogue short and clearly priced. Clients choose extras more readily from a few clear options.</>,
          ]}
        />
        <ManualP>
          <B>Don&apos;t</B>
        </ManualP>
        <ManualList
          items={[
            <>Don&apos;t use a proposal for a simple session. A booking is faster for the client and reserves the time slot.</>,
            <>Don&apos;t agree a price change in a chat after signing. Put it in a new proposal or a separate invoice.</>,
            <>Don&apos;t export the client list to share outside the studio. It holds personal contact details.</>,
            <>Don&apos;t write anything in studio notes you would not want the client to read if they asked for their data.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="questions" title="Common questions">
        <div className="space-y-5">
          <ManualQa question="How do I add a client who hasn't booked yet?">
            <p>
              There is no separate button. A client is created when you book for them or send them a proposal with a new email,
              or when they sign up themselves.
            </p>
          </ManualQa>
          <ManualQa question="A proposal doesn't reserve a date. How do I keep the day free?">
            <p>
              Block the day&apos;s slots in the Calendar, so nobody books a session on it. Once the proposal is signed, add the
              shoot day to the production.
            </p>
          </ManualQa>
          <ManualQa question="The client says they can't open the proposal.">
            <p>
              They must be signed in as the client it was sent to. If they have never set a password, they can do so with{" "}
              <Ui>Forgot password?</Ui> on the sign-in page, using the email the proposal went to.
            </p>
          </ManualQa>
          <ManualQa question="Can a team member send a proposal?">
            <p>No. Sending a proposal sets a price, so it is limited to the studio owner. Any team member can manage the add-on catalogue.</p>
          </ManualQa>
          <ManualQa question="Can I delete a client?">
            <p>
              No. A client&apos;s bookings, invoices and photos are part of your studio&apos;s records, so the account stays. You can
              correct their contact details at any time.
            </p>
          </ManualQa>
        </div>
      </ManualSection>
    </ManualPage>
  );
}
