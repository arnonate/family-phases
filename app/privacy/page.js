import Link from 'next/link';

export const metadata = { title: 'Privacy — Family Phases' };

export default function PrivacyPage() {
  return (
    <main className="wrap policy">
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: August 11, 2026</p>

      <h2>What we collect</h2>
      <p>
        Family Phases stores the information you and your family enter to coordinate
        co-parenting: your name and email address, the names of family members you add,
        custody schedules, activities, expenses, to-dos, and comments. We don&apos;t collect
        anything beyond what the app needs to work.
      </p>

      <h2>How it&apos;s used</h2>
      <p>
        Your information is used only to run the service: showing schedules and expenses to
        the people in your family circle, sending notification and digest emails, and keeping
        calendar feeds up to date. We don&apos;t sell your data, show ads, or share your
        information with anyone outside the services that host the app.
      </p>

      <h2>Who can see your data</h2>
      <p>
        Access follows the permissions you set in the app. People you invite see only the
        arrangements they belong to, in the role you gave them — full access for parents and
        partners, read-only for viewers, and a limited schedule view for children&apos;s
        accounts. Database-level rules enforce these boundaries. Calendar feed links grant
        read access to schedule information for anyone who has the link, so treat them as private.
      </p>

      <h2>Children&apos;s accounts</h2>
      <p>
        Child logins are created and controlled by a parent. They are read-only, can&apos;t see
        financial information, and hold no personal data beyond the name and email a parent
        provides.
      </p>

      <h2>Where your data lives</h2>
      <p>
        The app runs on Vercel, data is stored with Supabase, and emails are delivered by
        Resend. Each processes data only to provide their service to us.
      </p>

      <h2>Your choices</h2>
      <p>
        You can edit or delete the content you&apos;ve added at any time in the app. To delete
        your account and its data entirely, email us and we&apos;ll take care of it.
      </p>

      <h2>Changes &amp; contact</h2>
      <p>
        If this policy changes meaningfully, we&apos;ll note it here. Questions:{' '}
        <a href="mailto:phases@apps.natearnold.me">phases@apps.natearnold.me</a>.
      </p>

      <p style={{ marginTop: 28 }}><Link href="/dashboard">← Back to Family Phases</Link></p>
    </main>
  );
}
