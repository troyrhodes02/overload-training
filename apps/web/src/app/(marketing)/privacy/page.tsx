import type { ReactNode } from "react";
import Link from "next/link";
import { PRIVACY_POLICY_PATH } from "@overload/shared/legal/privacy";
import { supportEmail } from "@/lib/accounts/support-email";
import { publicPageMetadata } from "@/lib/marketing/site";

/**
 * The privacy policy (OVE-265; Pitch 21l Gate 4). One public page for the
 * website and the iPhone app. Every statement here was checked against the
 * code and the Production configuration on the date below; the owner's
 * runbook (docs/pitches/mvp-5b-mobile-app/chores/ove-265-privacy-policy)
 * lists the facts only the owner can confirm. Change the words only together
 * with what Overload actually does, and move the date when you do.
 *
 * It reads nothing about the visitor and renders the same for everyone, so
 * it is static: public, no auth session, no account work (it is in
 * MARKETING_PATHS).
 */

/** The publication date shown on the page. Move it with every change. */
export const PRIVACY_POLICY_UPDATED_ON = "2026-11-26";

export const metadata = publicPageMetadata({
  path: PRIVACY_POLICY_PATH,
  title: "Privacy Policy · Overload",
  description:
    "What Overload collects on the website and the iPhone app, why, who helps run it, how long it's kept, and how to export or delete your data.",
});

