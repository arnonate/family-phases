import Link from 'next/link';

export const metadata = { title: 'Terms — Family Phases' };

export default function TermsPage() {
  return (
    <main className="wrap policy">
      <h1>Terms of Service</h1>
      <p className="muted">Last updated: August 11, 2026</p>

      <h2>The service</h2>
      <p>
        Family Phases helps families coordinate custody schedules, expenses, activities, and
        reminders across homes. By creating an account or accepting an invitation, you agree
        to these terms.
      </p>

      <h2>Not legal or financial advice</h2>
      <p>
        The app is a coordination tool. Schedules, expense splits, and records kept here are
        whatever your family agrees they are — they don&apos;t create, modify, or prove legal
        custody arrangements or financial obligations. For those, talk to a professional.
      </p>

      <h2>Your account</h2>
      <p>
        Sign-in is tied to your email address, so keep access to that inbox secure. You&apos;re
        responsible for activity under your account and for only inviting people you intend to
        share your family&apos;s information with.
      </p>

      <h2>Your content</h2>
      <p>
        What you add stays yours. You give us permission to store it and show it to the people
        in your family circle according to the roles you&apos;ve set — that&apos;s the entire
        use we make of it.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don&apos;t use the app to harass anyone, to store unlawful content, or to attempt to
        access data belonging to families other than your own.
      </p>

      <h2>Availability</h2>
      <p>
        The service is provided as-is, without warranties. We work to keep it reliable but
        can&apos;t promise uninterrupted availability, and we&apos;re not liable for decisions
        made or missed based on information in the app. Keep independent records of anything
        legally important.
      </p>

      <h2>Ending things</h2>
      <p>
        You can stop using the service and request deletion of your data at any time. We may
        suspend accounts that violate these terms.
      </p>

      <h2>Changes &amp; contact</h2>
      <p>
        If these terms change meaningfully, we&apos;ll note it here. Questions:{' '}
        <a href="mailto:phases@apps.natearnold.me">phases@apps.natearnold.me</a>.
      </p>

      <p style={{ marginTop: 28 }}><Link href="/dashboard">← Back to Family Phases</Link></p>
    </main>
  );
}
