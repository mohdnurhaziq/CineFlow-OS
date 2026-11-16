import type { Metadata } from "next";
import { Clapperboard } from "lucide-react";
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

interface ProductionManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Shoot days, crew and gear | Manual | Studio Admin",
  description: "Planning a production: shoot days and call sheets, the shot list, release forms and equipment.",
};

const SECTIONS = [
  { id: "in-short", title: "In short" },
  { id: "which-jobs", title: "Which jobs get these tools" },
  { id: "shoot-days", title: "Shoot days and call sheets" },
  { id: "on-set", title: "On set: the call sheet page" },
  { id: "shot-list", title: "The shot list" },
  { id: "releases", title: "Release forms" },
  { id: "gear", title: "Your gear list" },
  { id: "reservations", title: "Reserving and checking gear" },
  { id: "guidelines", title: "Guidelines" },
  { id: "questions", title: "Common questions" },
];

/** Manual → Shoot days, crew and gear. */
export default async function ProductionManualPage({ params }: ProductionManualPageProps) {
  const { tenantSlug } = await params;
  const admin = `/${tenantSlug}/admin`;

  return (
    <ManualPage
      tenantSlug={tenantSlug}
      icon={Clapperboard}
      area="Production"
      title="Shoot days, crew and gear"
      description="How to plan a production: schedule shoot days, brief the crew with a call sheet, work through a shot list on set, collect signed releases and keep track of equipment."
      sections={SECTIONS}
    >
      <ManualSection id="in-short" title="In short">
        <ManualList
          items={[
            <>
              These tools are for <B>productions</B>: weddings, commercial work, events. A quick studio session doesn&apos;t need
              them and doesn&apos;t show them.
            </>,
            <>
              A <B>shoot day</B> holds the date, location and crew call times. It produces a <B>call sheet</B> page the crew opens
              on their phones.
            </>,
            <>The call sheet page also carries the shot list, golden hour times and release forms for that job.</>,
            <>
              <ManualLink href={`${admin}/inventory`}>Production → Gear &amp; Fleet</ManualLink> is your equipment list. You reserve
              items for a production and log them out and back in.
            </>,
            <>Any team member can use everything on this page.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="which-jobs" title="Which jobs get these tools">
        <ManualP>
          Every job has a gallery, and a gallery is either a <Ui>Session</Ui> or a <Ui>Production</Ui>. Only a production has shoot
          days, a shot list and gear.
        </ManualP>
        <ManualList
          items={[
            <>A booking becomes a production when its category is set to Production in Services. A signed proposal is always a production.</>,
            <>
              To switch one job, open its gallery and change <Ui>Project type</Ui> to{" "}
              <Ui>Production: adds shoot days, shot list and gear</Ui>.
            </>,
            <>A production made from a booking starts with one shoot day already created for the booked date.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="shoot-days" title="Shoot days and call sheets">
        <ManualSteps
          items={[
            <>
              Open the production in <ManualLink href={`${admin}/projects`}>Galleries</ManualLink> and find <Ui>Shoot days</Ui>.
            </>,
            <>
              Press <Ui>Add shoot day</Ui>.
            </>,
            <>
              Enter a title (for example &quot;Day 1: Studio portraits&quot;), the date, the crew call time, the location name and
              address, and an optional map link.
            </>,
            <>
              List the crew, one person per line: name, role, call time, phone. For example: Aina, Photographer, 07:00 AM, +60
              12-345 6789.
            </>,
            <>Add notes for the day if needed, and save.</>,
          ]}
        />
        <ManualList
          items={[
            <>
              Each shoot day has a <Ui>Call sheet</Ui> link. That page is what you share with the crew.
            </>,
            <>
              Deleting a shoot day makes its call sheet link stop working. Anyone who saved the link will no longer be able to open
              it.
            </>,
            <>
              Upcoming shoot days are listed on the <ManualLink href={admin}>Overview</ManualLink>.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="on-set" title="On set: the call sheet page">
        <ManualP>The call sheet page is built for a phone on set. It shows:</ManualP>
        <ManualTable
          head={["Part", "What it gives the crew"]}
          rows={[
            ["General call", "The time everyone is due."],
            ["Filming location", "The address, with a button to open the map pin."],
            [
              "Crew call schedule",
              "Each person's role and call time, with buttons to phone or WhatsApp them. With no crew listed, everyone follows the general call.",
            ],
            ["Golden hour times", "Sunrise, sunset and both golden hours for the shoot date, at the place in the shoot day's map link."],
            ["Production notes", "The notes you wrote for the day."],
            ["Shot list", "Every planned shot, to tick off as you go."],
          ]}
        />
        <ManualList
          items={[
            <>
              <Ui>1-Click WhatsApp Dispatch</Ui> opens WhatsApp with the call sheet written out, ready to send to your crew group.{" "}
              <Ui>Copy Text</Ui> copies the same text for any other app.
            </>,
            <>
              <Ui>Print Call Sheet</Ui> prints a paper copy.
            </>,
            <>
              <Ui>Digital Releases</Ui> opens the release forms for this job.
            </>,
          ]}
        />
        <ManualCallout title="Who can open a call sheet">
          The call sheet page is not public. It opens for your signed-in team and for the job&apos;s own client. A freelancer
          without an account can&apos;t open the link; send them the WhatsApp text or a printed copy instead.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="shot-list" title="The shot list">
        <ManualP>The shot list on the call sheet page is where you plan shots before the day and tick them off during it.</ManualP>
        <ManualSteps
          items={[
            <>
              Press <Ui>Add Shot</Ui>.
            </>,
            <>
              Enter the scene and shot number, the framing, the lens, the lighting setup, and the action or notes. The description
              is required; the rest is optional.
            </>,
            <>
              On set, use the buttons on each shot to mark it <Ui>Queued</Ui>, <Ui>Rolling</Ui> or <Ui>Done</Ui>.
            </>,
          ]}
        />
        <ManualList
          items={[
            <>The progress bar at the top shows how many shots are done.</>,
            <>Filter by scene when a day covers several locations or setups.</>,
            <>The buttons are large on purpose, so the list can be used with gloves or one hand.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="releases" title="Release forms">
        <ManualP>
          A release is a signed permission. The release page collects them on a phone or tablet, on set, without paper.
        </ManualP>
        <ManualTable
          head={["Type", "Signed by", "It permits"]}
          rows={[
            [<Ui key="t">Talent &amp; Likeness</Ui>, "A person who appears in the photos or film.", "Using their image and likeness."],
            [<Ui key="l">Location Filming</Ui>, "The owner or custodian of a place.", "Filming and photographing on the premises."],
          ]}
        />
        <ManualSteps
          items={[
            <>
              Open <Ui>Digital Releases</Ui> from the call sheet page and choose the type.
            </>,
            <>Enter the signer&apos;s name, email, role and optional phone and notes.</>,
            <>Hand them the device. They read the text and sign with a finger, stylus or mouse.</>,
            <>The signed release is saved to the job, with the name of the team member who collected it.</>,
          ]}
        />
        <ManualP>
          Every signed release for the job is listed under <Ui>Executed Clearances Archive</Ui> on the same page. The wording of the
          release forms is fixed. Have your own lawyer confirm it suits your work before you rely on it.
        </ManualP>
      </ManualSection>

      <ManualSection id="gear" title="Your gear list">
        <ManualP>
          <ManualLink href={`${admin}/inventory`}>Production → Gear &amp; Fleet</ManualLink> lists your equipment.
        </ManualP>
        <ManualTable
          head={["Button", "What it does"]}
          rows={[
            [
              <Ui key="a">Add Equipment</Ui>,
              "Adds an item: its name, a SKU you choose, serial number, category, condition, daily rate and where it is stored. Each SKU must be unique.",
            ],
            [
              <Ui key="k">Create Kit Bundle</Ui>,
              "Groups items you always take together, such as a camera body with its lenses and batteries. A kit shows whether every item in it is available.",
            ],
            [
              <Ui key="s">Scan Asset / SKU</Ui>,
              "Finds an item by typing its SKU or scanning its barcode with a handheld scanner, then offers the right action: check out, return, or flag for service.",
            ],
          ]}
        />
        <ManualTable
          head={["Status", "What it means"]}
          rows={[
            [<Ui key="1">Available</Ui>, "On the shelf and free to reserve."],
            [<Ui key="2">Reserved</Ui>, "Set aside for a production and not yet taken out."],
            [<Ui key="3">On a shoot</Ui>, "Checked out."],
            [<Ui key="4">In repair</Ui>, "Quarantined for maintenance. It can't be reserved or checked out."],
          ]}
        />
        <ManualList
          items={[
            <>
              <Ui>Quarantine for Maintenance / Repair</Ui> takes a faulty item out of use.{" "}
              <Ui>Clear Maintenance &amp; Return to Fleet</Ui> puts it back.
            </>,
            <>An item with an active reservation or check-out can&apos;t be deleted. Deleting a kit keeps the items in it.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="reservations" title="Reserving and checking gear">
        <ManualSteps
          items={[
            <>
              <B>Reserve.</B> Open the production&apos;s gallery, find <Ui>Gear</Ui>, choose an item and the dates, and press{" "}
              <Ui>Reserve</Ui>. An item already reserved or out during those dates is refused, so two crews can&apos;t be promised
              the same camera.
            </>,
            <>
              <B>Check out.</B> Before the shoot, log the pre-shoot check on the item (from the Gear page or by scanning it). You
              tick the checklist and note anything unusual. The item becomes <Ui>On a shoot</Ui>.
            </>,
            <>
              <B>Check in.</B> When it comes back, log the return check. Flag any damage or fault. A clean item goes back to{" "}
              <Ui>Available</Ui>; a flagged one goes to <Ui>In repair</Ui>.
            </>,
          ]}
        />
        <ManualList
          items={[
            <>
              A reservation that was never checked out can be cancelled with <Ui>Release</Ui> in the production&apos;s Gear section.
            </>,
            <>Once an item is checked out, check it in rather than releasing the reservation.</>,
            <>The Gear page keeps the record of every reservation and both checks, so you can see who had what and how it came back.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="guidelines" title="Guidelines">
        <ManualP>
          <B>Do</B>
        </ManualP>
        <ManualList
          items={[
            <>Send the call sheet the evening before, and again if anything changes.</>,
            <>Build the shot list with the client&apos;s brief open. It is the simplest way to make sure nothing they asked for is missed.</>,
            <>Collect releases before the camera rolls, not afterwards.</>,
            <>Do the return check on the day the gear comes back, while any damage is still fresh in everyone&apos;s mind.</>,
          ]}
        />
        <ManualP>
          <B>Don&apos;t</B>
        </ManualP>
        <ManualList
          items={[
            <>Don&apos;t delete a shoot day to reschedule it. Its call sheet link dies. Add the new day first, then tell the crew.</>,
            <>Don&apos;t take gear out without reserving it. The next production will see it as available when it isn&apos;t.</>,
            <>Don&apos;t skip the pre-shoot check to save time. It is the record that the item left in good condition.</>,
            <>Don&apos;t reuse a SKU from a retired item. Each SKU identifies one physical item.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="questions" title="Common questions">
        <div className="space-y-5">
          <ManualQa question="I don't see Shoot days on a job. Why?">
            <p>
              The job is a session. Change its <Ui>Project type</Ui> to Production at the bottom of its gallery page, and the shoot
              days, shot list and gear sections appear.
            </p>
          </ManualQa>
          <ManualQa question="Can the client see the call sheet?">
            <p>Yes, if they have the link and are signed in. Keep notes on the call sheet professional.</p>
          </ManualQa>
          <ManualQa question="Why can't I reserve an item?">
            <p>
              Either it is quarantined for maintenance, or it is already reserved or checked out for dates that overlap yours. Pick
              other dates or another item.
            </p>
          </ManualQa>
          <ManualQa question="Do I need a barcode scanner?">
            <p>
              No. You can type the SKU. A USB or Bluetooth scanner simply types it for you, which is faster when you handle a lot of
              gear.
            </p>
          </ManualQa>
          <ManualQa question="Are the golden hour times accurate?">
            <p>
              They are calculated from the shoot date and the place in the shoot day&apos;s map link, so always add a map link.
              Without one the times are only approximate. Hills, buildings and weather still decide the light you actually get.
            </p>
          </ManualQa>
        </div>
      </ManualSection>
    </ManualPage>
  );
}
