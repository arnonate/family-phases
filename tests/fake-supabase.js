// A minimal fake of the Supabase client: enough for StoreProvider and the
// pages to run realistically against fixture data.
import { todayStr } from '@/lib/custody';

export function makeFixture({ asChild = false, twoArrangements = false } = {}) {
  const me = asChild
    ? { id: 'kid-molly', email: 'molly@example.com', name: 'Molly', ical_token: 'tok' }
    : { id: 'nate', email: 'nate@example.com', name: 'Nate', ical_token: 'tok' };

  const nateP = { id: 'nate', name: 'Nate', email: 'nate@example.com' };
  const chrisP = { id: 'chris', name: 'Christin', email: 'c@example.com' };
  const arrangement = {
    id: 'arr-sj', h_household_id: 'house-1', c_household_id: 'house-2', name: 'SJ',
    split_pct: 75, approval_threshold: 500, transfer_time: '6:00 PM',
    h_label: null, c_label: null, kid_h_label: null, kid_c_label: null,
    h_household: { id: 'house-1', name: "Nate's home", household_members: [{ user_id: 'nate', profiles: nateP }] },
    c_household: { id: 'house-2', name: "Christin's home", household_members: [{ user_id: 'chris', profiles: chrisP }] },
    member_identities: [
      { arrangement_id: 'arr-sj', user_id: 'nate', identity: 'dad', label: null },
      { arrangement_id: 'arr-sj', user_id: 'chris', identity: 'mom', label: null },
    ],
    arrangement_prefs: [],
    arrangement_viewers: [],
    children: [
      { id: 'k1', arrangement_id: 'arr-sj', name: 'Molly', color: '#a78bfa', user_id: 'kid-molly' },
      { id: 'k2', arrangement_id: 'arr-sj', name: 'Jude', color: '#f472b6', user_id: null },
    ],
    // anchor today => today is an "h" (Us/Dad) day, deterministically
    schedules: [{ arrangement_id: 'arr-sj', type: 'weeks', anchor_date: todayStr(), cycle: [] }],
    deviations: [],
    expenses: [
      { id: 'e1', arrangement_id: 'arr-sj', date: '2026-08-01', amount: 100, category: 'Medical', description: 'Copay', child_ids: ['k1'], paid_by: 'c', status: 'approved', created_by: 'chris' },
    ],
    settlements: [],
    todos: [
      { id: 't1', arrangement_id: 'arr-sj', title: 'Turn in camp form', due: null, child_id: 'k1', assigned_to: null, done: false, todo_comments: [] },
    ],
    day_comments: [],
    activities: [
      { id: 'act1', arrangement_id: 'arr-sj', name: 'Soccer', child_ids: ['k1'], start_date: todayStr(), end_date: todayStr(), days: [], time: '5:30 PM', location: 'Riverside' },
    ],
  };

  // A second arrangement in the same home, co-parent not joined yet —
  // exercises every multi-arrangement code path (tabs, per-arrangement labels).
  const arrangement2 = {
    ...arrangement,
    id: 'arr-kc', name: 'KC', c_household_id: null, c_household: null,
    c_label: 'Sam', kid_c_label: 'Dad',
    member_identities: [{ arrangement_id: 'arr-kc', user_id: 'nate', identity: 'dad', label: null }],
    children: [{ id: 'k3', arrangement_id: 'arr-kc', name: 'Kai', color: '#34d399', user_id: null }],
    expenses: [], todos: [], activities: [],
  };

  return {
    me,
    households: [{ id: 'house-1', name: "Nate's home", household_members: [{ user_id: 'nate', profiles: { id: 'nate', name: 'Nate', email: 'nate@example.com' } }] }],
    arrangements: twoArrangements ? [arrangement, arrangement2] : [arrangement],
    notifications: [],
  };
}

export function makeFakeSupa(fx) {
  const ok = data => ({ data, error: null });
  function from(table) {
    const b = {
      select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
      insert: () => b, update: () => b, upsert: () => b, delete: () => b,
      single: () => { b._single = true; return b; },
      then(resolve) {
        let data = [];
        if (table === 'profiles') data = b._single ? fx.me : [fx.me];
        else if (table === 'households') data = fx.households;
        else if (table === 'arrangements') data = fx.arrangements;
        else if (table === 'notifications') data = fx.notifications;
        return Promise.resolve(ok(data)).then(resolve);
      },
    };
    return b;
  }
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: fx.me.id } } }),
      signOut: async () => ({}),
      signInWithOtp: async () => ({ error: null }),
      verifyOtp: async () => ({ error: null }),
    },
    rpc: async () => ({ data: 0, error: null }),
    from,
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {},
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: '#' }, error: null }) }) },
  };
}
