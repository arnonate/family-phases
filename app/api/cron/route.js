import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Emails a single digest per user of their un-emailed, still-unread
// notifications. Wire to Vercel Cron (see vercel.json).
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
    .select('*, profiles(email, name)').eq('emailed', false).limit(200);
  if (!pending?.length) return Response.json({ ok: true, sent: 0 });

  // Group by user; anything already read in-app gets marked emailed silently.
  const byUser = new Map();
  const skipIds = [];
  for (const n of pending) {
    if (n.read || !n.profiles?.email) { skipIds.push(n.id); continue; }
    if (!byUser.has(n.user_id)) byUser.set(n.user_id, { to: n.profiles.email, name: n.profiles.name, items: [] });
    byUser.get(n.user_id).items.push(n);
  }

  let sent = 0;
  for (const { to, name, items } of byUser.values()) {
    const lines = items.map(n => `• ${n.message}`).join('\n');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_EMAIL_FROM || 'Family Phases <phases@apps.natearnold.me>',
        to: [to],
        subject: items.length === 1
          ? 'Family Phases update'
          : `Family Phases: ${items.length} updates`,
        text: `Hi ${name || 'there'},\n\nWhile you were away:\n\n${lines}\n\nOpen Family Phases: ${process.env.NEXT_PUBLIC_APP_URL || ''}`,
      }),
    });
    if (res.ok) {
      sent++;
      await admin.from('notifications').update({ emailed: true })
        .in('id', items.map(n => n.id));
    }
  }
  if (skipIds.length) {
    await admin.from('notifications').update({ emailed: true }).in('id', skipIds);
  }
  return Response.json({ ok: true, sent, skippedAlreadyRead: skipIds.length });
}
