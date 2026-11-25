import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, LegalSection } from "@/components/saas/legal-page";
import { publicContactEmail } from "@/lib/landing/contact";

export const metadata: Metadata = {
  title: "Privacy Policy | CineFlow OS",
  description: "What CineFlow OS collects, why, who sees it, how long we keep it, and your rights.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS = [
  { id: "who", title: "Who we are and who this covers" },
  { id: "collect", title: "What we collect" },
  { id: "google", title: "Signing in with Google" },
  { id: "use", title: "How we use it" },
  { id: "share", title: "Who else sees it" },
  { id: "cookies", title: "Cookies and browser storage" },
  { id: "keep", title: "How long we keep it" },
  { id: "security", title: "How we protect it" },
  { id: "rights", title: "Your rights" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact us" },
];

/** The platform's Privacy Policy. Every claim here is checked against the code by tier 44. */
export default function PrivacyPage() {
  const email = publicContactEmail();
  const mail = (
    <a href={`mailto:${email}`} className="text-amber-400 hover:text-amber-300">
      {email}
    </a>
  );

  return (
    <LegalPage
      title="Privacy Policy"
      updated="26 November 2026"
      sections={SECTIONS}
      intro={
        <>
          <p>
            CineFlow OS is software that photo and video studios use to take bookings, get paid and deliver photos. This policy
            explains, in plain language, what personal information we handle, why, and what you can do about it. We follow
            Malaysia&apos;s Personal Data Protection Act 2010 (PDPA).
          </p>
          <p>If something here is unclear, write to us at {mail} and we will explain it.</p>
        </>
      }
    >
      <LegalSection id="who" number={1} title="Who we are and who this covers">
        <p>
          &quot;We&quot; means CineFlow OS. There are two kinds of people whose information passes through the system, and our role
          is different for each:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-white">Studio owners and their team.</strong> When you create a studio or are invited to one,
              we hold your account details to run the service. For this information we are the one responsible for it.
            </>,
            <>
              <strong className="text-white">A studio&apos;s clients.</strong> When you book a session, pay, or view your photos on a
              studio&apos;s website, that studio decides what is collected and why. We store and process it on behalf of the studio,
              following its instructions, and for nothing else. For questions about your photos, your booking, or to ask for
              your information to be corrected or removed, please contact the studio first. We will help the studio act on it.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="collect" number={2} title="What we collect">
        <p>
          <strong className="text-white">Studio owners and team:</strong> your name, email address, phone number (if you add one),
          and your password. Passwords are stored only as a one-way scrambled value, so nobody, including us, can read your
          password. We also keep your studio&apos;s details (name, address, logo, prices, payment instructions), your plan and
          payment status with us, and who on your team has access to what.
        </p>
        <p>
          <strong className="text-white">Clients, on behalf of a studio:</strong> your name, email address and phone number; your
          bookings and the details you give for them; invoices and receipts; whether and how you paid, including proof of payment
          you upload for a bank transfer; delivery details if you order a print; and the photos and videos the studio uploads for
          you, together with the favourites and retouch notes you add to them.
        </p>
        <p>
          <strong className="text-white">Technical information:</strong> we briefly use your network (IP) address to slow down
          repeated sign-in and sign-up attempts and to keep the service safe. We do not build profiles of visitors.
        </p>
      </LegalSection>

      <LegalSection id="google" number={3} title="Signing in with Google">
        <p>
          You can sign in or sign up with Google instead of a password. If you do, Google tells us your name, your email address,
          and a number that identifies your Google account, and that your email address is verified. That is all we ask for.
        </p>
        <p>
          We never see your Google password, and we do not get access to your email, files or contacts. Your Google account is
          also subject to Google&apos;s own privacy policy. You can use an email address and password instead, and you can stop
          using Google sign-in at any time by asking us.
        </p>
      </LegalSection>

      <LegalSection id="use" number={4} title="How we use it">
        <LegalList
          items={[
            "To let you sign in, and to show you the right studio, bookings, invoices and photos.",
            "To run bookings and payments, and to send the emails that go with them: confirmations, payment approvals, changes, reminders, and a notice when photos are ready.",
            "To send studio owners notices about their plan, such as a reminder before it ends.",
            "To keep the service safe, fix problems and answer your questions.",
          ]}
        />
        <p>
          We do not sell your information. We do not use it for advertising, and we do not give it to anyone to advertise to you.
        </p>
      </LegalSection>

      <LegalSection id="share" number={5} title="Who else sees it">
        <LegalList
          items={[
            <>
              <strong className="text-white">The studio.</strong> A studio sees its own clients&apos; information and its own team&apos;s.
              A studio never sees another studio&apos;s information, even when the same person has accounts at both.
            </>,
            <>
              <strong className="text-white">Payment services.</strong> If a studio takes online payments, you pay on the payment
              provider&apos;s own page (Toyyibpay, using the studio&apos;s own account). We do not see or keep your card or online
              banking details. We only record that the payment was made.
            </>,
            <>
              <strong className="text-white">Email delivery.</strong> Emails are sent through an email service set up for the studio or
              for us, which sees the address and the message it is delivering.
            </>,
            <>
              <strong className="text-white">Google,</strong> only if you choose to sign in with it.
            </>,
            <>
              <strong className="text-white">Authorities,</strong> only where the law requires it.
            </>,
          ]}
        />
        <p>We host the service ourselves, on servers we operate.</p>
      </LegalSection>

      <LegalSection id="cookies" number={6} title="Cookies and browser storage">
        <p>
          We use only essential cookies, the kind the service cannot work without. There are no advertising or analytics cookies,
          and no tracking scripts.
        </p>
        <LegalList
          items={[
            "A sign-in cookie that keeps you signed in. When you use one CineFlow login across studios, it is shared across our own addresses so you stay signed in.",
            "Short-lived cookies (ten to fifteen minutes) that make Google sign-in and studio sign-up work safely. They are removed when you finish.",
            "A random code kept in your browser's storage while you book, so the time you chose stays reserved for you.",
          ]}
        />
      </LegalSection>

      <LegalSection id="keep" number={7} title="How long we keep it">
        <p>
          We keep information for as long as the studio&apos;s account is active, because bookings, invoices and galleries need to
          stay available to the studio and its clients. We do not delete client information automatically. When a studio closes,
          or when you ask us and the law allows it, we delete or anonymise the information. Copies in our backups disappear as old
          backups are replaced.
        </p>
      </LegalSection>

      <LegalSection id="security" number={8} title="How we protect it">
        <LegalList
          items={[
            "Passwords are stored as one-way scrambled values, and repeated wrong attempts are slowed down.",
            "People on a studio's team only reach the parts of the studio that the owner has given them.",
            "Full-size photo files are kept in private storage and are released to a client only as the studio's rules allow.",
            "We take regular backups and check that they can be restored.",
          ]}
        />
        <p>
          No system is perfectly secure. If something happens that puts your information at risk, we will tell the studios and
          people affected, and the authorities where the law requires it.
        </p>
      </LegalSection>

      <LegalSection id="rights" number={9} title="Your rights">
        <p>Under the PDPA you can:</p>
        <LegalList
          items={[
            "ask to see the personal information held about you,",
            "ask us to correct it if it is wrong,",
            "withdraw your consent, or ask us to limit how it is used, and",
            "ask for it to be deleted, where the law allows.",
          ]}
        />
        <p>
          If you are a studio&apos;s client, start with the studio. For anything else, or if the studio cannot help, write to {mail}.
          We aim to reply within 21 days. If you are not happy with our answer, you can complain to Malaysia&apos;s Personal Data
          Protection Commissioner.
        </p>
      </LegalSection>

      <LegalSection id="children" number={10} title="Children">
        <p>
          CineFlow OS is for businesses and their clients, and is not meant for anyone under 18 to use on their own. A studio may
          hold photos of children that a parent or guardian has arranged. In that case the studio is responsible for having the
          parent&apos;s or guardian&apos;s permission.
        </p>
      </LegalSection>

      <LegalSection id="changes" number={11} title="Changes to this policy">
        <p>
          If we change this policy in a way that matters, we will update the date at the top and tell studio owners by email. The
          current version is always on this page.
        </p>
      </LegalSection>

      <LegalSection id="contact" number={12} title="Contact us">
        <p>
          Email {mail}. Our{" "}
          <Link href="/terms" className="text-amber-400 hover:text-amber-300">
            Terms of Service
          </Link>{" "}
          explain the rules for using CineFlow OS.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
