'use client';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supa } from '@/lib/supabase/client';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const MEMBER_COLS = 'household_members(user_id, profiles(id,name,email))';

export function StoreProvider({ children }) {
  const [state, setState] = useState({ loading: true, me: null, households: [], arrangements: [], notifications: [] });
  const claimed = useRef(false);

  const refresh = useCallback(async () => {
    const s = supa();
    const { data: { user } } = await s.auth.getUser();
    if (!user) { setState(v => ({ ...v, loading: false })); return; }

    if (!claimed.current) {
      claimed.current = true;
      await s.rpc('claim_invites').then(() => {}, () => {});
    }

    const [profileQ, houseQ, arrQ, notifQ] = await Promise.all([
      s.from('profiles').select('*').eq('id', user.id).single(),
      s.from('households').select(`*, ${MEMBER_COLS}`),
      s.from('arrangements').select(`*,
        h_household:households!arrangements_h_household_id_fkey(id, name, ${MEMBER_COLS}),
        c_household:households!arrangements_c_household_id_fkey(id, name, ${MEMBER_COLS}),
        member_identities(*), arrangement_prefs(*),
        arrangement_viewers(user_id, profiles(id,name,email)),
        children(*), schedules(*), deviations(*), expenses(*), settlements(*),
        day_comments(*, profiles(id,name,email)), activities(*),
        todos(*, todo_comments(*, profiles(id,name,email)))`),
      s.from('notifications').select('*').order('created_at', { ascending: false }).limit(50),
    ]);

    const arrangements = (arrQ.data || []).map(a => ({
      ...a,
      // Flat member list across both homes: [{ user_id, side, profiles }]
      members: ['h', 'c'].flatMap(side =>
        (a[side + '_household']?.household_members || []).map(m => ({ ...m, side }))),
      schedule: Array.isArray(a.schedules) ? a.schedules[0] || null : a.schedules,
      children: (a.children || []).sort((x, y) => x.name.localeCompare(y.name)),
      deviations: (a.deviations || []).sort((x, y) => (x.start_date < y.start_date ? -1 : 1)),
      expenses: (a.expenses || []).sort((x, y) => (x.date < y.date ? 1 : -1)),
      settlements: (a.settlements || []).sort((x, y) => (x.date < y.date ? 1 : -1)),
      day_comments: (a.day_comments || []).sort((x, y) => (x.created_at < y.created_at ? -1 : 1)),
      activities: (a.activities || []).sort((x, y) => (x.time || '') < (y.time || '') ? -1 : 1),
      todos: (a.todos || [])
        .map(t => ({
          ...t,
          comments: (t.todo_comments || []).sort((x, y) => (x.created_at < y.created_at ? -1 : 1)),
        }))
        .sort((x, y) => ((x.due || '9999') < (y.due || '9999') ? -1 : 1)),
    }));

    setState({
      loading: false,
      me: profileQ.data,
      households: houseQ.data || [],
      arrangements,
      notifications: notifQ.data || [],
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: refetch (debounced) when shared data changes
  useEffect(() => {
    const s = supa();
    let t;
    const bump = () => { clearTimeout(t); t = setTimeout(refresh, 400); };
    const ch = s.channel('familysync')
      .on('postgres_changes', { event: '*', schema: 'public' }, bump)
      .subscribe();
    return () => { clearTimeout(t); s.removeChannel(ch); };
  }, [refresh]);

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

/* ---------- helpers ---------- */

const PARENT_IDENTITIES = ['mom', 'dad'];

export function identityOf(arr, userId) {
  return (arr.member_identities || []).find(i => i.user_id === userId) || null;
}

export function identityLabel(ident) {
  if (!ident) return null;
  if (ident.label) return ident.label;
  return ident.identity === 'other' ? null
    : ident.identity[0].toUpperCase() + ident.identity.slice(1);
}

// The parent on a side: the member who declared mom/dad, else anyone with a
// declared identity, else the first member.
function sideParent(arr, side) {
  const members = (arr.members || []).filter(m => m.side === side);
  return members.find(m => PARENT_IDENTITIES.includes(identityOf(arr, m.user_id)?.identity))
    || members.find(m => identityOf(arr, m.user_id))
    || members[0] || null;
}

// Display name for a side of an arrangement ('h'/'c'). Real people win;
// the stored labels are placeholders for a side nobody has joined yet.
export function sideName(arr, side) {
  const p = sideParent(arr, side);
  if (p) return p.profiles?.name || p.profiles?.email;
  const placeholder = side === 'h' ? arr.h_label : arr.c_label;
  return placeholder || (side === 'h' ? 'Us' : 'Them');
}

// The side ('h'/'c') I personally am on, or null when I'm a viewer/child.
export function mySide(arr, meId) {
  const m = (arr.members || []).find(x => x.user_id === meId);
  return m ? m.side : null;
}

// Have both homes got someone in them yet?
export function bothSidesJoined(arr) {
  return ['h', 'c'].every(s => (arr.members || []).some(m => m.side === s));
}

export function isViewer(arr, meId) {
  return (arr.arrangement_viewers || []).some(v => v.user_id === meId);
}

// What children see for a side (e.g. "Dad"): the parent's declared identity,
// falling back to the kid-facing placeholder, then the adult-facing name.
export function kidSideName(arr, side) {
  const p = sideParent(arr, side);
  const fromIdentity = p && identityLabel(identityOf(arr, p.user_id));
  if (fromIdentity) return fromIdentity;
  const placeholder = side === 'h' ? arr.kid_h_label : arr.kid_c_label;
  return placeholder || sideName(arr, side);
}

// Arrangement display name: my nickname, else the kids' names, else the
// stored name. Kids' names read correctly from every chair; "My kids" doesn't.
// (RLS only ever returns the signed-in user's prefs rows.)
export function arrName(arr) {
  const nick = (arr.arrangement_prefs || [])[0]?.nickname;
  if (nick) return nick;
  const kids = (arr.children || []).map(k => k.name.split(' ')[0]);
  if (kids.length) return kids.join(' & ');
  return arr.name;
}

// If the signed-in user is a linked child account, returns { arr, kid }; else null.
export function childIdentity(arrangements, meId) {
  for (const a of arrangements) {
    const kid = (a.children || []).find(k => k.user_id === meId);
    if (kid) return { arr: a, kid };
  }
  return null;
}

export function kidName(arr, id) {
  return (arr.children || []).find(k => k.id === id)?.name || '?';
}

export async function logActivity(arrangementId, userId, action, detail = {}) {
  await supa().from('activity_log').insert({ arrangement_id: arrangementId, user_id: userId, action, detail });
}
