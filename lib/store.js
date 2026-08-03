'use client';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supa } from '@/lib/supabase/client';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

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
      s.from('households').select('*, household_members(user_id, profiles(id,name,email))'),
      s.from('arrangements').select(`*,
        arrangement_members(user_id, role, profiles(id,name,email)),
        children(*), schedules(*), deviations(*), expenses(*), settlements(*),
        day_comments(*, profiles(id,name,email)),
        todos(*, todo_comments(*, profiles(id,name,email)))`),
      s.from('notifications').select('*').order('created_at', { ascending: false }).limit(50),
    ]);

    const arrangements = (arrQ.data || []).map(a => ({
      ...a,
      schedule: Array.isArray(a.schedules) ? a.schedules[0] || null : a.schedules,
      children: (a.children || []).sort((x, y) => x.name.localeCompare(y.name)),
      deviations: (a.deviations || []).sort((x, y) => (x.start_date < y.start_date ? -1 : 1)),
      expenses: (a.expenses || []).sort((x, y) => (x.date < y.date ? 1 : -1)),
      settlements: (a.settlements || []).sort((x, y) => (x.date < y.date ? 1 : -1)),
      day_comments: (a.day_comments || []).sort((x, y) => (x.created_at < y.created_at ? -1 : 1)),
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

// Display name for a side of an arrangement ('h' household parent, 'c' co-parent).
// Explicit labels win — they're deliberately chosen; member account names are the fallback.
export function sideName(arr, side) {
  if (side === 'h' && arr.h_label) return arr.h_label;
  if (side === 'c' && arr.c_label) return arr.c_label;
  const m = (arr.arrangement_members || []).find(x => x.role === (side === 'h' ? 'household' : 'coparent'));
  if (m?.profiles?.name) return m.profiles.name;
  return side === 'h' ? 'Household parent' : 'Co-parent';
}

// My relationship to an arrangement: 'household' | 'coparent' | 'viewer'
export function myRole(arr, meId) {
  const m = (arr.arrangement_members || []).find(x => x.user_id === meId);
  return m ? m.role : 'viewer';
}

// The side ('h'/'c') I personally am, or null when I'm a household viewer
export function mySide(arr, meId) {
  const r = myRole(arr, meId);
  return r === 'household' ? 'h' : r === 'coparent' ? 'c' : null;
}

export function kidName(arr, id) {
  return (arr.children || []).find(k => k.id === id)?.name || '?';
}

export async function logActivity(arrangementId, userId, action, detail = {}) {
  await supa().from('activity_log').insert({ arrangement_id: arrangementId, user_id: userId, action, detail });
}
