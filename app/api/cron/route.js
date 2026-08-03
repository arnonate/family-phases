import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Emails any un-emailed notifications. Wire to Vercel Cron (see vercel.json).
// No-op unless RESEND_API_KEY is set.
export async function GET() {
  if (!process.env.RESEND_API_KEY) {
    return Response.json({ ok: true, skipped: 'RESEND_API_KEY not set' });
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const { data: pending } = await admin.from('notifications')
    .select('*, profiles(email, name)').eq('emailed', false).limit(50);
  let sent = 0;
  for (const n of pending || []) {
    const to = n.profiles?.email;
    if (to) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Family Phases <notifications@resend.dev>',
          to: [to],
          subject: 'Family Phases update',
          text: `${n.message}\n\nOpen Family Phases: ${process.env.NEXT_PUBLIC_APP_URL || ''}`,
        }),
      });
      if (res.ok) sent++;
    }
    await admin.from('notifications').update({ emailed: true }).eq('id', n.id);
  }
  return Response.json({ ok: true, sent });
}
