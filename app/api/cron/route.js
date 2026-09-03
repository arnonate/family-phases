import { createClient } from '@supabase/supabase-js';
import { daySummary, activityOn, listNames } from '@/lib/custody';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

// Daily housekeeping, wired to Vercel Cron (see vercel.json):
// 1. Materialize support & maintenance obligations due today.
// 2. Email one digest per user of their un-emailed notifications, prefixed
//    with today's custody schedule. No-op unless RESEND_API_KEY is set.
// 3. Prune read notifications beyond the 10 newest per user (only ones the
//    digest has already covered, so nothing vanishes before it's emailed).
export async function GET(request) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
      // Next caches GET fetches in route handlers; live data must bypass it
      global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) },
    }
  );
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  const { data: arrs } = await admin.from('arrangements')
    .select(`*, children(*), schedules(*), deviations(*), activities(*), member_identities(user_id, identity),
      h_household:households!arrangements_h_household_id_fkey(household_members(user_id, profiles(name))),
      c_household:households!arrangements_c_household_id_fkey(household_members(user_id, profiles(name)))`);

  const sideMembers = (a, side) => a[side + '_household']?.household_members || [];
  const parentOf = (a, side) => {
    const members = sideMembers(a, side);
    return members.find(m => (a.member_identities || [])
      .some(i => i.user_id === m.user_id && ['mom', 'dad'].includes(i.identity))) || members[0] || null;
  };
  const parentName = (a, side, fallback) => parentOf(a, side)?.profiles?.name || fallback;

  // ---- 1. support & maintenance due today ----
  let supportAdded = 0;
  const dom = Number(today.slice(8, 10));
  for (const a of arrs || []) {
    if (!a.support_amount || !a.support_from || !(a.support_days || []).includes(dom)) continue;
    const recipient = a.support_from === 'h' ? 'c' : 'h';
    const { data: existing } = await admin.from('expenses').select('id')
      .eq('arrangement_id', a.id).eq('category', 'Support & Maintenance').eq('date', today).limit(1);
    if (existing?.length) continue;   // idempotent per day
    const eid = randomUUID();
    const { error } = await admin.from('expenses').insert({
      id: eid, arrangement_id: a.id, date: today, amount: a.support_amount,
      category: 'Support & Maintenance', description: 'Support & maintenance',
      paid_by: recipient,                                  // owed TO this side
      split_pct: a.support_from === 'h' ? 100 : 0,          // payer owes it all
      status: 'approved',                                   // standing agreement
      created_by: parentOf(a, a.support_from)?.user_id || null,
    });
    if (!error) {
      supportAdded++;
      await admin.rpc('notify_arrangement', {
        aid: a.id, actor: null, ntype: 'support_due', ref: eid,
        msg: `$${Number(a.support_amount).toFixed(2)} support & maintenance from ${parentName(a, a.support_from, 'one home')} to ${parentName(a, recipient, 'the other')} was added to the ledger`,
      });
    }
  }

  // ---- 2. daily digest ----
  if (!process.env.RESEND_API_KEY) {
    return Response.json({ ok: true, supportAdded, skipped: 'RESEND_API_KEY not set' });
  }
  // Prefer the configured URL; Vercel cron hits the real domain, so the
  // request origin is a solid fallback.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (request?.url ? new URL(request.url).origin : '');
  const { data: pending } = await admin.from('notifications')
    .select('*, profiles(email, name)').eq('emailed', false).limit(200);
  if (!pending?.length) return Response.json({ ok: true, supportAdded, sent: 0 });

  // Group by user (skip only rows with no deliverable address).
  const byUser = new Map();
  const skipIds = [];
  for (const n of pending) {
    if (!n.profiles?.email) { skipIds.push(n.id); continue; }
    if (!byUser.has(n.user_id)) byUser.set(n.user_id, { userId: n.user_id, to: n.profiles.email, name: n.profiles.name, items: [] });
    byUser.get(n.user_id).items.push(n);
  }

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

  // ---- 3. prune old read notifications ----
  const { data: readRows } = await admin.from('notifications')
    .select('id, user_id').eq('read', true).eq('emailed', true)
    .order('created_at', { ascending: false });
  const kept = new Map();
  const prune = [];
  for (const n of readRows || []) {
    const c = kept.get(n.user_id) || 0;
    if (c >= 10) prune.push(n.id);
    else kept.set(n.user_id, c + 1);
  }
  if (prune.length) await admin.from('notifications').delete().in('id', prune);

  return Response.json({ ok: true, supportAdded, sent, pruned: prune.length });
}
