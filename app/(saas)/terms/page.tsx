import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, LegalSection } from "@/components/saas/legal-page";
import { publicContactEmail } from "@/lib/landing/contact";
import { GRACE_DAYS, TRIAL_DAYS } from "@/lib/billing/state";

export const metadata: Metadata = {
  title: "Terms of Service | CineFlow OS",
  description: "The rules for using CineFlow OS: accounts, plans and payment, your content, and what we each promise.",
  alternates: { canonical: "/terms" },
};

const SECTIONS = [
  { id: "agreement", title: "Agreement and who may use CineFlow OS" },
  { id: "service", title: "The service" },
  { id: "accounts", title: "Accounts and your team" },
  { id: "studio", title: "What studios are responsible for" },
  { id: "plans", title: "Plans, the trial and payment" },
  { id: "content", title: "Your content" },
  { id: "use", title: "Using CineFlow OS properly" },
  { id: "availability", title: "Availability and changes" },
  { id: "liability", title: "Our responsibility" },
  { id: "ending", title: "Ending your use" },
  { id: "law", title: "Governing law" },
  { id: "contact", title: "Changes and contact" },
];

/** The platform's Terms of Service. The trial and grace figures come from the billing code, so they can't drift. */
export default function TermsPage() {
  const email = publicContactEmail();
  const mail = (
    <a href={`mailto:${email}`} className="text-amber-400 hover:text-amber-300">
      {email}
    </a>
  );

  return (
    <LegalPage
      title="Terms of Service"
      updated="26 November 2026"
      sections={SECTIONS}
      intro={
        <>
          <p>
            These terms are the agreement between CineFlow OS (&quot;we&quot;) and a photo or video studio (&quot;you&quot;) that uses
            CineFlow OS. Please read them before you create a studio. If you are invited to join someone else&apos;s studio, they apply
            to you as a member of that team.
          </p>
          <p>
            How we handle personal information is in our{" "}
            <Link href="/privacy" className="text-amber-400 hover:text-amber-300">
              Privacy Policy
            </Link>
            .
          </p>
        </>
      }
    >
      <LegalSection id="agreement" number={1} title="Agreement and who may use CineFlow OS">
        <p>
          By creating a studio, or by using CineFlow OS as a member of a studio&apos;s team, you agree to these terms. CineFlow OS is
          for businesses. You must be at least 18, and you must have the authority to accept these terms for your studio.
        </p>
        <p>
          A studio&apos;s clients use CineFlow OS to book, pay and see their photos. They are the studio&apos;s clients, not ours, and
          their agreement is with the studio.
        </p>
      </LegalSection>

      <LegalSection id="service" number={2} title="The service">
        <p>
          CineFlow OS is software for running a studio: an online booking calendar, payment tracking, client galleries, print
          orders, proposals and a team workspace, together with a website for your studio. Which features you have depends on your
          plan.
        </p>
        <p>
          CineFlow OS is in a private beta. Features can change, and we may ask for your feedback. We will tell you before we change
          something you depend on in a way that affects how you work.
        </p>
      </LegalSection>

      <LegalSection id="accounts" number={3} title="Accounts and your team">
        <LegalList
          items={[
            "Keep your sign-in details to yourself. You are responsible for what is done with your account.",
            "The studio owner decides who is on the team and what each person can do. The owner is responsible for the people they invite and for removing anyone who should no longer have access.",
            "Give us correct details, and tell us if you think someone else has got into your account.",
            "One email address can be used at several studios with one sign-in. Each studio's information stays separate.",
          ]}
        />
      </LegalSection>

      <LegalSection id="studio" number={4} title="What studios are responsible for">
        <LegalList
          items={[
            "Your studio is the business that deals with its clients. Bookings, prices, refunds, deliveries and any dispute are between you and your client. We are not a party to them.",
            "Payments from clients go to you, by bank transfer, QR code, cash or, if you set it up, your own Toyyibpay account. We record payments; we do not hold your money or refund it.",
            "You are responsible for the information you keep about your clients. Under Malaysia's Personal Data Protection Act 2010 (PDPA) that means telling them what you collect and why, and only using it for that. We process it on your behalf, following your instructions.",
            "You must have the right to upload the photos, videos and other content you put into CineFlow OS, and the permission of the people in them where the law or good practice requires it.",
          ]}
        />
      </LegalSection>

      <LegalSection id="plans" number={5} title="Plans, the trial and payment">
        <LegalList
          items={[
            `A new studio starts with a ${TRIAL_DAYS}-day free trial with everything unlocked. Then it moves to the plan you chose.`,
            "Plan prices are in Malaysian ringgit (MYR) and are shown in the Pricing section of our website when you choose.",
            "You pay by bank transfer or DuitNow. We record your payment and your plan runs to the day we enter. We email you 7 days before it ends.",
            `If a plan ends without payment, the studio keeps working as before for ${GRACE_DAYS} days, with a warning. After that the studio is paused: its information stays safe and can be read, but it is read-only and online booking is closed. When you pay, it opens again.`,
            "Fees cover the period they are paid for. We do not refund part of a period you have already paid for, unless the law requires it or we agree in writing.",
            "We will tell you before a plan's price changes. A change does not affect a period you have already paid for.",
          ]}
        />
      </LegalSection>

      <LegalSection id="content" number={6} title="Your content">
        <p>
          Your studio&apos;s photos, videos, text and client information stay yours (or your clients&apos; where they own them). You
          give us permission to store, process and show them, only as needed to run CineFlow OS for you: for example, showing a
          client their gallery or putting your portfolio on your studio&apos;s website.
        </p>
        <p>
          CineFlow OS itself, including its design and software, belongs to us. These terms give you the right to use it, not to
          copy it or sell it on.
        </p>
      </LegalSection>

      <LegalSection id="use" number={7} title="Using CineFlow OS properly">
        <p>You agree not to:</p>
        <LegalList
          items={[
            "break the law, or upload anything unlawful, or that infringes someone else's rights,",
            "try to get into accounts or studios that are not yours, or look for ways around the service's protections,",
            "overload the service, or use it to send spam or harmful software, or",
            "resell CineFlow OS or present it as your own.",
          ]}
        />
        <p>If you break these rules we may warn you, pause your studio or close it. We will tell you why.</p>
      </LegalSection>

      <LegalSection id="availability" number={8} title="Availability and changes">
        <p>
          We work to keep CineFlow OS running and we take regular backups, but we cannot promise that it will always be available or
          free of errors. We may sometimes pause it briefly to update it.
        </p>
        <p>
          We may improve or change features. If we make a change to these terms that matters, we will tell studio owners by email
          and update the date at the top.
        </p>
      </LegalSection>

      <LegalSection id="liability" number={9} title="Our responsibility">
        <p>
          We provide CineFlow OS with reasonable care, but to the extent the law allows we are not responsible for losses that
          come indirectly from using it, such as lost bookings or income. Where we are responsible, our total liability to you is
          limited to the fees you paid us in the 3 months before the problem arose. Nothing in these terms limits a responsibility
          that cannot lawfully be limited.
        </p>
        <p>
          Please keep your own copies of photos and records that are important to you. CineFlow OS is not a long-term archive.
        </p>
      </LegalSection>

      <LegalSection id="ending" number={10} title="Ending your use">
        <p>
          You can stop using CineFlow OS at any time. To close your studio, or to ask for a copy of your studio&apos;s information
          first, write to {mail}. We may end or pause your access if you break these terms or do not pay, as described above.
        </p>
        <p>
          When a studio closes, we delete or anonymise its information as set out in the Privacy Policy. Parts of these terms that
          are meant to carry on, such as the sections on liability and governing law, do.
        </p>
      </LegalSection>

      <LegalSection id="law" number={11} title="Governing law">
        <p>
          These terms are governed by the laws of Malaysia, and the courts of Malaysia can decide any dispute about them. We would
          always prefer to sort a problem out with you first, so please write to us.
        </p>
      </LegalSection>

      <LegalSection id="contact" number={12} title="Changes and contact">
        <p>
          Questions about these terms: {mail}. The current version is always on this page.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
