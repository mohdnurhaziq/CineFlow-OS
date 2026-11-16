import type { Metadata } from "next";
import { Store } from "lucide-react";
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

interface ServicesManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Services and your website | Manual | Studio Admin",
  description: "Categories, packages and prices, and the work shown on your public studio page.",
};

const SECTIONS = [
  { id: "in-short", title: "In short" },
  { id: "how-it-fits", title: "How categories, packages and slots fit together" },
  { id: "categories", title: "Categories" },
  { id: "packages", title: "Packages and prices" },
  { id: "website", title: "Your studio website" },
  { id: "showcase", title: "Showing your work" },
  { id: "roles", title: "Who can change what" },
  { id: "guidelines", title: "Guidelines" },
  { id: "questions", title: "Common questions" },
];

/** Manual → Services and your website. */
export default async function ServicesManualPage({ params }: ServicesManualPageProps) {
  const { tenantSlug } = await params;
  const admin = `/${tenantSlug}/admin`;

  return (
    <ManualPage
      tenantSlug={tenantSlug}
      icon={Store}
      area="Studio setup"
      title="Services and your website"
      description="How to set up what you sell (categories, packages and prices) and what visitors see on your public studio page."
      sections={SECTIONS}
    >
      <ManualSection id="in-short" title="In short">
        <ManualList
          items={[
            <>
              A <B>category</B> is a kind of work you offer, such as Convocation or Weddings. A <B>package</B> is something a client
              can buy within a category, with a price and a deposit.
            </>,
            <>
              Both are set up in <ManualLink href={`${admin}/services`}>Catalog &amp; CMS → Services</ManualLink>.
            </>,
            <>
              Your <B>studio website</B> is your public page. It shows your packages, your work and the button to book.
            </>,
            <>
              The work on it comes from <ManualLink href={`${admin}/cms`}>Catalog &amp; CMS → Showcase CMS</ManualLink>.
            </>,
            <>Only the owner, and team members given <Ui>Set prices</Ui>, can change packages and prices.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="how-it-fits" title="How categories, packages and slots fit together">
        <ManualP>Three things have to line up before a client can book and pay the right price:</ManualP>
        <ManualTable
          head={["Thing", "Where", "Its job"]}
          rows={[
            ["Category", "Services", "Groups packages, calendar slots and showcase work under one name."],
            ["Package", "Services", "Sets the price and deposit for a session in that category."],
            ["Slot", "Calendar", "An open time, in one category."],
          ]}
        />
        <ManualP>
          When a client selects a slot, they are offered the packages of <B>that slot&apos;s category</B>, and the package they pick
          sets the deposit they pay now and the balance they pay later. A category with slots but no packages falls back to the fee
          and deposit on the slot itself, which needs the <Ui>Set prices</Ui> tick.
        </ManualP>
        <ManualCallout title="Set up in this order">
          Category first, then its packages, then its slots. A slot in a category with no packages and no slot price gives the
          client nothing to pay for.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="categories" title="Categories">
        <ManualP>
          In Services, press <Ui>New Category</Ui>.
        </ManualP>
        <ManualTable
          head={["Field", "What it is for"]}
          rows={[
            ["Name", "What clients see, for example Convocation Specials."],
            ["Slug", "A short code used in links: lowercase letters, numbers and hyphens only. It must be unique in your studio."],
            ["Badge icon", "An emoji shown beside the name."],
            [<Ui key="a">Active Status</Ui>, "Whether clients see the category."],
            [
              <Ui key="k">Kind of job</Ui>,
              <>
                <Ui>Session</Ui> or <Ui>Production</Ui>. It decides how bookings in this category are listed in Galleries, and
                whether they get shoot days, a shot list and gear.
              </>,
            ],
            ["Description", "An optional summary."],
          ]}
        />
        <ManualList
          items={[
            <>Turn a category off to hide it from clients without losing it, for example a seasonal one such as Raya.</>,
            <>
              A category that still has packages can&apos;t be deleted. Move or delete those packages first. Deleting a
              category needs the <Ui>Set prices</Ui> tick.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="packages" title="Packages and prices">
        <ManualP>
          In Services, the owner, or someone given <Ui>Set prices</Ui>, presses <Ui>New Package</Ui>.
        </ManualP>
        <ManualTable
          head={["Field", "What it is for"]}
          rows={[
            [<Ui key="t">Package Title</Ui>, "The name clients choose."],
            [<Ui key="d">Discipline</Ui>, "Photography, videography or hybrid. A booking made with the package takes this on."],
            [<Ui key="c">Campaign Category</Ui>, "The category it is sold under. It appears on that category's slots."],
            [<Ui key="p">Total Price</Ui>, "The full price of the session."],
            [<Ui key="dp">Deposit Price</Ui>, "What the client pays to book. The rest becomes the balance invoice."],
            [<Ui key="tu">Turnaround</Ui>, "How long delivery takes, for example 7 business days."],
            [<Ui key="ds">Deliverables Scope</Ui>, "What the client receives, in one line."],
            [<Ui key="de">Description</Ui>, "The details: coverage, crew, editing."],
            [
              <Ui key="ip">Included framed prints</Ui>,
              <>
                Framed prints that come with the package. See <ManualLink href={`${admin}/manual/prints`}>Framed prints</ManualLink>.
              </>,
            ],
            [<Ui key="f">Featured Package</Ui>, "Highlights the package on your studio website."],
          ]}
        />
        <ManualList
          items={[
            <>
              <B>A price change affects new bookings only.</B> A booking keeps the deposit and price it was made with.
            </>,
            <>The deposit can&apos;t be more than the total price.</>,
            <>Deleting a package stops clients booking it. Bookings already made with it are not changed.</>,
            <>Anyone with <Ui>Services</Ui>: Manage can turn the Featured mark on or off; editing the rest needs <Ui>Set prices</Ui>.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="website" title="Your studio website">
        <ManualP>
          Press <Ui>View studio website</Ui> at the top of any admin page to open your public page. Visitors see:
        </ManualP>
        <ManualTable
          head={["On the page", "Where it comes from"]}
          rows={[
            [
              "Your studio name, logo, colour, tagline and About text",
              <>
                <ManualLink href={`${admin}/settings`}>Settings → Studio</ManualLink>
              </>,
            ],
            [
              "Your packages and prices",
              <>
                <ManualLink href={`${admin}/services`}>Services</ManualLink>. Featured packages are highlighted.
              </>,
            ],
            [
              "Your portfolio, with a filter by category",
              <>
                <ManualLink href={`${admin}/cms`}>Showcase CMS</ManualLink>
              </>,
            ],
            ["The Book Session button", "Your open slots in the Calendar."],
            [
              "The Wall Art page",
              <>
                Your sizes and frames in <ManualLink href={`${admin}/frames`}>Frames &amp; Prints</ManualLink>. It is a preview;
                visitors can&apos;t order from it.
              </>,
            ],
          ]}
        />
        <ManualP>
          Visitors can also sign in or message you on WhatsApp from the top of the page. Your booking page has its own link, which
          you can send to clients directly.
        </ManualP>
      </ManualSection>

      <ManualSection id="showcase" title="Showing your work">
        <ManualSteps
          items={[
            <>
              Open <ManualLink href={`${admin}/cms`}>Showcase CMS</ManualLink> and press <Ui>New Portfolio Item</Ui>.
            </>,
            <>Enter a title and, if you like, the client or brand name.</>,
            <>Choose the category and discipline, so visitors can filter to the kind of work they want.</>,
            <>Add the cover image. For a film, also add the video link from your video host.</>,
            <>Optionally link the item to the package it was shot under, so a visitor who likes it can find that package.</>,
            <>
              Tick <Ui>Featured Showcase</Ui> to pin it at the top of your page.
            </>,
          ]}
        />
        <ManualList
          items={[
            <>Edit or delete an item at any time. Deleting removes it from your public page at once.</>,
            <>The Showcase is separate from client galleries. Nothing a client receives appears on your website unless you add it here.</>,
          ]}
        />
        <ManualCallout tone="warning" title="Only publish work you may show">
          Put a client&apos;s photos on your website only with their agreement. For productions, the signed release forms are your
          record of that permission.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="roles" title="Who can change what">
        <ManualTable
          head={["Task", "Who can do it"]}
          rows={[
            ["Create, edit or delete a package", <>The owner, and anyone given <Ui key="a">Set prices</Ui></>],
            ["Mark a package as featured", <>The owner, and anyone with <Ui key="b">Services</Ui>: Manage</>],
            ["Create or edit a category, turn it on or off", <>The owner, and anyone with <Ui key="c">Services</Ui>: Manage</>],
            ["Delete a category", <>The owner, and anyone given <Ui key="d">Set prices</Ui></>],
            ["Add, edit or delete showcase items", <>The owner, and anyone with <Ui key="e">Catalog &amp; website</Ui>: Manage</>],
            ["Add, edit or delete print sizes and frames", <>The owner, and anyone with <Ui key="f">Catalog &amp; website</Ui>: Manage</>],
          ]}
        />
        <ManualP>
          Someone with only <Ui>View</Ui> on an area sees its pages without edit buttons. The owner sets this per person in{" "}
          <ManualLink href={`${admin}/manual/team`}>Team, roles and assigning shoots</ManualLink>.
        </ManualP>
      </ManualSection>

      <ManualSection id="guidelines" title="Guidelines">
        <ManualP>
          <B>Do</B>
        </ManualP>
        <ManualList
          items={[
            <>Keep to a few clear packages per category. Three well-named choices book better than eight similar ones.</>,
            <>Write the deliverables as numbers the client can check: how many photos, how long, by when.</>,
            <>Open your studio website after every change and read it as a client would.</>,
            <>Refresh your showcase regularly, and feature the kind of work you want more of.</>,
          ]}
        />
        <ManualP>
          <B>Don&apos;t</B>
        </ManualP>
        <ManualList
          items={[
            <>Don&apos;t change a category&apos;s slug once clients have links to it.</>,
            <>Don&apos;t delete a seasonal category. Turn it off and turn it on again next season.</>,
            <>Don&apos;t set the deposit so low that a no-show costs you the day. The deposit is what a cancelled client leaves behind.</>,
            <>Don&apos;t open slots for a category before it has a package.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="questions" title="Common questions">
        <div className="space-y-5">
          <ManualQa question="A client says no packages appear when they book.">
            <p>
              The slot&apos;s category has no packages. Add a package to that category in Services, or check that the slot was
              created under the category you intended.
            </p>
          </ManualQa>
          <ManualQa question="I raised a price. Do clients who already booked pay more?">
            <p>No. Their booking keeps the price and deposit from the day they booked. The new price applies to new bookings.</p>
          </ManualQa>
          <ManualQa question="Why can't I edit a package?">
            <p>Only the owner, and team members given the <Ui>Set prices</Ui> tick, can change packages and prices. Others see them but can&apos;t save changes.</p>
          </ManualQa>
          <ManualQa question="How do I run a limited-time offer?">
            <p>
              Create a category for it with its own package and slots. When it ends, turn the category off. Its bookings and
              galleries stay as they are.
            </p>
          </ManualQa>
          <ManualQa question="Can I hide a package without deleting it?">
            <p>
              There is no hide switch on a package. To stop selling it, delete it, or move it to a category you have turned off.
            </p>
          </ManualQa>
        </div>
      </ManualSection>
    </ManualPage>
  );
}
