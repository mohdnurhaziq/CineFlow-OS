import type { Metadata } from "next";
import { Frame } from "lucide-react";
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

interface PrintsManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Framed prints and wall art | Manual | Studio Admin",
  description: "Setting up frames and sizes, including prints in a package, and fulfilling a client's print order.",
};

const SECTIONS = [
  { id: "in-short", title: "In short" },
  { id: "catalogue", title: "Your sizes, frames and prices" },
  { id: "included", title: "Prints included in a package" },
  { id: "client-order", title: "How a client orders" },
  { id: "rules", title: "The rules behind an order" },
  { id: "shipping", title: "Pickup, delivery and shipping fees" },
  { id: "fulfil", title: "Fulfilling an order" },
  { id: "cancel", title: "Cancelling an order" },
  { id: "guidelines", title: "Guidelines" },
  { id: "questions", title: "Common questions" },
];

/** Manual → Framed prints and wall art. */
export default async function PrintsManualPage({ params }: PrintsManualPageProps) {
  const { tenantSlug } = await params;
  const admin = `/${tenantSlug}/admin`;

  return (
    <ManualPage
      tenantSlug={tenantSlug}
      icon={Frame}
      area="Galleries & Prints"
      title="Framed prints and wall art"
      description="How to set up the frames and sizes you sell, include prints in a package, and fulfil the orders clients place from their galleries."
      sections={SECTIONS}
    >
      <ManualSection id="in-short" title="In short">
        <ManualList
          items={[
            <>
              Clients order framed prints <B>from their own gallery photos</B>, after seeing each one on a wall in the visualizer.
            </>,
            <>
              A package can <B>include</B> framed prints. The client claims them at no cost, or pays only the difference for a
              bigger size or better frame.
            </>,
            <>
              A client can order only <B>after the final balance is paid</B>.
            </>,
            <>
              Each order has one way of getting it (pickup or delivery), one shipping fee and at most one invoice.
            </>,
            <>
              You fulfil orders in <ManualLink href={`${admin}/print-orders`}>Production → Print orders</ManualLink>.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="catalogue" title="Your sizes, frames and prices">
        <ManualP>
          Set up what you sell in <ManualLink href={`${admin}/frames`}>Catalog &amp; CMS → Frames &amp; Prints</ManualLink>.
        </ManualP>
        <ManualTable
          head={["Item", "Button", "What you set"]}
          rows={[
            [
              "Print size",
              <Ui key="s">Add Print Size</Ui>,
              "A code (such as 8R or 12R), a display name, the width and height, and the base print price.",
            ],
            [
              "Frame",
              <Ui key="f">Add Frame Molding</Ui>,
              "A name, the material, the width, its colour or image, and the price it adds to a print.",
            ],
            [
              "Mat board",
              <Ui key="m">Save mat price</Ui>,
              "One price, added to a framed print when the client chooses a mat board.",
            ],
          ]}
        />
        <ManualList
          items={[
            <>
              <B>The price of a framed print</B> is the size&apos;s price, plus the frame&apos;s price, plus the mat price if the
              client adds a mat. A print has no mat unless the client chooses one.
            </>,
            <>
              Mark a size or frame as <Ui>Hidden</Ui> to stop offering it without deleting it. Orders already placed keep it.
            </>,
            <>
              <Ui>Open Visualizer</Ui> shows your catalogue on the wall exactly as clients see it. Use it to check a new frame.
            </>,
            <>
              <B>The print follows the photo&apos;s shape.</B> The size&apos;s short side is kept and the long side follows the
              photo, so a 3:2 photo on an 8R is printed 8 × 12 inches. The price stays the size&apos;s price.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="included" title="Prints included in a package">
        <ManualSteps
          items={[
            <>
              Open a package in <ManualLink href={`${admin}/services`}>Catalog &amp; CMS → Services</ManualLink> and find{" "}
              <Ui>Included framed prints</Ui>.
            </>,
            <>
              Press <Ui>Add framed print</Ui> and choose the print size, the frame and the quantity. Add more lines for different
              sizes.
            </>,
            <>Save the package. Every booking made with it from now on carries those prints.</>,
          ]}
        />
        <ManualList
          items={[
            <>
              <B>What is promised is fixed at booking.</B> The included prints are copied onto the booking when it is made. Changing
              the package later does not change what earlier clients were promised.
            </>,
            <>
              <B>To give a client an extra print,</B> open their booking, find <Ui>Included prints</Ui> and press{" "}
              <Ui>Grant included print</Ui>. Choose the size, frame and quantity, and add a note saying why. A print you granted
              can be removed again while it is unused.
            </>,
            <>
              <B>Upgrades.</B> A client may claim an included print as a pricier size or frame, or add a mat. They pay only the
              difference between what they chose and what was included.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="client-order" title="How a client orders">
        <ManualSteps
          items={[
            <>
              In their gallery, the client opens <Ui>Framed prints</Ui>. It shows the prints their package includes and how many
              are left.
            </>,
            <>They choose a photo, a size, a frame and optionally a mat, and see it to scale on a wall above a sofa.</>,
            <>They add it to the cart and repeat for other photos.</>,
            <>
              At checkout they choose <Ui>How you get them</Ui>: pickup at the studio, or delivery to an address in a state you
              ship to.
            </>,
            <>
              They confirm. If there is something to pay, they pay it online, by bank transfer or in cash, like any other invoice.
              If everything is included, the checkout says there is nothing to pay.
            </>,
          ]}
        />
        <ManualP>
          <B>Ordering for a client.</B> For a client who asks you in person or by message, open their gallery and press{" "}
          <Ui>Order framed prints for client</Ui>. You build the same cart on their behalf.
        </ManualP>
        <ManualP>
          The <Ui>Wall Art</Ui> page on your public site is a preview only. Visitors can try frames on a sample wall, but ordering
          always happens from a client&apos;s own gallery.
        </ManualP>
      </ManualSection>

      <ManualSection id="rules" title="The rules behind an order">
        <ManualTable
          head={["Rule", "Why"]}
          rows={[
            [
              "The final balance must be paid before ordering or claiming an included print.",
              "Prints are made from the full-resolution files, which are released by the balance.",
            ],
            [
              "One cart becomes one order with one invoice.",
              "The client pays once, and you produce and hand over everything together.",
            ],
            [
              "An order with nothing to pay starts at once.",
              "It contains only included prints, with no upgrade and no shipping. No invoice is created.",
            ],
            [
              "An order with something to pay waits for its payment.",
              <>
                It stays <Ui>Awaiting payment</Ui> until the invoice is paid online or approved in Verification.
              </>,
            ],
            [
              "A photo in a print order can't be removed from the gallery.",
              "You still need the file to produce the print.",
            ],
          ]}
        />
        <ManualP>Order numbers look like PO-2026-0001 and run in order through the year.</ManualP>
      </ManualSection>

      <ManualSection id="shipping" title="Pickup, delivery and shipping fees">
        <ManualP>
          Set where you deliver in <ManualLink href={`${admin}/settings?tab=delivery`}>Settings → Photo delivery</ManualLink>, under{" "}
          <Ui>Shipping zones</Ui>. A zone is a name, a flat fee and the states it covers.
        </ManualP>
        <ManualList
          items={[
            <>
              <B>One fee per order,</B> however many prints it holds. The fee comes from the zone of the delivery address.
            </>,
            <>
              <B>A state that is in no zone can only choose pickup.</B> With no zones at all, every client picks up at the studio.
            </>,
            <>Each state belongs to one zone. A greyed-out state is already in another zone.</>,
            <>A shipping fee is always more than zero. To ship for free, absorb the cost in your print prices instead.</>,
            <>Pickup is always free and always offered.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="fulfil" title="Fulfilling an order">
        <ManualP>
          <ManualLink href={`${admin}/print-orders`}>Production → Print orders</ManualLink> lists every order. The Production menu
          shows a number when new orders are waiting. Open an order to see each print, the client, the fulfilment and the invoice.
        </ManualP>
        <ManualTable
          head={["Status", "What it means", "Your next step"]}
          rows={[
            [
              <Ui key="1">Awaiting payment</Ui>,
              "The client hasn't paid the order's invoice yet.",
              "Nothing to produce yet. Approve the payment in Verification when it arrives.",
            ],
            [
              <Ui key="2">Received</Ui>,
              "Paid, or nothing to pay. Ready for you.",
              <>
                Download each photo with <Ui>Full-res</Ui>, then press <Ui>Start production</Ui>.
              </>,
            ],
            [
              <Ui key="3">In production</Ui>,
              "You are printing and framing.",
              <>
                <Ui>Mark ready for pickup</Ui>, or for a delivery enter the courier and tracking number and press{" "}
                <Ui>Mark shipped</Ui>.
              </>,
            ],
            [
              <>
                <Ui>Ready for pickup</Ui> / <Ui>Shipped</Ui>
              </>,
              "The client has been emailed that the order is ready, or on its way with its tracking number.",
              <>
                <Ui>Mark collected</Ui> or <Ui>Mark delivered</Ui> once the client has it.
              </>,
            ],
            [
              <>
                <Ui>Collected</Ui> / <Ui>Delivered</Ui>
              </>,
              "Finished.",
              "Nothing.",
            ],
            [<Ui key="6">Cancelled</Ui>, "The order was cancelled.", "Refund it if it was paid."],
          ]}
        />
        <ManualList
          items={[
            <>
              The order page shows the exact print size for each photo, including the long side that follows the photo&apos;s shape.
              Produce to those dimensions.
            </>,
            <>
              For a delivery, <Ui>Copy address</Ui> copies the recipient, phone and address for your courier booking.
            </>,
            <>Clients follow the same statuses in their account, so keep them up to date as you work.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="cancel" title="Cancelling an order">
        <ManualList
          items={[
            <>
              <B>The client</B> can cancel their own order only while it is <Ui>Awaiting payment</Ui>, and not while a payment slip
              is waiting for your review.
            </>,
            <>
              <B>Your team</B> can cancel an order with <Ui>Cancel order</Ui> on its page. Only the studio owner can cancel an order
              that has a payment.
            </>,
            <>Included prints used by a cancelled order go back to the client, who can claim them again.</>,
          ]}
        />
        <ManualCallout tone="warning" title="Cancelling a paid order does not refund it">
          The order&apos;s invoice stays paid, and the order&apos;s notes record that a refund is owed. Send the money back yourself,
          outside the app.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="guidelines" title="Guidelines">
        <ManualP>
          <B>Do</B>
        </ManualP>
        <ManualList
          items={[
            <>Set up your sizes, frames and shipping zones before you tell clients about wall art.</>,
            <>Price each size for its largest print. A long photo on an 8R uses more paper than the name suggests.</>,
            <>Move an order through its statuses as you work. The emails to the client are sent by those buttons.</>,
            <>Enter the tracking number when you mark an order shipped, so the client can follow the parcel.</>,
          ]}
        />
        <ManualP>
          <B>Don&apos;t</B>
        </ManualP>
        <ManualList
          items={[
            <>Don&apos;t start producing an order that is still awaiting payment.</>,
            <>Don&apos;t delete a size or frame to retire it. Hide it, so past orders stay readable.</>,
            <>Don&apos;t take print orders by message without recording them. Use Order framed prints for client.</>,
            <>Don&apos;t print from the preview image. Always download the full-resolution file from the order.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="questions" title="Common questions">
        <div className="space-y-5">
          <ManualQa question="A client can't order prints. Why?">
            <p>
              Almost always, their final balance is unpaid. Framed prints open as soon as the balance is paid. Check the
              gallery&apos;s invoices, and approve the payment if it is waiting in Verification.
            </p>
          </ManualQa>
          <ManualQa question="A client can't choose delivery.">
            <p>
              Their state is not in any of your shipping zones, or you have no zones yet. Add the state to a zone in Settings →
              Photo delivery, or arrange pickup.
            </p>
          </ManualQa>
          <ManualQa question="A client wants to cancel a free order of included prints.">
            <p>
              They can&apos;t cancel it themselves. Cancel it for them on the order&apos;s page; the included prints return to
              their allowance.
            </p>
          </ManualQa>
          <ManualQa question="The order says the original file is not available.">
            <p>
              The photo&apos;s full-resolution file can&apos;t be found. Upload the photo again to the client&apos;s gallery, or
              print from your own copy of the file.
            </p>
          </ManualQa>
          <ManualQa question="I changed a frame's price. Do existing orders change?">
            <p>No. An order keeps the prices it was placed at. New carts use the new price.</p>
          </ManualQa>
        </div>
      </ManualSection>
    </ManualPage>
  );
}
