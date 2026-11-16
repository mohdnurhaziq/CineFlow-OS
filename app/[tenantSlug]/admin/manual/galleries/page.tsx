import type { Metadata } from "next";
import { Images } from "lucide-react";
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

interface GalleriesManualPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Galleries and photo delivery | Manual | Studio Admin",
  description: "Uploading a client's photos, telling them they are ready, and what the client can do with them.",
};

const SECTIONS = [
  { id: "in-short", title: "In short" },
  { id: "where", title: "Where galleries come from" },
  { id: "stages", title: "The four steps of a gallery" },
  { id: "upload", title: "Uploading photos and videos" },
  { id: "deliver", title: "Telling the client their photos are ready" },
  { id: "client-view", title: "What the client can do" },
  { id: "paywall", title: "Previews, the balance and full-resolution files" },
  { id: "guidelines", title: "Guidelines" },
  { id: "questions", title: "Common questions" },
];

/** Manual → Galleries and photo delivery. */
export default async function GalleriesManualPage({ params }: GalleriesManualPageProps) {
  const { tenantSlug } = await params;
  const admin = `/${tenantSlug}/admin`;

  return (
    <ManualPage
      tenantSlug={tenantSlug}
      icon={Images}
      area="Galleries & Prints"
      title="Galleries and photo delivery"
      description="How to upload a client's photos, tell them they are ready, and what the client sees and can do in their gallery."
      sections={SECTIONS}
    >
      <ManualSection id="in-short" title="In short">
        <ManualList
          items={[
            <>
              Every confirmed booking and every signed proposal has a <B>gallery</B>. You never create one by hand.
            </>,
            <>
              You upload the finished photos to the gallery, then press one button to tell the client they are ready.
            </>,
            <>
              The client views their photos online, marks favourites, asks for retouches and downloads their files.
            </>,
            <>
              By default the client sees <B>watermarked previews until the balance is paid</B>. Paying the balance always releases
              the full-resolution files.
            </>,
            <>
              Find every gallery in <ManualLink href={`${admin}/projects`}>Production → Galleries</ManualLink>.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="where" title="Where galleries come from">
        <ManualTable
          head={["Kind", "Created when", "What it has"]}
          rows={[
            [
              <Ui key="s">Session</Ui>,
              "A booking in a quick-session category (convocation, portrait, Raya) is confirmed.",
              "Photos and payments.",
            ],
            [
              <Ui key="p">Production</Ui>,
              "A booking in a production category (wedding, commercial, event) is confirmed, or a client signs a proposal.",
              "Photos and payments, plus shoot days, a shot list and gear.",
            ],
          ]}
        />
        <ManualList
          items={[
            <>
              The category decides the kind. You set it per category in{" "}
              <ManualLink href={`${admin}/services`}>Catalog &amp; CMS → Services</ManualLink>.
            </>,
            <>
              You can change one gallery&apos;s kind under <Ui>Project type</Ui> at the bottom of its page.
            </>,
            <>
              A booking that is still pending has no gallery yet. It gets one the moment its deposit is paid.
            </>,
            <>
              The Galleries page separates sessions and productions with the chips at the top. From a booking, press{" "}
              <Ui>Upload photos</Ui> or <Ui>Open Project →</Ui> to go straight to its gallery.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="stages" title="The four steps of a gallery">
        <ManualP>
          The top of a gallery shows its progress. It moves forward by itself and never moves back by itself.
        </ManualP>
        <ManualTable
          head={["Step", "It gets there when"]}
          rows={[
            [<Ui key="1">Booked</Ui>, "The booking is confirmed."],
            [<Ui key="2">Shot</Ui>, "The session time has passed, or you mark the session done."],
            [<Ui key="3">Editing</Ui>, "You upload the first photo."],
            [<Ui key="4">Delivered</Ui>, "You tell the client their photos are ready."],
          ]}
        />
        <ManualP>
          You can set the step by hand with <Ui>Change</Ui>, for example to correct a mistake. A production shows five stages
          instead: Planning, Shooting, Editing, Client review and Delivered.
        </ManualP>
      </ManualSection>

      <ManualSection id="upload" title="Uploading photos and videos">
        <ManualSteps
          items={[
            <>
              Open the gallery and find <Ui>Photos for</Ui> the client.
            </>,
            <>
              Press <Ui>Choose photos to upload</Ui> and select the files. They start uploading as soon as you add them, and each
              one shows <Ui>Uploading</Ui> then <Ui>Uploaded</Ui>.
            </>,
            <>
              Optionally type an <Ui>Album</Ui> name first, to group the photos, for example &quot;Family&quot; and
              &quot;Solo&quot;.
            </>,
            <>
              If a file fails, press <Ui>Retry</Ui> on it. The others carry on.
            </>,
          ]}
        />
        <ManualList
          items={[
            <>
              Photos must be <B>JPG, PNG, WebP or TIFF, up to 50 MB each</B>. Anything else is refused with a message naming the
              file.
            </>,
            <>
              Upload the finished, full-resolution files. The system makes the watermarked preview itself; you don&apos;t prepare
              one.
            </>,
            <>
              A video is added with a title, a review copy for the client to watch, and the master file they download once it is
              released.
            </>,
            <>
              To take a photo out, press remove on it. The client no longer sees it. A photo that is part of a framed print order
              can&apos;t be removed.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="deliver" title="Telling the client their photos are ready">
        <ManualP>
          Below the photos, the gallery says what the client will get and offers one button:{" "}
          <Ui>Notify the client: photos ready</Ui> (with the client&apos;s first name).
        </ManualP>
        <ManualSteps
          items={[
            <>Upload every photo first. The button refuses to send while the gallery is empty.</>,
            <>
              Read the line under <Ui>Ready to send?</Ui>. It tells you whether the client gets watermarked previews or
              full-resolution downloads.
            </>,
            <>Press the button and confirm. The client is emailed a link to their gallery.</>,
            <>
              You are told whether the email went out. When the client has a phone number on record, you are also offered{" "}
              <Ui>Send on WhatsApp</Ui>.
            </>,
          ]}
        />
        <ManualList
          items={[
            <>The gallery moves to Delivered, and so does the booking it belongs to.</>,
            <>
              If you add more photos later, press the button again; it now reads <Ui>Notify … again</Ui>. The client is not told
              about new photos automatically.
            </>,
            <>
              If email isn&apos;t set up for your studio, nothing is emailed and you are told so. Use WhatsApp in that case.
            </>,
          ]}
        />
      </ManualSection>

      <ManualSection id="client-view" title="What the client can do">
        <ManualP>The client opens the gallery from the email or from their account. There they can:</ManualP>
        <ManualTable
          head={["The client", "What you see"]}
          rows={[
            ["Views every photo and zooms in.", "Nothing."],
            [
              "Marks favourites with the heart.",
              <>
                A heart on the photo, marked <Ui>Client favourite</Ui>, and a count of favourites in the gallery.
              </>,
            ],
            [
              "Adds a retouch note to a photo, describing the change they want.",
              "The note on the photo and in a list under the photos, so nothing is missed.",
            ],
            ["Downloads one photo, their favourites, or everything as a ZIP.", "Nothing. Downloads need the files to be released."],
            ["Watches a video's review copy and downloads its master.", "Nothing."],
            [
              "Orders framed prints from their photos.",
              <>
                An order in <ManualLink href={`${admin}/print-orders`}>Print orders</ManualLink>. See{" "}
                <ManualLink href={`${admin}/manual/prints`}>Framed prints</ManualLink>.
              </>,
            ],
          ]}
        />
        <ManualP>
          Check the favourites and retouch notes before you finish editing. The client chose them so you would act on them.
        </ManualP>
      </ManualSection>

      <ManualSection id="paywall" title="Previews, the balance and full-resolution files">
        <ManualP>
          The owner chooses how delivery works in{" "}
          <ManualLink href={`${admin}/settings?tab=delivery`}>Settings → Photo delivery</ManualLink>, under{" "}
          <Ui>Before the balance is paid</Ui>:
        </ManualP>
        <ManualTable
          head={["Setting", "Before the balance is paid", "After the balance is paid"]}
          rows={[
            [
              <Ui key="w">Watermarked until paid</Ui>,
              "The client sees watermarked previews and can pick favourites and leave retouch notes. Downloads are locked.",
              "Everything is released: single photos, ZIP downloads and video masters.",
            ],
            [
              <Ui key="f">Full resolution right away</Ui>,
              "The client can download everything at once, with the balance still due.",
              "No change.",
            ],
          ]}
        />
        <ManualList
          items={[
            <>
              <B>Paying the balance always releases everything</B>, whichever setting you use. It happens the moment the payment is
              approved or paid online, and the client is emailed.
            </>,
            <>
              The balance is the booking&apos;s <Ui>Session balance</Ui> invoice, or the project&apos;s{" "}
              <Ui>Project final balance</Ui> invoice. See <ManualLink href={`${admin}/manual/payments`}>Payments</ManualLink>.
            </>,
            <>
              A gallery&apos;s <Ui>Payments</Ui> section lists its invoices, so you can see at a glance what is still owed.
            </>,
          ]}
        />
        <ManualCallout tone="warning" title="A downloaded file can't be taken back">
          Once a client has downloaded the full-resolution files, they have them. Choose <Ui>Full resolution right away</Ui> only if
          you are comfortable handing over photos before you are paid in full.
        </ManualCallout>
      </ManualSection>

      <ManualSection id="guidelines" title="Guidelines">
        <ManualP>
          <B>Do</B>
        </ManualP>
        <ManualList
          items={[
            <>Upload to the gallery of the right booking. Check the client&apos;s name and the session date at the top first.</>,
            <>Notify the client only when every photo is uploaded, so they see the complete set.</>,
            <>Read the retouch notes and handle each one before you call a gallery finished.</>,
            <>Use albums for sessions with clearly different sets. They make large galleries much easier for the client.</>,
          ]}
        />
        <ManualP>
          <B>Don&apos;t</B>
        </ManualP>
        <ManualList
          items={[
            <>Don&apos;t send photos by WhatsApp or a shared drive instead. The client then has no reason to pay the balance.</>,
            <>Don&apos;t upload your own watermarked copies. The system already protects previews.</>,
            <>Don&apos;t remove a photo the client has marked as a favourite without telling them.</>,
            <>Don&apos;t change the delivery setting to release one client&apos;s files. It applies to every client. Record their payment instead.</>,
          ]}
        />
      </ManualSection>

      <ManualSection id="questions" title="Common questions">
        <div className="space-y-5">
          <ManualQa question="A booking has no gallery. Why?">
            <p>
              Its deposit is not paid yet, so it is still pending. Once it is confirmed, the gallery appears. An older booking made
              before galleries were automatic shows <Ui>Create gallery</Ui> on its details instead.
            </p>
          </ManualQa>
          <ManualQa question="The client says their photos have a watermark. Is something wrong?">
            <p>
              No. They are looking at previews because the balance is unpaid. Once the balance is paid, the same gallery shows and
              downloads the clean, full-resolution files.
            </p>
          </ManualQa>
          <ManualQa question="The client paid the balance but still can't download.">
            <p>
              Check the invoice. A bank transfer or cash payment unlocks the files only when the owner approves it in Verification.
              If the invoice shows Paid, ask the client to reload the gallery.
            </p>
          </ManualQa>
          <ManualQa question="Can I replace a photo after delivery?">
            <p>
              Yes. Remove the old one, upload the new one and notify the client again so they know. A photo that is in a framed
              print order can&apos;t be removed.
            </p>
          </ManualQa>
          <ManualQa question="How long do galleries stay online?">
            <p>They are not removed automatically. A gallery stays available to the client until your studio removes its photos.</p>
          </ManualQa>
        </div>
      </ManualSection>
    </ManualPage>
  );
}
