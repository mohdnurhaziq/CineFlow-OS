import type { Metadata } from "next";
import { Settings } from "lucide-react";
import {
  B,
  ManualCallout,
  ManualLink,
  ManualList,
  ManualP,
  ManualPage,
  ManualQa,
  ManualSection,
  ManualTable,
  Ui,
} from "@/components/admin/manual/manual-ui";

interface SettingsManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Settings and your team | Manual | Studio Admin",
  description: "Every setting explained, who can sign in, and what the owner and other team members can each do.",
};

const SECTIONS = [
  { id: "in-short", title: "In short" },
  { id: "studio", title: "Studio: name, address and look" },
  { id: "payments", title: "Getting paid" },
  { id: "delivery", title: "Photo delivery" },
  { id: "plan", title: "Plan" },
  { id: "roles", title: "Your team's roles" },
  { id: "owner-only", title: "What only the owner can do" },
  { id: "sign-in", title: "Signing in and passwords" },
  { id: "guidelines", title: "Guidelines" },
  { id: "questions", title: "Common questions" },
];

/** Manual → Settings and your team. */
export default async function SettingsManualPage({ params }: SettingsManualPageProps) {
  const { tenantSlug } = await params;
  const admin = `/${tenantSlug}/admin`;

  return (
    <ManualPage
      tenantSlug={tenantSlug}
      icon={Settings}
      area="Studio setup"
      title="Settings and your team"
      description="What every setting does, who can sign in to the admin console, and which tasks are kept for the studio owner."
      sections={SECTIONS}
    >
      <ManualSection id="in-short" title="In short">
        <ManualList
          items={[
            <>
              <ManualLink href={`${admin}/settings`}>Settings</ManualLink> has four tabs: <Ui>Studio</Ui>, <Ui>Getting paid</Ui>,{" "}
              <Ui>Photo delivery</Ui> and <Ui>Plan</Ui>.
            </>,
            <>
              Each tab has one <Ui>Save changes</Ui> button at the bottom. It tells you when you have unsaved changes, and{" "}
              <Ui>Discard</Ui> undoes them.
            </>,
            <>
              There are two levels of access in the admin console: the <B>studio owner</B>, and <B>other team members</B>.
            </>,
            <>Anything that moves money, sets a price or changes how the studio is set up is kept for the owner.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="studio" title="Studio: name, address and look">
        <ManualTable
          head={["Setting", "What it does"]}
          rows={[
            [<Ui key="n">Studio name</Ui>, "Your name on your website, emails, invoices and the admin console."],
            [<Ui key="w">What you shoot</Ui>, "Photography, videography or both. It is shown beside your studio name."],
            [
              <Ui key="a">Studio address</Ui>,
              "The last part of your web address, in lowercase letters, numbers and hyphens. Every client link contains it.",
            ],
            [
              <Ui key="c">Custom domain</Ui>,
              "Optional. Your own domain, for example studio.example.com. You point the domain at the platform with your DNS provider, and it starts working within a minute of saving.",
            ],
            [<Ui key="l">Logo</Ui>, "Shown on your public pages and emails."],
            [<Ui key="ac">Accent colour</Ui>, "The colour of buttons and highlights on your public pages and emails."],
            [<Ui key="ab">About</Ui>, "A one-line tagline and a longer text about the studio, shown on your public page."],
          ]}
        />
        <ManualCallout tone="warning" title="Changing your studio address breaks old links">
          Links you have already sent to clients (bookings, galleries, invoices) contain the old address and stop working. The
          system asks you to confirm before it changes. Decide on your address once, before you start taking bookings.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="payments" title="Getting paid">
        <ManualTable
          head={["Setting", "What it does"]}
          rows={[
            [<Ui key="c">Currency</Ui>, "The currency of your prices, invoices and payments."],
            [<Ui key="b">Bank transfer</Ui>, "Your bank name, account name and account number, shown at checkout with a copy button."],
            [<Ui key="q">Payment QR code</Ui>, "The QR image clients scan to pay from their banking app. A preview shows how clients see it."],
            [
              <Ui key="o">Online payments</Ui>,
              "Card and FPX payments through your own Toyyibpay account, in Malaysian ringgit only. Without it, clients pay by bank transfer, QR or cash.",
            ],
          ]}
        />
        <ManualP>
          How each method works for the client and for you is explained in{" "}
          <ManualLink href={`${admin}/manual/payments`}>Payments</ManualLink>.
        </ManualP>
      </ManualSection>

      <ManualSection id="delivery" title="Photo delivery">
        <ManualTable
          head={["Setting", "What it does"]}
          rows={[
            [
              <Ui key="b">Before the balance is paid</Ui>,
              <>
                <Ui>Watermarked until paid</Ui>: clients see previews until they pay the balance.{" "}
                <Ui>Full resolution right away</Ui>: clients can download everything as soon as you deliver. Paying the balance
                always releases everything.
              </>,
            ],
            [
              <Ui key="s">Shipping zones</Ui>,
              "Where you deliver framed prints, and the flat fee for each zone. A state in no zone can only choose pickup.",
            ],
          ]}
        />
        <ManualP>
          See <ManualLink href={`${admin}/manual/galleries`}>Galleries</ManualLink> for delivery and{" "}
          <ManualLink href={`${admin}/manual/prints`}>Framed prints</ManualLink> for shipping.
        </ManualP>
      </ManualSection>

      <ManualSection id="plan" title="Plan">
        <ManualP>
          The Plan tab shows your subscription plan, its status and your <Ui>Studio ID</Ui>. Support may ask for the studio ID when
          you contact them; <Ui>Copy studio ID</Ui> copies it. Nothing on this tab can be edited.
        </ManualP>
      </ManualSection>

      <ManualSection id="roles" title="Your team's roles">
        <ManualTable
          head={["Role", "Who it is", "Access"]}
          rows={[
            ["Studio owner", "The person who runs the studio.", "Everything in the admin console."],
            [
              "Photographer, Videographer, Crew",
              "Everyone else on the team.",
              "The whole admin console, except the owner-only tasks below. The three titles describe the person's job; they have the same access.",
            ],
            ["Client", "Your customers.", "Their own account only. They can never open the admin console."],
          ]}
        />
        <ManualList
          items={[
            <>Your name and role are shown at the top right of the admin console.</>,
            <>Each team member has their own sign-in. Approvals, cancellations and collected releases are recorded under the name of the person who did them.</>,
            <>
              <B>There is no screen for adding a team member yet.</B> Team accounts are created for your studio by the platform
              administrator. Ask them to add or remove someone.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="owner-only" title="What only the owner can do">
        <ManualTable
          head={["Area", "Owner-only task"]}
          rows={[
            ["Payments", "Approve or reject a payment in Verification."],
            ["Invoices", "Record a payment, cancel an invoice, create a new invoice."],
            ["Bookings", "Book a customer as already paid. Cancel a booking whose deposit is paid."],
            ["Calendar", "Set a fee or deposit on a slot."],
            ["Print orders", "Cancel an order that has a payment."],
            ["Services", "Create, edit or delete a package. Delete a category."],
            ["Proposals", "Send a proposal."],
            ["Settings", "Change the studio, payment and photo delivery settings."],
          ]}
        />
        <ManualP>
          Everything else is open to the whole team: the calendar, bookings, galleries and uploads, print order fulfilment, shoot
          days, gear, clients, the showcase, frames and sizes, shipping zones, and sending payment reminders.
        </ManualP>
      </ManualSection>

      <ManualSection id="sign-in" title="Signing in and passwords">
        <ManualList
          items={[
            <>Your team and your clients sign in on the same page of your studio website. The system opens the right place for each.</>,
            <>
              <Ui>Forgot password?</Ui> on the sign-in page emails a link to set a new one. It works for team members and clients.
            </>,
            <>
              The sign-out button is at the top right of the admin console. Sign out on shared devices, such as a studio tablet used
              on set.
            </>,
            <>A team member only ever sees their own studio. They can&apos;t open another studio&apos;s admin console.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="guidelines" title="Guidelines">
        <ManualP>
          <B>Do</B>
        </ManualP>
        <ManualList
          items={[
            <>Finish Settings before you share your booking link: logo, payment details and the delivery choice.</>,
            <>Test your payment details with a small booking of your own. A wrong account number costs real money.</>,
            <>Give every team member their own account, and have a leaver&apos;s account removed the day they go.</>,
            <>Keep the owner&apos;s sign-in to the owner. It is the only one that can move money.</>,
          ]}
        />
        <ManualP>
          <B>Don&apos;t</B>
        </ManualP>
        <ManualList
          items={[
            <>Don&apos;t change your studio address once clients have links.</>,
            <>Don&apos;t share one sign-in across the team. You lose the record of who did what.</>,
            <>Don&apos;t switch the currency after you have issued invoices. Existing amounts are not converted.</>,
            <>Don&apos;t turn on Full resolution right away unless you accept delivering before you are fully paid.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="questions" title="Common questions">
        <div className="space-y-5">
          <ManualQa question="How do I add a new photographer to the admin console?">
            <p>
              Ask the platform administrator to create a team account for your studio. There is no screen for it in the admin
              console yet.
            </p>
          </ManualQa>
          <ManualQa question="Can I give a team member permission to approve payments?">
            <p>No. Approving payments is tied to the owner role and can&apos;t be granted to others.</p>
          </ManualQa>
          <ManualQa question="I saved a custom domain but it doesn't open.">
            <p>
              The domain must point to the platform at your DNS provider. Check the record there; a new record can take a while to
              spread across the internet. Your normal studio address keeps working in the meantime.
            </p>
          </ManualQa>
          <ManualQa question="Why is online payment greyed out?">
            <p>
              Online payments work in Malaysian ringgit only. Set your currency to ringgit and save, then connect your Toyyibpay
              account.
            </p>
          </ManualQa>
          <ManualQa question="Does changing the delivery setting affect galleries I already delivered?">
            <p>
              Yes. The setting applies to every gallery whose balance is still unpaid, including ones already delivered. Galleries
              whose balance is paid are always fully released.
            </p>
          </ManualQa>
        </div>
      </ManualSection>
    </ManualPage>
  );
}
