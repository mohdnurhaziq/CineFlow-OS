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
import { AREA_LABELS, LEVEL_LABELS, TICK_LABELS } from "@/lib/team/access-labels";
import { studioPath } from "@/lib/domain-name";

interface TeamManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Team, roles and assigning shoots | Manual | Studio Admin",
  description: "Inviting team members, roles and access, removing people, assigning shoots and the My schedule page.",
};

const SECTIONS = [
  { id: "in-short", title: "In short" },
  { id: "access", title: "Roles and access" },
  { id: "starter-roles", title: "Starter roles" },
  { id: "inviting", title: "Inviting someone" },
  { id: "changing", title: "Changing access" },
  { id: "removing", title: "Removing and bringing back" },
  { id: "assigning", title: "Assigning shoots" },
  { id: "schedule", title: "My schedule" },
  { id: "owner-only", title: "What only the owner can do" },
  { id: "guidelines", title: "Guidelines" },
  { id: "questions", title: "Common questions" },
];

/** Manual → Team, roles and assigning shoots. Labels come from lib/team/access-labels.ts, the same file the screens use. */
export default async function TeamManualPage({ params }: TeamManualPageProps) {
  const { tenantSlug } = await params;
  const admin = studioPath(tenantSlug, "/admin");

  return (
    <ManualPage
      tenantSlug={tenantSlug}
      icon={Users}
      area="Studio setup"
      title="Team, roles and assigning shoots"
      description="How to invite your team, decide what each person can open and change, and say who shoots each booking."
      sections={SECTIONS}
    >
      <ManualSection id="in-short" title="In short">
        <ManualList
          items={[
            <>
              The owner invites team members in <ManualLink href={`${admin}/settings?tab=team`}>Settings → Team</ManualLink>. Each
              person gets their own sign-in.
            </>,
            <>
              Access is set by <B>roles</B> that you define, such as Photographer or Front desk. You can add extras for one person.
            </>,
            <>
              A role gives a <B>level</B> for each area of the admin console, plus up to three ticks for money.
            </>,
            <>
              A booking can have one or more people <B>assigned</B>. They are emailed, and the booking appears in their{" "}
              <Ui>My schedule</Ui>.
            </>,
            <>Team and Studio settings stay with the owner. They can&apos;t be given to anyone.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="access" title="Roles and access">
        <ManualP>
          A role has a level for each of nine areas. The owner always has full access.
        </ManualP>
        <ManualTable
          head={["Level", "What the person can do in that area"]}
          rows={[
            [
              <Ui key="n">{LEVEL_LABELS.NONE}</Ui>,
              "The area is hidden. They can't open its pages.",
            ],
            [
              <Ui key="o">{LEVEL_LABELS.OWN}</Ui>,
              <>
                Only the bookings or galleries they are assigned to, and the full work on those: for example marking their
                session done or a no-show, or uploading and removing their photos. This level exists for{" "}
                <Ui>{AREA_LABELS.bookings}</Ui> and <Ui>{AREA_LABELS.galleries}</Ui> only.
              </>,
            ],
            [
              <Ui key="v">{LEVEL_LABELS.VIEW}</Ui>,
              <>
                Look, but not change: for example they can&apos;t mark a session done or upload photos. The exception is on-set
                tasks: ticking shots, checking gear out and in, flagging gear for service and collecting release forms.
              </>,
            ],
            [<Ui key="m">{LEVEL_LABELS.MANAGE}</Ui>, "Look and change everything in that area, apart from what needs a tick below."],
          ]}
        />
        <ManualP>The nine areas:</ManualP>
        <ManualList
          items={[
            <>
              <Ui>{AREA_LABELS.bookings}</Ui>: bookings, the calendar and assigning people to shoots.
            </>,
            <>
              <Ui>{AREA_LABELS.galleries}</Ui>: client galleries and uploading photos.
            </>,
            <>
              <Ui>{AREA_LABELS.production}</Ui>: shoot days, call sheets, shot lists, release forms and equipment.
            </>,
            <>
              <Ui>{AREA_LABELS.printOrders}</Ui>: print orders, including ordering prints for a client.
            </>,
            <>
              <Ui>{AREA_LABELS.clients}</Ui>: the client directory and private notes.
            </>,
            <>
              <Ui>{AREA_LABELS.proposals}</Ui>: quotes for larger jobs and the add-on catalogue.
            </>,
            <>
              <Ui>{AREA_LABELS.invoices}</Ui>: invoices, prices, deposits and balances.
            </>,
            <>
              <Ui>{AREA_LABELS.services}</Ui>: categories and packages.
            </>,
            <>
              <Ui>{AREA_LABELS.catalog}</Ui>: the showcase, print sizes, frames and shipping.
            </>,
          ]}
        />
        <ManualP>
          <B>Three ticks</B> cover decisions about money. They sit beside the levels, on a role or on one person:
        </ManualP>
        <ManualTable
          head={["Tick", "What it allows"]}
          rows={[
            [
              <Ui key="a">{TICK_LABELS.approvePayments.title}</Ui>,
              "Approve or reject bank-transfer and cash payments in Verification.",
            ],
            [
              <Ui key="r">{TICK_LABELS.recordPayments.title}</Ui>,
              <>
                Record money received outside the app, cancel invoices, and cancel bookings or orders that have a payment.
                Recording a payment on an invoice that has a slip waiting also needs <Ui>{TICK_LABELS.approvePayments.title}</Ui>.
              </>,
            ],
            [
              <Ui key="p">{TICK_LABELS.setPrices.title}</Ui>,
              "Change packages and slot fees, delete a category, send proposals and create invoices.",
            ],
          ]}
        />
        <ManualCallout title="Each part of a page follows its own area">
          Money (prices, deposits, invoices, balances and gear day rates) shows only to people with <Ui>{AREA_LABELS.invoices}</Ui>: View or more.
          Proposals on a client&apos;s page show only with <Ui>{AREA_LABELS.proposals}</Ui>: View or more. A page that someone can
          only view hides its edit buttons.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="starter-roles" title="Starter roles">
        <ManualP>
          A new studio with no team starts with four roles. You can change or delete them, and add your own with{" "}
          <Ui>New role</Ui>.
        </ManualP>
        <ManualTable
          head={["Role", "Access"]}
          rows={[
            [
              "Photographer, Videographer",
              <>
                <Ui key="a">{AREA_LABELS.bookings}</Ui> and <Ui key="b">{AREA_LABELS.galleries}</Ui>: Only their own.{" "}
                <Ui key="c">{AREA_LABELS.production}</Ui>: View.
              </>,
            ],
            [
              "Crew",
              <>
                <Ui key="a">{AREA_LABELS.bookings}</Ui>: Only their own. <Ui key="b">{AREA_LABELS.production}</Ui>: View.
              </>,
            ],
            [
              "Front desk",
              <>
                <Ui key="a">{AREA_LABELS.bookings}</Ui>, <Ui key="b">{AREA_LABELS.clients}</Ui> and{" "}
                <Ui key="c">{AREA_LABELS.printOrders}</Ui>: Manage. <Ui key="d">{AREA_LABELS.galleries}</Ui> and{" "}
                <Ui key="e">{AREA_LABELS.invoices}</Ui>: View.
              </>,
            ],
          ]}
        />
        <ManualP>
          A studio that already had a team before roles existed got a role named after each person&apos;s title, with Manage on
          every area and no money ticks. Nothing changed for them.
        </ManualP>
      </ManualSection>

      <ManualSection id="inviting" title="Inviting someone">
        <ManualSteps
          items={[
            <>
              Open <ManualLink href={`${admin}/settings?tab=team`}>Settings → Team</ManualLink> and press{" "}
              <Ui>Invite team member</Ui>.
            </>,
            <>Enter their name and email, and choose a role.</>,
            <>Add extra access for this person if they need more than the role gives. This is optional.</>,
            <>Send the invite.</>,
          ]}
        />
        <ManualList
          items={[
            <>
              They get an email with a link to set a password. The link works for <B>30 days</B>. The link is also shown to you, so
              you can copy it and send it on WhatsApp.
            </>,
            <>
              The Team tab shows each person as <Ui>Active</Ui>, <Ui>Invited</Ui>, <Ui>Link expired</Ui> or <Ui>Removed</Ui>.{" "}
              <Ui>Resend link</Ui> sends a new link to someone who has not set a password yet.
            </>,
            <>
              An email that belongs to a client of your studio, to the owner, or to someone already on the team is refused. A
              removed person is brought back instead of invited again.
            </>,
            <>The same email can be on the team at another studio. It is a separate account.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="changing" title="Changing access">
        <ManualList
          items={[
            <>
              Change a role in the roles list below the team: edit its levels and ticks. Everyone with that role gets the change.
            </>,
            <>Change one person with Edit on their row: switch their role or add extras.</>,
            <>
              A change applies on the person&apos;s <B>next page</B>. They don&apos;t need to sign out.
            </>,
            <>A role can&apos;t be deleted while people have it, and a studio&apos;s last role can&apos;t be deleted.</>,
            <>Role names must be different from each other. Capital letters don&apos;t count as a difference.</>,
            <>The owner&apos;s own row can&apos;t be changed.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="removing" title="Removing and bringing back">
        <ManualList
          items={[
            <>A removed person is signed out at once. They can&apos;t sign in: the page says the account was removed by the studio.</>,
            <>Their name stays on past work, such as bookings already done.</>,
            <>Upcoming bookings assigned to them become unassigned, so you can pick someone else.</>,
            <>
              <Ui>Bring back</Ui> lets them sign in again. It does <B>not</B> put them back on the bookings they lost.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="assigning" title="Assigning shoots">
        <ManualP>
          Anyone can be assigned who is the owner or an active team member. A booking can have several people. Assigning needs{" "}
          <Ui>{AREA_LABELS.bookings}</Ui>: Manage.
        </ManualP>
        <ManualSteps
          items={[
            <>
              Open the booking: from the <ManualLink href={`${admin}/bookings`}>Bookings</ManualLink> list, the full booking page,
              or the booking pop-up in the Calendar.
            </>,
            <>
              In the <Ui>Team</Ui> section, add or remove people.
            </>,
          ]}
        />
        <ManualList
          items={[
            <>
              The Bookings list has a <Ui>Team</Ui> column and an <Ui>Unassigned</Ui> filter. It shows upcoming pending or confirmed
              bookings with nobody assigned.
            </>,
            <>
              To assign many at once, tick several bookings, press <Ui>Assign</Ui> and pick one person for all of them.
            </>,
            <>
              The Overview says how many upcoming bookings have nobody assigned, if you have <Ui>{AREA_LABELS.bookings}</Ui>:
              View or more. It links to the Unassigned filter.
            </>,
          ]}
        />
        <ManualP>
          <B>Emails.</B> A person is emailed when they are assigned, when their booking is moved, when it is cancelled (including
          when it is cancelled automatically for an unpaid deposit) and when they are removed from it. Nobody is emailed about
          assigning themselves.
        </ManualP>
      </ManualSection>

      <ManualSection id="schedule" title="My schedule">
        <ManualP>
          <ManualLink href={`${admin}/schedule`}>My schedule</ManualLink> is in the menu for every team member and the owner. Team
          members land on it after signing in. The owner lands on the Overview.
        </ManualP>
        <ManualList
          items={[
            <>It shows your own sessions, grouped under Today, Tomorrow and then by date.</>,
            <>
              Each session shows the time, the client&apos;s name with <Ui>Call</Ui> and <Ui>WhatsApp</Ui>, the category and
              package, the brief, and who else is on it.
            </>,
            <>
              <Ui>Open gallery</Ui> appears when you can open that gallery.
            </>,
            <>Prices are never shown.</>,
            <>
              <Ui>Past sessions</Ui> shows the recent ones.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="owner-only" title="What only the owner can do">
        <ManualList
          items={[
            <>
              <B>Team and roles:</B> invite, change and remove people, and edit roles.
            </>,
            <>
              <B>Studio settings:</B> the studio, payment and photo delivery settings.
            </>,
          ]}
        />
        <ManualP>
          These can&apos;t be given to a team member, by role or as an extra. Everything else can. See{" "}
          <ManualLink href={`${admin}/manual/settings-and-team`}>Settings and your team</ManualLink>.
        </ManualP>
      </ManualSection>

      <ManualSection id="guidelines" title="Guidelines">
        <ManualP>
          <B>Do</B>
        </ManualP>
        <ManualList
          items={[
            <>Give each person the smallest access that lets them do their job. Add more later.</>,
            <>Use Only their own for people who shoot, so they see just their own work.</>,
            <>Check Unassigned every morning, so every booking has someone on it.</>,
            <>Remove a leaver the day they go.</>,
          ]}
        />
        <ManualP>
          <B>Don&apos;t</B>
        </ManualP>
        <ManualList
          items={[
            <>Don&apos;t share one sign-in. You lose the record of who did what.</>,
            <>Don&apos;t give the money ticks to everyone. Give them to the few who need them.</>,
            <>Don&apos;t expect Bring back to restore bookings. Assign them again.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="questions" title="Common questions">
        <div className="space-y-5">
          <ManualQa question="Someone says they can't see a page.">
            <p>
              Their role has None for that area. Open their row in Settings → Team and check the role and any extras.
            </p>
          </ManualQa>
          <ManualQa question="The invite email didn't arrive.">
            <p>
              Press <Ui>Resend link</Ui>, or copy the link shown and send it to them yourself. If the status says{" "}
              <Ui>Link expired</Ui>, resend it.
            </p>
          </ManualQa>
          <ManualQa question="I can't delete a role.">
            <p>
              Someone still has it, or it is the studio&apos;s last role. Move the people to another role first, and keep at least
              one role.
            </p>
          </ManualQa>
          <ManualQa question="Can the owner be assigned to a booking?">
            <p>Yes. The owner and every active team member can be assigned.</p>
          </ManualQa>
          <ManualQa question="Why can't I invite this email?">
            <p>
              It is already a client of your studio, the owner or on the team. If the person was removed, use{" "}
              <Ui>Bring back</Ui> on their row.
            </p>
          </ManualQa>
        </div>
      </ManualSection>
    </ManualPage>
  );
}
