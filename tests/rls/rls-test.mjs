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
  const partner = await makeUser('partner');       // joins parent's home
  const coparent = await makeUser('coparent');
  const cpPartner = await makeUser('cppartner');   // joins coparent's home later
  const viewer = await makeUser('viewer');
  const outsider = await makeUser('outsider');
  const child = await makeUser('child');

  // Parent bootstraps a home + arrangement (h side)
  const houseId = randomUUID();
  created.householdId = houseId;
  const { error: hErr } = await parent.client.rpc('create_household_with_membership', { hid: houseId, hname: `rls-house-${run}` });
  check('parent can bootstrap household', !hErr, hErr?.message);

  const arrId = randomUUID();
  const { error: aErr } = await parent.client.from('arrangements').insert({
    id: arrId, h_household_id: houseId, name: `rls-arr-${run}`, split_pct: 75, approval_threshold: 500,
  });
  check('home member creates arrangement', !aErr, aErr?.message);
  await parent.client.from('schedules').insert({ arrangement_id: arrId, type: 'weeks' });

  const { data: kidRow } = await admin.from('children')
    .insert({ arrangement_id: arrId, name: `rls-kid-${run}`, color: '#000' }).select().single();

  // Identity is self-declared; nobody can declare for someone else
  const { error: idOwn } = await parent.client.from('member_identities')
    .insert({ arrangement_id: arrId, user_id: parent.id, identity: 'dad' });
  check('member declares own identity', !idOwn, idOwn?.message);
  const { error: idOther } = await parent.client.from('member_identities')
    .insert({ arrangement_id: arrId, user_id: outsider.id, identity: 'mom' });
  check('cannot declare identity for someone else', !!idOther);

  // Invites: partner into the home, co-parent + viewer into the arrangement, child link
  await parent.client.from('invites').insert({ email: partner.email, household_id: houseId, role: 'household', invited_by: parent.id });
  await parent.client.from('invites').insert({ email: coparent.email, arrangement_id: arrId, role: 'coparent', invited_by: parent.id });
  await parent.client.from('invites').insert({ email: viewer.email, arrangement_id: arrId, role: 'viewer', invited_by: parent.id });
  await parent.client.from('invites').insert({ email: child.email, role: 'child', child_id: kidRow.id, invited_by: parent.id });
  await partner.client.rpc('claim_invites');
  await coparent.client.rpc('claim_invites');
  await viewer.client.rpc('claim_invites');
  await child.client.rpc('claim_invites');

  // Visibility
  const { data: cpArrs } = await coparent.client.from('arrangements').select('id, c_household_id').eq('id', arrId);
  check('co-parent sees the arrangement after claiming', cpArrs?.length === 1);
  check('claiming created a c-side home', !!cpArrs?.[0]?.c_household_id);

  const { data: pArrs } = await partner.client.from('arrangements').select('id').eq('id', arrId);
  check('partner in the home sees the arrangement', pArrs?.length === 1);

  const { data: vArrs } = await viewer.client.from('arrangements').select('id').eq('id', arrId);
  check('viewer sees the arrangement', vArrs?.length === 1);

  const { data: outArrs } = await outsider.client.from('arrangements').select('id').eq('id', arrId);
  check('outsider sees nothing', (outArrs || []).length === 0);

  const { data: childArrs } = await child.client.from('arrangements').select('id').eq('id', arrId);
  check('child sees their arrangement', childArrs?.length === 1);

  // The chain: the co-parent brings a partner into THEIR home, who can then manage
  const cHouseId = cpArrs?.[0]?.c_household_id;
  await coparent.client.from('invites').insert({ email: cpPartner.email, household_id: cHouseId, role: 'household', invited_by: coparent.id });
  await cpPartner.client.rpc('claim_invites');
  const { data: cppArrs } = await cpPartner.client.from('arrangements').select('id').eq('id', arrId);
  check("co-parent's partner sees the arrangement", cppArrs?.length === 1);
  const { error: cppTodo } = await cpPartner.client.from('todos')
    .insert({ arrangement_id: arrId, title: `rls-cpp-todo-${run}`, created_by: cpPartner.id });
  check("co-parent's partner can manage (create to-dos)", !cppTodo, cppTodo?.message);

  // Both sides manage; the arrangement row itself stays with the h side
  const { error: cpSched } = await coparent.client.from('schedules')
    .update({ type: '223' }).eq('arrangement_id', arrId);
  const { data: schedCp } = await admin.from('schedules').select('type').eq('arrangement_id', arrId).single();
  check('co-parent can edit the schedule', !cpSched && schedCp?.type === '223', cpSched?.message);
  await coparent.client.from('arrangements').update({ split_pct: 1 }).eq('id', arrId);
  const { data: splitAfter } = await admin.from('arrangements').select('split_pct').eq('id', arrId).single();
  check('co-parent cannot edit arrangement config (h side owns it)', splitAfter?.split_pct === 75);

  // Expenses: parent adds one; viewer and co-parent see it, child must not
  await parent.client.from('expenses').insert({
    arrangement_id: arrId, date: '2026-01-15', amount: 100, category: 'Medical', paid_by: 'h', status: 'approved', created_by: parent.id,
  });
  const { data: cpExp } = await coparent.client.from('expenses').select('id').eq('arrangement_id', arrId);
  check('co-parent sees expenses', cpExp?.length === 1);
  const { data: vExp } = await viewer.client.from('expenses').select('id').eq('arrangement_id', arrId);
  check('viewer sees expenses', vExp?.length === 1);
  const { data: childExp } = await child.client.from('expenses').select('id').eq('arrangement_id', arrId);
  check('child cannot see expenses', (childExp || []).length === 0);

  // Viewer is read-only
  const { error: vTodo } = await viewer.client.from('todos')
    .insert({ arrangement_id: arrId, title: 'hax', created_by: viewer.id });
  check('viewer cannot create to-dos', !!vTodo);
  await viewer.client.from('schedules').update({ type: 'weeks' }).eq('arrangement_id', arrId);
  const { data: schedV } = await admin.from('schedules').select('type').eq('arrangement_id', arrId).single();
  check('viewer cannot modify the schedule', schedV?.type === '223');

  // Child is read-only where it matters
  const { error: childWrite } = await child.client.from('todos')
    .insert({ arrangement_id: arrId, title: 'hax', created_by: child.id });
  check('child cannot create to-dos', !!childWrite);
  await child.client.from('schedules').update({ type: 'weeks' }).eq('arrangement_id', arrId);
  const { data: schedAfter } = await admin.from('schedules').select('type').eq('arrangement_id', arrId).single();
  check('child cannot modify the schedule', schedAfter?.type === '223');

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

  // Approvals must come from the other home
  const devId = randomUUID();
  await parent.client.from('deviations').insert({
    id: devId, arrangement_id: arrId, start_date: '2026-02-01', end_date: '2026-02-02', who: 'h', proposed_by: parent.id,
  });
  await partner.client.from('deviations').update({ status: 'accepted', decided_by: partner.id }).eq('id', devId);
  const { data: devSame } = await admin.from('deviations').select('status').eq('id', devId).single();
  check("a partner in the proposer's home cannot decide", devSame?.status === 'proposed');
  await cpPartner.client.from('deviations').update({ status: 'accepted', decided_by: cpPartner.id }).eq('id', devId);
  const { data: devCross } = await admin.from('deviations').select('status').eq('id', devId).single();
  check('anyone in the other home can decide', devCross?.status === 'accepted');

  // Message board: adults only — members write, viewers read, children see nothing
  const postId = randomUUID();
  const { error: postErr } = await parent.client.from('posts').insert({
    id: postId, arrangement_id: arrId, title: `rls-post-${run}`, body: 'hello', author: parent.id,
  });
  check('member starts a conversation', !postErr, postErr?.message);
  const { data: vPosts } = await viewer.client.from('posts').select('id').eq('id', postId);
  check('viewer reads the board', vPosts?.length === 1);
  const { error: vPost } = await viewer.client.from('post_comments')
    .insert({ post_id: postId, arrangement_id: arrId, author: viewer.id, body: 'hax' });
  check('viewer cannot reply', !!vPost);
  const { data: childPosts } = await child.client.from('posts').select('id').eq('id', postId);
  check('child cannot see the board', (childPosts || []).length === 0);
  const { error: cpReply } = await coparent.client.from('post_comments')
    .insert({ post_id: postId, arrangement_id: arrId, author: coparent.id, body: 'hi from the other home' });
  check('the other home can reply', !cpReply, cpReply?.message);

  // Personal prefs are private
  await parent.client.from('arrangement_prefs').upsert({ arrangement_id: arrId, user_id: parent.id, nickname: 'mine' });
  const { data: cpPrefs } = await coparent.client.from('arrangement_prefs').select('*').eq('arrangement_id', arrId);
  check("one user's nickname is invisible to others", (cpPrefs || []).length === 0);

  // Disconnect: the h side can unlink the c-side home; access ends instantly
  // for everyone in it (run last — it revokes the c side for good)
  await parent.client.from('arrangements').update({ c_household_id: null }).eq('id', arrId);
  const { data: cpAfter } = await coparent.client.from('arrangements').select('id').eq('id', arrId);
  check('h side can disconnect the co-parent home', (cpAfter || []).length === 0);
  const { data: cppAfter } = await cpPartner.client.from('arrangements').select('id').eq('id', arrId);
  check("disconnect also cuts the co-parent's partner", (cppAfter || []).length === 0);

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL RLS CHECKS PASSED');
}

async function cleanup() {
  try {
    // c-side homes were auto-created at claim time; find them via created_by
    const { data: extraHouses } = await admin.from('households')
      .select('id').in('created_by', created.users);
    if (created.householdId) await admin.from('households').delete().eq('id', created.householdId);
    for (const h of extraHouses || []) await admin.from('households').delete().eq('id', h.id);
    for (const id of created.users) await admin.auth.admin.deleteUser(id);
    console.log('cleanup complete');
  } catch (e) {
    console.error('cleanup issue (remove rls-* rows/users manually):', e.message);
  }
}

main()
  .catch(e => { failures++; console.error('SUITE ERROR:', e.message); })
  .finally(async () => { await cleanup(); process.exit(failures ? 1 : 0); });