function formatUpdatedOn(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

const SECTIONS = [
  { id: "who-we-are", title: "Who runs Overload" },
  { id: "what-we-collect", title: "What we collect" },
  { id: "how-we-use-it", title: "How we use it" },
  { id: "who-we-share-it-with", title: "Who we share it with" },
  { id: "cookies", title: "Cookies and storage on your device" },
  { id: "security", title: "How we protect it" },
  { id: "retention", title: "How long we keep it" },
  { id: "your-choices", title: "Your choices and rights" },
  { id: "iphone-and-testflight", title: "The iPhone app and TestFlight" },
  { id: "children", title: "Children" },
  { id: "where", title: "Where your data is processed" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const title = SECTIONS.find((s) => s.id === id)?.title;
  return (
    <section aria-labelledby={id} className="scroll-mt-20 space-y-4">
      <h2 id={id} className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 text-base font-semibold">{children}</h3>;
}

function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-base leading-relaxed text-foreground/90">{children}</p>
  );
}

function List({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-foreground/90 marker:text-muted-foreground">
      {children}
    </ul>
  );
}

const PROVIDERS = [
  {
    name: "Supabase",
    role: "Database, sign-in, and file storage.",
    data: "Your account information, training records, feedback, and screenshots. It also records sign-in events, including IP address and browser or device type, to keep accounts secure.",
  },
  {
    name: "Vercel",
    role: "Hosts the website and the server the iPhone app talks to.",
    data: "Requests to the website and to the app's server pass through it. It keeps short-lived request and error logs, such as IP address, browser or device type, the page requested, and the time.",
  },
  {
    name: "Stripe",
    role: "Payments for Pro subscriptions on the website.",
    data: "Your email address and an Overload account identifier when you start a checkout, plus the card and billing details you enter on Stripe's own pages.",
  },
  {
    name: "Cloudflare Turnstile",
    role: "The bot check when you create an account or request a password reset.",
    data: "Technical signals from your browser or device, such as IP address and browser characteristics.",
  },
  {
    name: "Resend",
    role: "Delivers the account emails our sign-in provider sends.",
    data: "Your email address and the email itself (a password reset or email verification link).",
  },
  {
    name: "Expo",
    role: "Delivers updates to the iPhone app.",
    data: "When the app opens, it asks Expo for updates. The request includes the app's platform and version details, a random identifier for this installation of the app, and your IP address. It doesn't include your account.",
  },
  {
    name: "Apple",
    role: "Distributes the iPhone app through TestFlight and the App Store.",
    data: "See “The iPhone app and TestFlight” below.",
  },
] as const;

export default function PrivacyPolicyPage() {
  const email = supportEmail();
  const mail = (
    <a
      href={`mailto:${email}`}
      className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
    >
      {email}
    </a>
  );
  return (
    <article className="mx-auto max-w-2xl space-y-12 px-4 py-16 md:py-24">
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated{" "}
          <time dateTime={PRIVACY_POLICY_UPDATED_ON}>
            {formatUpdatedOn(PRIVACY_POLICY_UPDATED_ON)}
          </time>
        </p>
        <P>
          This policy explains what Overload collects when you use the website
          (www.overloadtraining.app) or the Overload iPhone app, why, who helps
          us run the service, how long we keep it, and what you can do about it.
          Both use the same account and the same data.
        </P>
      </header>

      <section
        aria-labelledby="short-version"
        className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 id="short-version" className="text-lg font-semibold">
          The short version
        </h2>
        <List>
          <li>
            We collect what you give us to run your account and your training:
            your name, username, email, and the plans and workouts you log.
          </li>
          <li>
            We don&apos;t sell your information, show ads, or use advertising or
            analytics trackers.
          </li>
          <li>
            A small number of service providers help run Overload, and each gets
            only what its job needs.
          </li>
          <li>
            You can download a copy of your data or delete your account at any
            time, from the website or the app.
          </li>
        </List>
      </section>

      <nav aria-labelledby="contents" className="space-y-3">
        <h2
          id="contents"
          className="text-sm font-medium uppercase tracking-wide text-muted-foreground"
        >
          Contents
        </h2>
        <ol className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="who-we-are">
        <P>
          Overload is a strength training tracker run by one person, William
          Rhodes (&ldquo;we&rdquo; and &ldquo;us&rdquo; in this policy). We are
          responsible for the personal information described here. You can reach
          us at {mail}.
        </P>
      </Section>

      <Section id="what-we-collect">
        <H3>Account information</H3>
        <List>
          <li>
            Your first and last name, username, email address, and password.
            Your password is stored only as a secure hash by our sign-in
            provider. We never store it ourselves and never write it to a log.
          </li>
          <li>
            Your time zone, so &ldquo;today&rdquo; and your schedule match where
            you are, and your appearance setting (light, dark, or system).
          </li>
          <li>
            Facts about the account itself: when you signed up, the last day you
            were active, whether you verified your email, your plan (Free, a Pro
            trial, or Pro), and whether the account is active or suspended.
          </li>
          <li>
            Small records that keep the app working the way you left it, such as
            how far you got in the guided tour and which release notes
            you&apos;ve seen.
          </li>
        </List>

        <H3>Training records</H3>
        <P>
          The training plans you build, the workouts you log (exercises, sets,
          weights, reps, and effort ratings), missed-day choices, cardio
          sessions, goals, your gyms (names and any location you type in), the
          custom exercises you create, and your favorite exercises. Overload
          calculates its progress, hold, and deload calls from these records
          each time you look; it doesn&apos;t keep a separate profile of you.
        </P>

        <H3>Feedback and screenshots</H3>
        <P>
          When you send feedback, we keep the category you choose, your message,
          and any screenshot you choose to attach. On the iPhone, the app opens
          your photos only through the system picker when you choose to attach
          one, and it uploads only the image you pick. Screenshots are kept in
          private storage that only we can open. If you email us, we receive
          your email address and whatever your message contains.
        </P>

        <H3>Subscription and billing information</H3>
        <P>
          If you subscribe to Pro on the website, you pay on Stripe&apos;s own
          checkout pages. We never see or store your full card number. Stripe
          tells us, and we keep, your Stripe customer and subscription
          identifiers, the subscription&apos;s status, billing interval and
          price, the end of the current billing period, and any promo code you
          used. The iPhone app shows your plan but sells nothing.
        </P>

        <H3>Technical and security information</H3>
        <List>
          <li>
            Our hosting and sign-in providers process your IP address, browser
            or device type, and the pages or requests you make, to deliver the
            service, keep it secure, and fix errors.
          </li>
          <li>
            To slow down automated abuse, we count sign-up and password-reset
            attempts and requests to the app&apos;s server. These counters store
            only a scrambled (hashed) key, never your network address or account
            identifier in readable form.
          </li>
          <li>
            The iPhone app sends its version with each request, so the server
            can tell an out-of-date app to update.
          </li>
        </List>

        <H3>What we don&apos;t collect</H3>
        <P>
          We don&apos;t use advertising, analytics, or crash-reporting tools,
          and we don&apos;t track you across other apps or websites. The iPhone
          app doesn&apos;t use your location, contacts, camera, microphone, or
          Apple Health. It doesn&apos;t send you push notifications.
        </P>
        <P>
          Plan import, a planned feature that would read a training plan you
          paste or upload with the help of an AI service, isn&apos;t available.
          We will update this policy before it is.
        </P>
      </Section>

      <Section id="how-we-use-it">
        <P>We use your information only to:</P>
        <List>
          <li>run your account and sign you in on the website and the app;</li>
          <li>
            store your training and show you your plan, history, goals, and
            progress calls;
          </li>
          <li>
            manage your plan and, if you subscribe, your Pro subscription;
          </li>
          <li>
            send the account emails you ask for, such as a password reset or an
            email verification link (we don&apos;t send marketing email);
          </li>
          <li>answer your feedback and support requests;</li>
          <li>
            keep Overload secure, prevent abuse, and find and fix problems;
          </li>
          <li>meet legal obligations, such as keeping billing records.</li>
        </List>
        <P>
          Where a law asks for a legal basis, we rely on providing the service
          you signed up for, our legitimate interest in keeping it secure and
          working, your choice to send something optional (such as a
          screenshot), and legal obligations.
        </P>
      </Section>

      <Section id="who-we-share-it-with">
        <P>
          We don&apos;t sell or rent your personal information, and we
          don&apos;t share it for advertising. No other Overload account can see
          your data. We share information only with the service providers below,
          and only what each needs to do its job for us. Each is bound by its
          terms with us to protect that information and use it only to provide
          its service. Stripe and Apple also handle some information under their
          own privacy policies.
        </P>
        <dl className="divide-y divide-border rounded-xl border border-border">
          {PROVIDERS.map((p) => (
            <div key={p.name} className="space-y-1 p-4">
              <dt className="text-sm font-semibold">{p.name}</dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">
                <span className="text-foreground/90">{p.role}</span> {p.data}
              </dd>
            </div>
          ))}
        </dl>
        <P>
          <strong className="font-semibold">Inside Overload.</strong> Our admin
          tools show your name, email, account status, sign-up and last-active
          dates, plan, and any feedback you send. They don&apos;t show your
          plans, workouts, goals, gyms, or cardio. We look at your account data
          directly only when that&apos;s needed to run or secure the service, to
          fix a problem you report, or when the law requires it.
        </P>
        <P>
          We may also disclose information if the law requires it, to protect
          the rights and safety of our users or others, or as part of a transfer
          of Overload to a new owner, who would be bound by this policy.
        </P>
      </Section>

      <Section id="cookies">
        <P>
          The website uses cookies only to keep you signed in. It also saves a
          few preferences in your browser&apos;s storage, such as your
          appearance setting and notes you&apos;ve dismissed. Stripe&apos;s
          checkout pages and the Cloudflare bot check may set their own cookies
          to work and to prevent fraud. We don&apos;t use advertising or
          analytics cookies, so there is nothing to opt out of. The iPhone app
          keeps your sign-in in the iPhone&apos;s Keychain.
        </P>
      </Section>

      <Section id="security">
        <List>
          <li>
            Everything between your device and Overload is encrypted (HTTPS).
          </li>
          <li>
            Every account&apos;s records are kept separate, and the service is
            built and tested so one account can&apos;t see another&apos;s data.
          </li>
          <li>
            Passwords are handled by our sign-in provider and stored only as
            secure hashes. Card details stay with Stripe.
          </li>
          <li>
            Feedback screenshots are kept in private storage and opened only
            through short-lived links.
          </li>
        </List>
        <P>
          No service can promise perfect security. If something goes wrong that
          affects your information, we will tell you as the law requires.
        </P>
      </Section>

      <Section id="retention">
        <P>
          We keep your account and training records for as long as your account
          exists. Moving from Pro to Free never deletes anything you logged.
        </P>
        <P>
          <strong className="font-semibold">Deleting your account</strong>{" "}
          deletes your profile, training records, gyms, goals, custom exercises,
          and feedback from our database, removes your screenshots from storage,
          and removes your sign-in. It first cancels any active Pro
          subscription. It can&apos;t be undone, so download a copy first if you
          want one. Some information can remain after deletion:
        </P>
        <List>
          <li>
            copies in our database provider&apos;s backups, until those backups
            expire;
          </li>
          <li>
            our hosting providers&apos; short-lived request and error logs,
            until they expire;
          </li>
          <li>
            Stripe&apos;s records of your subscription and payments, which
            Stripe and the law require to be kept;
          </li>
          <li>
            a record of any admin action taken on your account (such as a
            suspension), kept with a random account identifier and no name or
            email;
          </li>
          <li>
            the hashed abuse-prevention counters described above, which hold no
            name, email, or readable network address;
          </li>
          <li>
            emails you sent us, and anything Apple keeps about TestFlight.
          </li>
        </List>
      </Section>

      <Section id="your-choices">
        <List>
          <li>
            <strong className="font-semibold">
              See and download your data.
            </strong>{" "}
            Export a copy of your account&apos;s records, including your profile
            and all your training, as a JSON file, from Settings on the website
            or More &rarr; Export your data in the app. It&apos;s free on every
            plan.
          </li>
          <li>
            <strong className="font-semibold">Correct it.</strong> Change your
            name, username, and time zone in your profile, and edit or correct
            your plans and logged sets. For anything you can&apos;t change
            yourself, such as your email address, contact us.
          </li>
          <li>
            <strong className="font-semibold">Delete it.</strong> Delete your
            account from Settings on the website or More &rarr; Delete account
            in the app, confirmed with your password.
          </li>
          <li>
            <strong className="font-semibold">Withdraw a choice.</strong>{" "}
            Attaching a screenshot is always optional, and you can turn off
            Overload&apos;s photo access in the iPhone&apos;s Settings. To stop
            all use of your information, delete your account.
          </li>
        </List>
        <P>
          Depending on where you live, you may have other rights, such as to ask
          what we hold about you, to object to or restrict some uses, or to
          complain to a data protection authority. Email {mail} and we will
          respond as the law requires. We may ask you to confirm the request
          from your account&apos;s email address. Using a privacy right never
          changes the service you get.
        </P>
      </Section>

      <Section id="iphone-and-testflight">
        <P>
          The iPhone app uses the same account and data as the website. It talks
          to Overload&apos;s server and to Supabase (sign-in and exercise
          images), shows the Cloudflare bot check when you sign up or reset your
          password, and checks Expo for updates when it opens, as described
          above.
        </P>
        <P>
          If you test the app through Apple&apos;s TestFlight, Apple shares some
          information with us so we can run the beta: the email address you were
          invited with (and your name, if you gave it), your installs and
          sessions, crash reports from your device if you allow them, and any
          feedback or screenshots you send through TestFlight. Apple&apos;s own
          privacy policy covers what Apple collects. We use this only to run and
          improve the beta.
        </P>
      </Section>

      <Section id="children">
        <P>
          Overload isn&apos;t meant for children under 13, and we don&apos;t
          knowingly collect their personal information. If you believe a child
          under 13 has created an account, contact us and we will delete it.
        </P>
      </Section>

      <Section id="where">
        <P>
          Overload is run from the United States, and our providers store and
          process your information in the United States. If you use Overload
          from elsewhere, your information is transferred there.
        </P>
      </Section>

      <Section id="changes">
        <P>
          When this policy changes, we will post the new version here and update
          the date at the top. If a change is significant, we will also let you
          know in Overload before it takes effect.
        </P>
      </Section>

      <Section id="contact">
        <P>
          Questions or requests about your privacy: {mail}. You can also send a
          message from Overload: Send feedback on the website or More &rarr;
          Send feedback in the app. More help is on the{" "}
          <Link
            href="/support"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            support page
          </Link>
          .
        </P>
      </Section>
    </article>
  );
}
