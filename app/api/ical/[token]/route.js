import { createClient } from '@supabase/supabase-js';
import { daySummary, addDays, todayStr } from '@/lib/custody';

export const dynamic = 'force-dynamic';

// Read-only custody feed. URL contains a private token; anyone with the URL can read it.
export async function GET(request, { params }) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data: profile } = await admin.from('profiles')
    .select('id, name').eq('ical_token', params.token).single();
  if (!profile) return new Response('Not found', { status: 404 });

  // arrangements this user can see: direct member, or member of owning household
  const [{ data: am }, { data: hm }] = await Promise.all([
    admin.from('arrangement_members').select('arrangement_id').eq('user_id', profile.id),
    admin.from('household_members').select('household_id').eq('user_id', profile.id),
  ]);
  const direct = (am || []).map(x => x.arrangement_id);
  let viaHouse = [];
  if (hm?.length) {
    const { data } = await admin.from('arrangements').select('id')
      .in('household_id', hm.map(x => x.household_id));
    viaHouse = (data || []).map(x => x.id);
  }
  const ids = [...new Set([...direct, ...viaHouse])];
  if (!ids.length) return icsResponse([]);

  const { data: arrs } = await admin.from('arrangements')
    .select('*, children(*), schedules(*), deviations(*), arrangement_members(user_id, role, profiles(name))')
    .in('id', ids);

  const events = [];
  const start = addDays(todayStr(), -30);
  for (const a of arrs || []) {
    const schedule = Array.isArray(a.schedules) ? a.schedules[0] : a.schedules;
    if (!schedule?.anchor_date) continue;
    const deviations = a.deviations || [];
    const children = a.children || [];
    const hName = (a.arrangement_members || []).find(m => m.role === 'household')?.profiles?.name || a.h_label || 'Household';
    const cName = (a.arrangement_members || []).find(m => m.role === 'coparent')?.profiles?.name || a.c_label || 'Co-parent';

    // group consecutive days by summary into ranges
    let cur = null;
    for (let i = 0; i <= 210; i++) {
      const d = addDays(start, i);
      const w = i <= 209 ? daySummary(schedule, deviations, children, d) : '__end__';
      if (cur && cur.who !== w) {
        events.push({
          start: cur.from, endExclusive: d,
          title: cur.who === 'mix' ? `Kids split (${a.name})`
            : `Kids with ${cur.who === 'h' ? hName : cName}${arrs.length > 1 ? ` (${a.name})` : ''}`,
        });
        cur = null;
      }
      if (!cur && w && w !== '__end__') cur = { who: w, from: d };
    }
  }
  return icsResponse(events);
}

function icsResponse(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Phases//EN',
    'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Family Phases custody',
    ...events.flatMap((e, i) => [
      'BEGIN:VEVENT',
      `UID:family-phases-${e.start}-${i}@familyphases`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${e.start.replaceAll('-', '')}`,
      `DTEND;VALUE=DATE:${e.endExclusive.replaceAll('-', '')}`,
      `SUMMARY:${e.title}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  return new Response(lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
}
