import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Sends an invitation email after an invite row is created. Requires a
// signed-in caller; no-op (reported to the client) without RESEND_API_KEY.
export async function POST(request) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, error: 'Not signed in' }, { status: 401 });

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ ok: false, skipped: 'email not configured' });
  }

  const { email, role } = await request.json();
  if (!email) return Response.json({ ok: false, error: 'email required' }, { status: 400 });

  const { data: profile } = await supabase.from('profiles')
    .select('name, email').eq('id', user.id).single();
  const inviter = profile?.name || profile?.email || 'A family member';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const intro = role === 'child'
    ? `${inviter} set up Family Phases for your family — you can see whose house you're at, your schedule, and your to-dos.`
    : `${inviter} invited you to Family Phases, where your family coordinates the kids' schedule, expenses, and reminders in one place.`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.NOTIFY_EMAIL_FROM || 'Family Phases <phases@apps.natearnold.me>',
      to: [email],
      subject: `${inviter} invited you to Family Phases`,
      text: `Hi,\n\n${intro}\n\nTo join, open the app and sign in with this email address (${email}) — your access connects automatically:\n\n${appUrl}\n\nYou'll get a 6-digit sign-in code by email. No password needed.`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return Response.json({ ok: false, error: `send failed: ${detail.slice(0, 200)}` }, { status: 502 });
  }
  return Response.json({ ok: true });
}
