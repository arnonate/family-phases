import { createClient } from '@supabase/supabase-js';
import { daySummary, activityOn, listNames } from '@/lib/custody';

export const dynamic = 'force-dynamic';

// Emails a single digest per user of all their un-emailed notifications —
// including ones already read in-app, so the email is a complete daily record —
// plus today's custody schedule and activities.
// Wire to Vercel Cron (see vercel.json). No-op unless RESEND_API_KEY is set.
export async function GET(request) {
  if (!process.env.RESEND_API_KEY) {
    return Response.json({ ok: true, skipped: 'RESEND_API_KEY not set' });
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  // Prefer the configured URL; Vercel cron hits the real domain, so the
  // request origin is a solid fallback.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (request?.url ? new URL(request.url).origin : '');
  const { data: pending } = await admin.from('notifications')
    .select('*, profiles(email, name)').eq('emailed', false).limit(200);
  if (!pending?.length) return Response.json({ ok: true, sent: 0 });

  // Group by user (skip only rows with no deliverable address).
  const byUser = new Map();
  const skipIds = [];
  for (const n of pending) {
    if (!n.profiles?.email) { skipIds.push(n.id); continue; }
    if (!byUser.has(n.user_id)) byUser.set(n.user_id, { userId: n.user_id, to: n.profiles.email, name: n.profiles.name, items: [] });
    byUser.get(n.user_id).items.push(n);
  }

  // Everything needed to describe today, for every arrangement at once —
  // filtered per recipient below.
  const { data: arrs } = await admin.from('arrangements')
    .select(`*, children(*), schedules(*), deviations(*), activities(*), member_identities(user_id, identity),
      h_household:households!arrangements_h_household_id_fkey(household_members(user_id, profiles(name))),
      c_household:households!arrangements_c_household_id_fkey(household_members(user_id, profiles(name)))`);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  const sideMembers = (a, side) => a[side + '_household']?.household_members || [];
  const parentName = (a, side, fallback) => {
    const members = sideMembers(a, side);
    const parent = members.find(m => (a.member_identities || [])
      .some(i => i.user_id === m.user_id && ['mom', 'dad'].includes(i.identity))) || members[0];
    return parent?.profiles?.name || fallback;
  };

  function scheduleLines(userId) {
    return (arrs || [])
      .filter(a => ['h', 'c'].some(s => sideMembers(a, s).some(m => m.user_id === userId)))
      .map(a => {
        const kids = listNames((a.children || []).map(k => k.name.split(' ')[0])) || a.name;
        const schedule = Array.isArray(a.schedules) ? a.schedules[0] : a.schedules;
        const w = schedule?.anchor_date ? daySummary(schedule, a.deviations || [], a.children || [], today) : null;
        const withWho = !w ? 'no schedule set'
          : w === 'mix' ? 'split between homes'
          : `with ${w === 'h' ? parentName(a, 'h', a.h_label || 'home side') : parentName(a, 'c', a.c_label || 'co-parent')}`;
        const acts = (a.activities || []).filter(act => activityOn(act, today))
          .map(act => `${act.name}${act.time ? ' ' + act.time : ''}${act.location ? ' @ ' + act.location : ''}`);
        return `• ${kids}: ${withWho}${acts.length ? ` — ${acts.join('; ')}` : ''}`;
      });
  }

  let sent = 0;
  for (const { userId, to, name, items } of byUser.values()) {
    const when = ts => new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
    });
    const lines = items.map(n => `• ${n.message} (${when(n.created_at)})`).join('\n');
    const sched = scheduleLines(userId);
    const schedBlock = sched.length ? `Today's schedule:\n\n${sched.join('\n')}\n\n` : '';
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
        text: `Hi ${name || 'there'},\n\n${schedBlock}Updates:\n\n${lines}${appUrl ? `\n\nOpen Family Phases: ${appUrl}` : ''}`,
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
  return Response.json({ ok: true, sent });
}
