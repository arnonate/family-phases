import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Immediate email for message-board activity, on top of the bell and the
// daily digest (notification rows stay un-emailed so the digest still
// includes them). Requires a signed-in member of the arrangement.
export async function POST(request) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
      // Next caches GET fetches in route handlers; live data must bypass it
      global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  if (!process.env.RESEND_API_KEY) {
    return Response.json({ ok: false, skipped: 'email not configured' });
  }

  const { arrangementId, title, body, kind } = await request.json();
  if (!arrangementId || !title) return Response.json({ ok: false, error: 'missing fields' }, { status: 400 });

  // RLS only returns the arrangement if the caller can see it; membership of
  // a side household is additionally required to fan out email.
  const MEMBERS = 'household_members(user_id, profiles(name, email))';
  const { data: arr } = await supabase.from('arrangements')
    .select(`id,
      h_household:households!arrangements_h_household_id_fkey(${MEMBERS}),
      c_household:households!arrangements_c_household_id_fkey(${MEMBERS})`)
    .eq('id', arrangementId).single();
  if (!arr) return Response.json({ ok: false, error: 'not found' }, { status: 403 });

  const members = ['h_household', 'c_household']
    .flatMap(k => arr[k]?.household_members || []);
  const me = members.find(m => m.user_id === user.id);
  if (!me) return Response.json({ ok: false, error: 'not a member' }, { status: 403 });

  const sender = me.profiles?.name || me.profiles?.email || 'Someone';
  const recipients = members.filter(m => m.user_id !== user.id && m.profiles?.email);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (request?.url ? new URL(request.url).origin : '');

  let sent = 0;
  await Promise.all(recipients.map(async r => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_EMAIL_FROM || 'Family Phases <phases@apps.natearnold.me>',
        to: [r.profiles.email],
        subject: kind === 'reply'
          ? `${sender} replied in "${title}"`
          : `${sender} started a conversation: "${title}"`,
        text: `Hi ${r.profiles.name || 'there'},\n\n${sender} ${kind === 'reply' ? 'replied in' : 'started'} "${title}"${body ? `:\n\n${body}` : '.'}${appUrl ? `\n\nRead and reply: ${appUrl}/messages` : ''}`,
      }),
    });
    if (res.ok) sent++;
  }));
  return Response.json({ ok: true, sent });
}
