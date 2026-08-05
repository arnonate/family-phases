// Live RLS security suite. Verifies the database-level boundaries with
// throwaway users, then cleans up after itself. Safe to run against a real
// project: it only touches rows it creates.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... npm run test:rls
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !SERVICE || !ANON) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY');
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const run = randomUUID().slice(0, 8);
const PASS = `Rls-test-${randomUUID()}`;
let failures = 0;
const created = { users: [], householdId: null };

function check(name, cond, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failures++; console.log(`FAIL ${name} ${detail}`); }
}

async function makeUser(tag) {
  const email = `rls-${tag}-${run}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  created.users.push(data.user.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PASS });
  if (e2) throw new Error(`signIn ${tag}: ${e2.message}`);
  return { id: data.user.id, email, client };
}

async function main() {
  console.log(`RLS suite run ${run} against ${URL_}`);
  const parent = await makeUser('parent');
  const coparent = await makeUser('coparent');
  const outsider = await makeUser('outsider');
  const child = await makeUser('child');

  // Parent bootstraps a household + arrangement
  const houseId = randomUUID();
  created.householdId = houseId;
  const { error: hErr } = await parent.client.rpc('create_household_with_membership', { hid: houseId, hname: `rls-house-${run}` });
  check('parent can bootstrap household', !hErr, hErr?.message);

  const arrId = randomUUID();
  const { error: aErr } = await parent.client.from('arrangements').insert({
    id: arrId, household_id: houseId, name: `rls-arr-${run}`, split_pct: 75, approval_threshold: 500,
  });
  check('household member creates arrangement', !aErr, aErr?.message);
  await parent.client.from('arrangement_members').insert({ arrangement_id: arrId, user_id: parent.id, role: 'household' });
  await parent.client.from('schedules').insert({ arrangement_id: arrId, type: 'weeks' });

  const { data: kidRow } = await admin.from('children')
    .insert({ arrangement_id: arrId, name: `rls-kid-${run}`, color: '#000' }).select().single();

  // Invites: co-parent + child, claimed on their next call
  await parent.client.from('invites').insert({ email: coparent.email, arrangement_id: arrId, role: 'coparent', invited_by: parent.id });
  await parent.client.from('invites').insert({ email: child.email, role: 'child', child_id: kidRow.id, invited_by: parent.id });
  await coparent.client.rpc('claim_invites');
  await child.client.rpc('claim_invites');

  // Visibility
  const { data: cpArrs } = await coparent.client.from('arrangements').select('id').eq('id', arrId);
  check('co-parent sees the arrangement after claiming', cpArrs?.length === 1);

  const { data: outArrs } = await outsider.client.from('arrangements').select('id').eq('id', arrId);
  check('outsider sees nothing', (outArrs || []).length === 0);

  const { data: childArrs } = await child.client.from('arrangements').select('id').eq('id', arrId);
  check('child sees their arrangement', childArrs?.length === 1);

  // Expenses: parent adds one; child must not see it, co-parent must
  await parent.client.from('expenses').insert({
    arrangement_id: arrId, date: '2026-01-15', amount: 100, category: 'Medical', paid_by: 'h', status: 'approved', created_by: parent.id,
  });
  const { data: cpExp } = await coparent.client.from('expenses').select('id').eq('arrangement_id', arrId);
  check('co-parent sees expenses', cpExp?.length === 1);
  const { data: childExp } = await child.client.from('expenses').select('id').eq('arrangement_id', arrId);
  check('child cannot see expenses', (childExp || []).length === 0);

  // Child is read-only where it matters
  const { error: childWrite } = await child.client.from('todos')
    .insert({ arrangement_id: arrId, title: 'hax', created_by: child.id });
  check('child cannot create to-dos', !!childWrite);
  const { error: childSched } = await child.client.from('schedules')
    .update({ type: '223' }).eq('arrangement_id', arrId);
  const { data: schedAfter } = await admin.from('schedules').select('type').eq('arrangement_id', arrId).single();
  check('child cannot modify the schedule', !!childSched || schedAfter?.type === 'weeks');

  // Child CAN talk on day threads
  const { error: childComment } = await child.client.from('day_comments')
    .insert({ arrangement_id: arrId, date: '2026-01-15', author: child.id, body: 'hi from kid' });
  check('child can post a day comment', !childComment, childComment?.message);

  // Deleting other people's comments is refused (0 rows affected under RLS)
  const { data: cmt } = await admin.from('day_comments').select('id').eq('arrangement_id', arrId).single();
  await parent.client.from('day_comments').delete().eq('id', cmt.id); // parent is not the author
  const { data: stillThere } = await admin.from('day_comments').select('id').eq('id', cmt.id);
  check('only the author can delete a comment', stillThere?.length === 1);

  // Expense deletion rules: creator only, and not while pending
  await parent.client.from('expenses').insert({
    arrangement_id: arrId, date: '2026-01-16', amount: 900, category: 'Other', paid_by: 'h', status: 'pending', created_by: parent.id,
  });
  const { data: pend } = await admin.from('expenses').select('id').eq('status', 'pending').eq('arrangement_id', arrId).single();
  await parent.client.from('expenses').delete().eq('id', pend.id);
  const { data: pendAfter } = await admin.from('expenses').select('id').eq('id', pend.id);
  check('pending expenses cannot be deleted, even by creator', pendAfter?.length === 1);

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL RLS CHECKS PASSED');
}

async function cleanup() {
  try {
    if (created.householdId) await admin.from('households').delete().eq('id', created.householdId);
    for (const id of created.users) await admin.auth.admin.deleteUser(id);
    console.log('cleanup complete');
  } catch (e) {
    console.error('cleanup issue (remove rls-* rows/users manually):', e.message);
  }
}

main()
  .catch(e => { failures++; console.error('SUITE ERROR:', e.message); })
  .finally(async () => { await cleanup(); process.exit(failures ? 1 : 0); });
