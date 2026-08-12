-- FamilySync v2 schema. Run once in Supabase SQL Editor.

-- ============ TABLES ============

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  name text,
  ical_token uuid not null default gen_random_uuid(),
  created_at timestamptz default now()
);

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our household',
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table household_members (
  household_id uuid references households on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (household_id, user_id)
);

create table arrangements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  name text not null,
  -- % of shared expenses paid by the household-side parent (Nate: 75, girlfriend: 50)
  split_pct int not null default 50 check (split_pct between 0 and 100),
  approval_threshold numeric not null default 500,
  transfer_time text default '6:00 PM',
  h_label text,   -- display name for household-side parent (before/without signup)
  c_label text,   -- display name for co-parent
  kid_h_label text,  -- what children see for the household-side parent (e.g. Dad)
  kid_c_label text,  -- what children see for the co-parent (e.g. Mom)

  created_at timestamptz default now()
);

create table arrangement_members (
  arrangement_id uuid references arrangements on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null check (role in ('household','coparent')),
  primary key (arrangement_id, user_id)
);

create table children (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references arrangements on delete cascade,
  name text not null,
  color text not null default '#2563eb',
  birthdate date
);

create table schedules (
  arrangement_id uuid primary key references arrangements on delete cascade,
  type text not null default 'weeks',          -- weeks | 223 | 2255 | eow | custom
  anchor_date date,                            -- day 1 = household-side stretch begins
  cycle text[] not null default '{}'           -- used when type = custom; values 'h' | 'c'
);

create table deviations (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references arrangements on delete cascade,
  start_date date not null,
  end_date date not null,
  who text not null check (who in ('h','c')),  -- h = household side, c = coparent
  child_ids uuid[] default '{}',               -- empty = all children
  note text,
  status text not null default 'proposed' check (status in ('proposed','accepted','declined')),
  proposed_by uuid references profiles(id),
  decided_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references arrangements on delete cascade,
  date date not null,
  amount numeric not null check (amount > 0),
  category text not null default 'Other',
  description text,
  child_ids uuid[] default '{}',
  paid_by text not null check (paid_by in ('h','c')),
  receipt_path text,
  status text not null default 'approved' check (status in ('pending','approved','disputed')),
  created_by uuid references profiles(id),
  decided_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references arrangements on delete cascade,
  date date not null,
  amount numeric not null check (amount > 0),
  direction text not null check (direction in ('h2c','c2h')),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table todos (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references arrangements on delete cascade,
  title text not null,
  due date,
  child_id uuid references children on delete set null,
  assigned_to uuid references profiles(id),
  done boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table activity_log (
  id bigint generated always as identity primary key,
  arrangement_id uuid not null references arrangements on delete cascade,
  user_id uuid references profiles(id),
  action text not null,
  detail jsonb default '{}',
  created_at timestamptz default now()
);

create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  arrangement_id uuid references arrangements on delete cascade,
  type text not null,
  message text not null,
  read boolean not null default false,
  emailed boolean not null default false,
  created_at timestamptz default now()
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  household_id uuid references households on delete cascade,   -- partner invite
  arrangement_id uuid references arrangements on delete cascade, -- co-parent invite
  role text not null check (role in ('household','coparent')),
  invited_by uuid references profiles(id),
  claimed boolean not null default false,
  created_at timestamptz default now()
);

-- ============ PROFILE AUTO-CREATION ============

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, split_part(new.email,'@',1));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ ACCESS HELPERS (security definer avoids RLS recursion) ============

create or replace function public.is_household_member(hid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from household_members where household_id = hid and user_id = auth.uid());
$$;

create or replace function public.is_arrangement_member(aid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from arrangement_members where arrangement_id = aid and user_id = auth.uid());
$$;

-- Full visibility: direct member of the arrangement OR member of the owning household.
create or replace function public.can_access_arrangement(aid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_arrangement_member(aid)
      or exists (select 1 from arrangements a
                 where a.id = aid and public.is_household_member(a.household_id));
$$;

-- Do two users share any arrangement or household? (for reading names)
create or replace function public.shares_context(other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from arrangement_members m1
    join arrangement_members m2 on m1.arrangement_id = m2.arrangement_id
    where m1.user_id = auth.uid() and m2.user_id = other)
  or exists (
    select 1 from household_members h1
    join household_members h2 on h1.household_id = h2.household_id
    where h1.user_id = auth.uid() and h2.user_id = other)
  or exists (  -- household member <-> coparent of an arrangement in that household
    select 1 from arrangements a
    join arrangement_members am on am.arrangement_id = a.id
    join household_members hm on hm.household_id = a.household_id
    where (hm.user_id = auth.uid() and am.user_id = other)
       or (am.user_id = auth.uid() and hm.user_id = other))
  or exists (  -- child account <-> anyone attached to the child's arrangement
    select 1 from children c
    join arrangements a on a.id = c.arrangement_id
    where (c.user_id = auth.uid() and (
             exists (select 1 from arrangement_members am where am.arrangement_id = a.id and am.user_id = other)
             or exists (select 1 from household_members hm where hm.household_id = a.household_id and hm.user_id = other)
             or exists (select 1 from children c2 where c2.arrangement_id = a.id and c2.user_id = other)))
       or (c.user_id = other and (
             exists (select 1 from arrangement_members am where am.arrangement_id = a.id and am.user_id = auth.uid())
             or exists (select 1 from household_members hm where hm.household_id = a.household_id and hm.user_id = auth.uid())
             or exists (select 1 from children c2 where c2.arrangement_id = a.id and c2.user_id = auth.uid()))));
$$;

-- Bootstrap: create a household and its first membership atomically.
-- Runs with elevated rights because RLS can't express "creating the thing
-- that grants you permission to see it".
create or replace function public.create_household_with_membership(hid uuid, hname text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into households (id, name, created_by) values (hid, hname, auth.uid());
  insert into household_members (household_id, user_id) values (hid, auth.uid());
end $$;

-- Claim pending invites for the signed-in user's email. Called by the app after login.
create or replace function public.claim_invites()
returns int language plpgsql security definer set search_path = public as $$
declare inv record; n int := 0;
begin
  for inv in select * from invites
             where lower(email) = lower(auth.email()) and not claimed loop
    if inv.household_id is not null then
      insert into household_members (household_id, user_id)
      values (inv.household_id, auth.uid()) on conflict do nothing;
    end if;
    if inv.arrangement_id is not null then
      insert into arrangement_members (arrangement_id, user_id, role)
      values (inv.arrangement_id, auth.uid(), inv.role) on conflict do nothing;
    end if;
    update invites set claimed = true where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============ ROW-LEVEL SECURITY ============

alter table profiles enable row level security;
alter table households enable row level security;
alter table household_members enable row level security;
alter table arrangements enable row level security;
alter table arrangement_members enable row level security;
alter table children enable row level security;
alter table schedules enable row level security;
alter table deviations enable row level security;
alter table expenses enable row level security;
alter table settlements enable row level security;
alter table todos enable row level security;
alter table activity_log enable row level security;
alter table notifications enable row level security;
alter table invites enable row level security;

create policy "read own or shared profiles" on profiles for select
  using (id = auth.uid() or public.shares_context(id));
create policy "update own profile" on profiles for update using (id = auth.uid());

create policy "read own households" on households for select
  using (public.is_household_member(id));
create policy "create household" on households for insert
  with check (auth.uid() is not null and created_by = auth.uid());
create policy "update own household" on households for update
  using (public.is_household_member(id));

create policy "read memberships" on household_members for select
  using (user_id = auth.uid() or public.is_household_member(household_id));
create policy "join own created household" on household_members for insert
  with check (user_id = auth.uid() and exists
    (select 1 from households h where h.id = household_id and h.created_by = auth.uid()));

create policy "read arrangements" on arrangements for select
  using (public.can_access_arrangement(id));
create policy "household creates arrangements" on arrangements for insert
  with check (public.is_household_member(household_id));
create policy "household updates arrangements" on arrangements for update
  using (public.is_household_member(household_id));
create policy "household deletes arrangements" on arrangements for delete
  using (public.is_household_member(household_id));

create policy "read arr members" on arrangement_members for select
  using (user_id = auth.uid() or public.can_access_arrangement(arrangement_id));
create policy "household adds self to own arrangement" on arrangement_members for insert
  with check (user_id = auth.uid() and role = 'household' and exists
    (select 1 from arrangements a where a.id = arrangement_id
       and public.is_household_member(a.household_id)));

-- Generic pattern for arrangement-scoped data
create policy "children rw" on children for all
  using (public.can_access_arrangement(arrangement_id))
  with check (public.can_access_arrangement(arrangement_id));
create policy "schedules rw" on schedules for all
  using (public.can_access_arrangement(arrangement_id))
  with check (public.can_access_arrangement(arrangement_id));
create policy "settlements rw" on settlements for all
  using (public.can_access_arrangement(arrangement_id))
  with check (public.can_access_arrangement(arrangement_id));
create policy "todos rw" on todos for all
  using (public.can_access_arrangement(arrangement_id))
  with check (public.can_access_arrangement(arrangement_id));
create policy "activity read" on activity_log for select
  using (public.can_access_arrangement(arrangement_id));
create policy "activity write" on activity_log for insert
  with check (public.can_access_arrangement(arrangement_id) and user_id = auth.uid());

create policy "deviations select" on deviations for select
  using (public.can_access_arrangement(arrangement_id));
create policy "deviations insert" on deviations for insert
  with check (public.can_access_arrangement(arrangement_id) and proposed_by = auth.uid());
-- Decisions: only a direct party to the arrangement, and not the proposer.
create policy "deviations decide" on deviations for update
  using (public.is_arrangement_member(arrangement_id) and proposed_by <> auth.uid());
create policy "deviations delete own proposal" on deviations for delete
  using (proposed_by = auth.uid() and status = 'proposed');

create policy "expenses select" on expenses for select
  using (public.can_access_arrangement(arrangement_id));
create policy "expenses insert" on expenses for insert
  with check (public.can_access_arrangement(arrangement_id) and created_by = auth.uid());
create policy "expenses decide" on expenses for update
  using (public.is_arrangement_member(arrangement_id) and created_by <> auth.uid());
-- Creators may delete their own expenses, but not while a pending one awaits
-- the other parent's decision.
create policy "expenses delete own decided" on expenses for delete
  using (created_by = auth.uid() and status <> 'pending');

create policy "own notifications" on notifications for select using (user_id = auth.uid());
create policy "mark notifications read" on notifications for update using (user_id = auth.uid());

create policy "read own invites" on invites for select
  using (invited_by = auth.uid() or lower(email) = lower(auth.email()));
create policy "create invites" on invites for insert
  with check (invited_by = auth.uid() and (
    (household_id is not null and public.is_household_member(household_id)) or
    (arrangement_id is not null and public.can_access_arrangement(arrangement_id))));
create policy "delete own invites" on invites for delete using (invited_by = auth.uid());

-- ============ NOTIFICATION TRIGGERS ============

-- Notify everyone attached to the arrangement (parties + household viewers).
-- The actor's own row is created pre-read: it never lights their bell, but it
-- appears in their daily digest email so the digest is a complete record.
create or replace function public.notify_arrangement(aid uuid, actor uuid, ntype text, msg text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, arrangement_id, type, message, read)
  select distinct u, aid, ntype, msg, (u = actor) from (
    select user_id as u from arrangement_members where arrangement_id = aid
    union
    select hm.user_id from household_members hm
      join arrangements a on a.household_id = hm.household_id where a.id = aid
  ) x;
end $$;

create or replace function public.trg_expense_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select coalesce(name,email) into nm from profiles where id = auth.uid();
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'expense_pending',
      nm || ' added a $' || round(new.amount,2) || ' expense that needs approval: ' || coalesce(new.description, new.category));
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'expense_' || new.status,
      nm || ' ' || new.status || ' the $' || round(new.amount,2) || ' expense: ' || coalesce(new.description, new.category));
  end if;
  return new;
end $$;
create trigger expense_notify after insert or update on expenses
  for each row execute function public.trg_expense_notify();

create or replace function public.trg_deviation_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select coalesce(name,email) into nm from profiles where id = auth.uid();
  if tg_op = 'INSERT' and new.status = 'proposed' then
    perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'deviation_proposed',
      nm || ' proposed a schedule change ' || new.start_date || ' to ' || new.end_date || coalesce(': ' || new.note, ''));
  elsif tg_op = 'UPDATE' and old.status = 'proposed' and new.status <> 'proposed' then
    perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'deviation_' || new.status,
      nm || ' ' || new.status || ' the schedule change for ' || new.start_date || ' to ' || new.end_date);
  end if;
  return new;
end $$;
create trigger deviation_notify after insert or update on deviations
  for each row execute function public.trg_deviation_notify();

-- ============ STORAGE (receipts) ============
-- Files stored at receipts/<arrangement_id>/<filename>

insert into storage.buckets (id, name, public) values ('receipts','receipts', false);

create policy "receipts read" on storage.objects for select
  using (bucket_id = 'receipts' and public.can_access_arrangement(((storage.foldername(name))[1])::uuid));
create policy "receipts write" on storage.objects for insert
  with check (bucket_id = 'receipts' and public.can_access_arrangement(((storage.foldername(name))[1])::uuid));
create policy "receipts delete" on storage.objects for delete
  using (bucket_id = 'receipts' and public.can_access_arrangement(((storage.foldername(name))[1])::uuid));

-- ============ TO-DO COMMENTS ============

create table todo_comments (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references todos on delete cascade,
  arrangement_id uuid not null references arrangements on delete cascade,
  author uuid references profiles(id),
  body text not null,
  created_at timestamptz default now()
);

alter table todo_comments enable row level security;
create policy "comments read" on todo_comments for select
  using (public.can_access_arrangement(arrangement_id));
create policy "comments write" on todo_comments for insert
  with check (public.can_access_arrangement(arrangement_id) and author = auth.uid());
create policy "comments delete own" on todo_comments for delete
  using (author = auth.uid());

create or replace function public.trg_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text; t text;
begin
  select coalesce(name, email) into nm from profiles where id = auth.uid();
  select title into t from todos where id = new.todo_id;
  perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'todo_comment',
    nm || ' commented on "' || coalesce(t, 'a to-do') || '": ' || left(new.body, 120));
  return new;
end $$;
create trigger comment_notify after insert on todo_comments
  for each row execute function public.trg_comment_notify();

-- ============ DAY COMMENTS (calendar conversations) ============

create table day_comments (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references arrangements on delete cascade,
  date date not null,
  author uuid references profiles(id),
  body text not null,
  created_at timestamptz default now()
);
create index day_comments_date on day_comments (arrangement_id, date);

alter table day_comments enable row level security;
create policy "day comments read" on day_comments for select
  using (public.can_access_arrangement(arrangement_id));
create policy "day comments write" on day_comments for insert
  with check (public.can_access_arrangement(arrangement_id) and author = auth.uid());
create policy "day comments delete own" on day_comments for delete
  using (author = auth.uid());

create or replace function public.trg_day_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select coalesce(name, email) into nm from profiles where id = auth.uid();
  perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'day_comment',
    nm || ' commented on ' || to_char(new.date, 'Mon FMDD') || ': ' || left(new.body, 120));
  return new;
end $$;
create trigger day_comment_notify after insert on day_comments
  for each row execute function public.trg_day_comment_notify();

-- ============ CHILD LOGINS (read-only) ============

alter table children add column user_id uuid references profiles(id);
alter table invites add column child_id uuid references children on delete cascade;
alter table invites drop constraint invites_role_check;
alter table invites add constraint invites_role_check check (role in ('household','coparent','child'));

create or replace function public.is_child_of_arrangement(aid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from children where arrangement_id = aid and user_id = auth.uid());
$$;

-- Children can READ schedule-related data only. No write policies exist for
-- them anywhere, and expenses/settlements/comments have no child policies at
-- all, so those stay invisible.
create policy "child reads arrangement" on arrangements for select
  using (public.is_child_of_arrangement(id));
create policy "child reads children" on children for select
  using (public.is_child_of_arrangement(arrangement_id));
create policy "child reads schedule" on schedules for select
  using (public.is_child_of_arrangement(arrangement_id));
create policy "child reads accepted deviations" on deviations for select
  using (public.is_child_of_arrangement(arrangement_id) and status = 'accepted');
create policy "child reads arrangement todos" on todos for select
  using (public.is_child_of_arrangement(arrangement_id));
create policy "child reads day comments" on day_comments for select
  using (public.is_child_of_arrangement(arrangement_id));
create policy "child writes day comments" on day_comments for insert
  with check (public.is_child_of_arrangement(arrangement_id) and author = auth.uid());
create policy "child reads todo comments" on todo_comments for select
  using (public.is_child_of_arrangement(arrangement_id));
create policy "child writes todo comments" on todo_comments for insert
  with check (public.is_child_of_arrangement(arrangement_id) and author = auth.uid());

-- Parents may invite a child by email
drop policy "create invites" on invites;
create policy "create invites" on invites for insert
  with check (invited_by = auth.uid() and (
    (household_id is not null and public.is_household_member(household_id)) or
    (arrangement_id is not null and public.can_access_arrangement(arrangement_id)) or
    (child_id is not null and exists
      (select 1 from children c where c.id = child_id and public.can_access_arrangement(c.arrangement_id)))));

-- Claiming now also links child accounts
create or replace function public.claim_invites()
returns int language plpgsql security definer set search_path = public as $$
declare inv record; n int := 0;
begin
  for inv in select * from invites
             where lower(email) = lower(auth.email()) and not claimed loop
    if inv.household_id is not null then
      insert into household_members (household_id, user_id)
      values (inv.household_id, auth.uid()) on conflict do nothing;
    end if;
    if inv.arrangement_id is not null and inv.role <> 'child' then
      insert into arrangement_members (arrangement_id, user_id, role)
      values (inv.arrangement_id, auth.uid(), inv.role) on conflict do nothing;
    end if;
    if inv.child_id is not null then
      update children set user_id = auth.uid() where id = inv.child_id;
      -- children already have names in the app; their profile inherits it
      update profiles set name = (select name from children where id = inv.child_id)
        where id = auth.uid();
    end if;
    update invites set claimed = true where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============ ACTIVITIES (sports, camps, lessons) ============
-- Recurring: season range + weekdays. One-off game: start_date = end_date.

create table activities (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references arrangements on delete cascade,
  name text not null,
  child_ids uuid[] default '{}',
  start_date date not null,
  end_date date not null,
  days int[] default '{}',   -- 0=Sun … 6=Sat; ignored for one-day activities
  time text,                 -- display text, e.g. "5:30 PM"
  location text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table activities enable row level security;
create policy "activities rw" on activities for all
  using (public.can_access_arrangement(arrangement_id))
  with check (public.can_access_arrangement(arrangement_id));
create policy "child reads activities" on activities for select
  using (public.is_child_of_arrangement(arrangement_id));

-- ============ REALTIME ============
alter publication supabase_realtime add table deviations, expenses, settlements, todos, notifications, children, schedules, todo_comments, day_comments, activities;

-- ============ HOMES MODEL ============
-- A household is a home; an arrangement connects two homes around a set of
-- kids. The founding side keeps its household (h); the co-parent side gets a
-- household of its own when they join, so either parent can later bring a
-- partner into their home with full manage rights on that arrangement.
-- Run this whole section once on an existing database.

alter table arrangements rename column household_id to h_household_id;
alter table arrangements rename constraint arrangements_household_id_fkey to arrangements_h_household_id_fkey;
-- If the c-side home is ever deleted, the arrangement survives and that side
-- simply reverts to "not joined" (the h side owns the row and cascades).
alter table arrangements add column c_household_id uuid references households on delete set null;

-- Who am I to these kids? Self-declared, per arrangement. Purely display —
-- permissions come from household membership, so "grandparent" works for a
-- manager and a read-only viewer alike.
create table member_identities (
  arrangement_id uuid references arrangements on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  identity text not null check (identity in ('mom','dad','stepmom','stepdad','grandparent','other')),
  label text,   -- freeform override, e.g. "Grandma Jo"; null = capitalized identity
  primary key (arrangement_id, user_id)
);

-- Optional personal nickname for an arrangement (each viewer sees their own).
create table arrangement_prefs (
  arrangement_id uuid references arrangements on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  nickname text,
  primary key (arrangement_id, user_id)
);

-- Read-only adults (they see everything, including money; children don't).
create table arrangement_viewers (
  arrangement_id uuid references arrangements on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (arrangement_id, user_id)
);

alter table member_identities enable row level security;
alter table arrangement_prefs enable row level security;
alter table arrangement_viewers enable row level security;

-- ---- access helpers, homes edition ----

-- Which side of the arrangement am I on, via household membership?
create or replace function public.arrangement_side(aid uuid)
returns text language sql security definer stable set search_path = public as $$
  select case
    when exists (select 1 from arrangements a join household_members hm on hm.household_id = a.h_household_id
                 where a.id = aid and hm.user_id = auth.uid()) then 'h'
    when exists (select 1 from arrangements a join household_members hm on hm.household_id = a.c_household_id
                 where a.id = aid and hm.user_id = auth.uid()) then 'c'
  end;
$$;

-- A direct party: member of either side's household. Full manage + decide.
create or replace function public.is_arrangement_member(aid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.arrangement_side(aid) is not null;
$$;

create or replace function public.is_arrangement_viewer(aid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from arrangement_viewers where arrangement_id = aid and user_id = auth.uid());
$$;

-- Full visibility (adults): party on either side, or invited viewer.
create or replace function public.can_access_arrangement(aid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_arrangement_member(aid) or public.is_arrangement_viewer(aid);
$$;

-- Anyone attached to an arrangement in any capacity (incl. child logins).
create or replace function public.attached_to_arrangement(aid uuid, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from arrangements a
                 join household_members hm on hm.household_id in (a.h_household_id, a.c_household_id)
                 where a.id = aid and hm.user_id = uid)
      or exists (select 1 from arrangement_viewers v where v.arrangement_id = aid and v.user_id = uid)
      or exists (select 1 from children c where c.arrangement_id = aid and c.user_id = uid);
$$;

create or replace function public.shares_context(other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from household_members h1 join household_members h2 using (household_id)
                 where h1.user_id = auth.uid() and h2.user_id = other)
      or exists (select 1 from arrangements a
                 where public.attached_to_arrangement(a.id, auth.uid())
                   and public.attached_to_arrangement(a.id, other));
$$;

-- A household is visible when I'm in it, or it sits on either side of an
-- arrangement I can see (adults and child logins both need the other side's
-- names).
create or replace function public.household_in_view(hid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_household_member(hid)
      or exists (select 1 from arrangements a
                 where (a.h_household_id = hid or a.c_household_id = hid)
                   and (public.can_access_arrangement(a.id) or public.is_child_of_arrangement(a.id)));
$$;

create policy "read side households" on households for select
  using (public.household_in_view(id));
create policy "read side household members" on household_members for select
  using (public.household_in_view(household_id));

-- ---- backfill: coparents become one-person households on the c side ----

do $$
declare u record; hid uuid;
begin
  for u in select distinct am.user_id from arrangement_members am where am.role = 'coparent' loop
    hid := gen_random_uuid();
    insert into households (id, name, created_by)
      select hid, coalesce(p.name, split_part(p.email,'@',1)), u.user_id from profiles p where p.id = u.user_id;
    insert into household_members (household_id, user_id) values (hid, u.user_id);
    update arrangements a set c_household_id = hid
      where a.c_household_id is null
        and exists (select 1 from arrangement_members am
                    where am.arrangement_id = a.id and am.user_id = u.user_id and am.role = 'coparent');
  end loop;

  -- Seed identities where they're unambiguous: the coparent inherits the
  -- kid-facing label, and so does the h-side parent when the household has
  -- exactly one member.
  insert into member_identities (arrangement_id, user_id, identity, label)
  select am.arrangement_id, am.user_id,
         case lower(coalesce(a.kid_c_label,'')) when 'mom' then 'mom' when 'dad' then 'dad' else 'other' end,
         case when lower(coalesce(a.kid_c_label,'')) in ('mom','dad') then null else a.kid_c_label end
  from arrangement_members am join arrangements a on a.id = am.arrangement_id
  where am.role = 'coparent' and a.kid_c_label is not null
  on conflict do nothing;

  -- The h-side parent is the member who held the 'household' role on the
  -- arrangement itself (its founder), not just anyone in the household.
  insert into member_identities (arrangement_id, user_id, identity, label)
  select am.arrangement_id, am.user_id,
         case lower(coalesce(a.kid_h_label,'')) when 'mom' then 'mom' when 'dad' then 'dad' else 'other' end,
         case when lower(coalesce(a.kid_h_label,'')) in ('mom','dad') then null else a.kid_h_label end
  from arrangement_members am join arrangements a on a.id = am.arrangement_id
  where am.role = 'household' and a.kid_h_label is not null
  on conflict do nothing;
end $$;

-- Memberships are now derived from households; the table and its policies go.
drop policy "read arr members" on arrangement_members;
drop policy "household adds self to own arrangement" on arrangement_members;
drop table arrangement_members;

-- ---- policy surgery: viewers read, parties write ----

drop policy "children rw" on children;
create policy "children read" on children for select using (public.can_access_arrangement(arrangement_id));
create policy "children write" on children for insert with check (public.is_arrangement_member(arrangement_id));
create policy "children update" on children for update using (public.is_arrangement_member(arrangement_id));
create policy "children delete" on children for delete using (public.is_arrangement_member(arrangement_id));

drop policy "schedules rw" on schedules;
create policy "schedules read" on schedules for select using (public.can_access_arrangement(arrangement_id));
create policy "schedules write" on schedules for insert with check (public.is_arrangement_member(arrangement_id));
create policy "schedules update" on schedules for update using (public.is_arrangement_member(arrangement_id));
create policy "schedules delete" on schedules for delete using (public.is_arrangement_member(arrangement_id));

drop policy "settlements rw" on settlements;
create policy "settlements read" on settlements for select using (public.can_access_arrangement(arrangement_id));
create policy "settlements write" on settlements for insert
  with check (public.is_arrangement_member(arrangement_id) and created_by = auth.uid());
create policy "settlements delete" on settlements for delete
  using (public.is_arrangement_member(arrangement_id) and created_by = auth.uid());

drop policy "todos rw" on todos;
create policy "todos read" on todos for select using (public.can_access_arrangement(arrangement_id));
create policy "todos write" on todos for insert with check (public.is_arrangement_member(arrangement_id));
create policy "todos update" on todos for update using (public.is_arrangement_member(arrangement_id));
create policy "todos delete" on todos for delete using (public.is_arrangement_member(arrangement_id));

drop policy "activities rw" on activities;
create policy "activities read" on activities for select using (public.can_access_arrangement(arrangement_id));
create policy "activities write" on activities for insert with check (public.is_arrangement_member(arrangement_id));
create policy "activities update" on activities for update using (public.is_arrangement_member(arrangement_id));
create policy "activities delete" on activities for delete using (public.is_arrangement_member(arrangement_id));

drop policy "activity write" on activity_log;
create policy "activity write" on activity_log for insert
  with check (public.is_arrangement_member(arrangement_id) and user_id = auth.uid());

drop policy "expenses insert" on expenses;
create policy "expenses insert" on expenses for insert
  with check (public.is_arrangement_member(arrangement_id) and created_by = auth.uid());
drop policy "deviations insert" on deviations;
create policy "deviations insert" on deviations for insert
  with check (public.is_arrangement_member(arrangement_id) and proposed_by = auth.uid());

drop policy "comments write" on todo_comments;
create policy "comments write" on todo_comments for insert
  with check (public.is_arrangement_member(arrangement_id) and author = auth.uid());
drop policy "day comments write" on day_comments;
create policy "day comments write" on day_comments for insert
  with check (public.is_arrangement_member(arrangement_id) and author = auth.uid());

drop policy "receipts write" on storage.objects;
create policy "receipts write" on storage.objects for insert
  with check (bucket_id = 'receipts' and public.is_arrangement_member(((storage.foldername(name))[1])::uuid));
drop policy "receipts delete" on storage.objects;
create policy "receipts delete" on storage.objects for delete
  using (bucket_id = 'receipts' and public.is_arrangement_member(((storage.foldername(name))[1])::uuid));

-- Identities: everyone attached may read (children need "Mom"/"Dad");
-- each person writes only their own row.
create policy "identities read" on member_identities for select
  using (public.can_access_arrangement(arrangement_id) or public.is_child_of_arrangement(arrangement_id));
create policy "identities write own" on member_identities for insert
  with check (user_id = auth.uid() and public.can_access_arrangement(arrangement_id));
create policy "identities update own" on member_identities for update
  using (user_id = auth.uid());
create policy "identities delete own" on member_identities for delete
  using (user_id = auth.uid());

-- Nicknames are private to their owner.
create policy "prefs own" on arrangement_prefs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_arrangement(arrangement_id));

create policy "viewers read" on arrangement_viewers for select
  using (public.can_access_arrangement(arrangement_id));
create policy "viewers remove" on arrangement_viewers for delete
  using (public.is_arrangement_member(arrangement_id) or user_id = auth.uid());
-- inserts happen only via claim_invites (security definer)

-- Invites: add the read-only viewer role; only direct parties may invite
-- into an arrangement.
alter table invites drop constraint invites_role_check;
alter table invites add constraint invites_role_check check (role in ('household','coparent','child','viewer'));
drop policy "create invites" on invites;
create policy "create invites" on invites for insert
  with check (invited_by = auth.uid() and (
    (household_id is not null and public.is_household_member(household_id)) or
    (arrangement_id is not null and public.is_arrangement_member(arrangement_id)) or
    (child_id is not null and exists
      (select 1 from children c where c.id = child_id and public.is_arrangement_member(c.arrangement_id)))));

-- Claiming: a coparent gets (or joins) the c-side household; viewers get a
-- viewer row; household/child invites work as before.
create or replace function public.claim_invites()
returns int language plpgsql security definer set search_path = public as $$
declare inv record; n int := 0; hid uuid;
begin
  for inv in select * from invites
             where lower(email) = lower(auth.email()) and not claimed loop
    if inv.household_id is not null then
      insert into household_members (household_id, user_id)
      values (inv.household_id, auth.uid()) on conflict do nothing;
    end if;
    if inv.arrangement_id is not null and inv.role = 'coparent' then
      select c_household_id into hid from arrangements where id = inv.arrangement_id;
      if hid is null then
        hid := gen_random_uuid();
        insert into households (id, name, created_by)
          select hid, coalesce(p.name, split_part(p.email,'@',1)), auth.uid()
          from profiles p where p.id = auth.uid();
        update arrangements set c_household_id = hid where id = inv.arrangement_id;
      end if;
      insert into household_members (household_id, user_id)
      values (hid, auth.uid()) on conflict do nothing;
    end if;
    if inv.arrangement_id is not null and inv.role = 'viewer' then
      insert into arrangement_viewers (arrangement_id, user_id)
      values (inv.arrangement_id, auth.uid()) on conflict do nothing;
    end if;
    if inv.child_id is not null then
      update children set user_id = auth.uid() where id = inv.child_id;
      update profiles set name = (select name from children where id = inv.child_id)
        where id = auth.uid();
    end if;
    update invites set claimed = true where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Notifications now reach both homes (viewers stay quiet).
create or replace function public.notify_arrangement(aid uuid, actor uuid, ntype text, msg text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, arrangement_id, type, message, read)
  select distinct hm.user_id, aid, ntype, msg, (hm.user_id = actor)
  from arrangements a
  join household_members hm on hm.household_id in (a.h_household_id, a.c_household_id)
  where a.id = aid;
end $$;

alter publication supabase_realtime add table member_identities, arrangement_viewers, arrangement_prefs;

-- ============ NOTIFICATION HYGIENE ============
-- Notifications carry a reference to the row that caused them, so deleting
-- that row (withdrawn proposal, deleted expense/comment) retracts any
-- notification nobody has been emailed about yet — no stale entries in the
-- bell or the daily digest.

alter table notifications add column ref_id uuid;

drop function public.notify_arrangement(uuid, uuid, text, text);
create function public.notify_arrangement(aid uuid, actor uuid, ntype text, msg text, ref uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, arrangement_id, type, message, read, ref_id)
  select distinct hm.user_id, aid, ntype, msg, (hm.user_id = actor), ref
  from arrangements a
  join household_members hm on hm.household_id in (a.h_household_id, a.c_household_id)
  where a.id = aid;
end $$;

create or replace function public.trg_expense_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select coalesce(name,email) into nm from profiles where id = auth.uid();
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'expense_pending',
      nm || ' added a $' || round(new.amount,2) || ' expense that needs approval: ' || coalesce(new.description, new.category), new.id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'expense_' || new.status,
      nm || ' ' || new.status || ' the $' || round(new.amount,2) || ' expense: ' || coalesce(new.description, new.category), new.id);
  end if;
  return new;
end $$;

create or replace function public.trg_deviation_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select coalesce(name,email) into nm from profiles where id = auth.uid();
  if tg_op = 'INSERT' and new.status = 'proposed' then
    perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'deviation_proposed',
      nm || ' proposed a schedule change ' || new.start_date || ' to ' || new.end_date || coalesce(': ' || new.note, ''), new.id);
  elsif tg_op = 'UPDATE' and old.status = 'proposed' and new.status <> 'proposed' then
    perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'deviation_' || new.status,
      nm || ' ' || new.status || ' the schedule change for ' || new.start_date || ' to ' || new.end_date, new.id);
  end if;
  return new;
end $$;

create or replace function public.trg_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text; t text;
begin
  select coalesce(name, email) into nm from profiles where id = auth.uid();
  select title into t from todos where id = new.todo_id;
  perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'todo_comment',
    nm || ' commented on "' || coalesce(t, 'a to-do') || '": ' || left(new.body, 120), new.id);
  return new;
end $$;

create or replace function public.trg_day_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select coalesce(name, email) into nm from profiles where id = auth.uid();
  perform public.notify_arrangement(new.arrangement_id, auth.uid(), 'day_comment',
    nm || ' commented on ' || to_char(new.date, 'Mon FMDD') || ': ' || left(new.body, 120), new.id);
  return new;
end $$;

-- Retract notifications for rows that no longer exist. Already-emailed ones
-- stay marked emailed (the email went out; nothing to retract).
create or replace function public.trg_retract_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from notifications where ref_id = old.id;
  return old;
end $$;

create trigger expense_retract after delete on expenses
  for each row execute function public.trg_retract_notifications();
create trigger deviation_retract after delete on deviations
  for each row execute function public.trg_retract_notifications();
create trigger todo_comment_retract after delete on todo_comments
  for each row execute function public.trg_retract_notifications();
create trigger day_comment_retract after delete on day_comments
  for each row execute function public.trg_retract_notifications();

-- ============ CROSS-SIDE DECISIONS ============
-- Approvals must come from the other home. Previously any member of either
-- home (except the proposer) could decide — which let a partner approve
-- their own household's proposal.

create or replace function public.side_of(aid uuid, uid uuid)
returns text language sql security definer stable set search_path = public as $$
  select case
    when exists (select 1 from arrangements a join household_members hm on hm.household_id = a.h_household_id
                 where a.id = aid and hm.user_id = uid) then 'h'
    when exists (select 1 from arrangements a join household_members hm on hm.household_id = a.c_household_id
                 where a.id = aid and hm.user_id = uid) then 'c'
  end;
$$;

create or replace function public.arrangement_side(aid uuid)
returns text language sql security definer stable set search_path = public as $$
  select public.side_of(aid, auth.uid());
$$;

drop policy "deviations decide" on deviations;
create policy "deviations decide" on deviations for update
  using (public.is_arrangement_member(arrangement_id)
     and public.arrangement_side(arrangement_id) is distinct from public.side_of(arrangement_id, proposed_by));

drop policy "expenses decide" on expenses;
create policy "expenses decide" on expenses for update
  using (public.is_arrangement_member(arrangement_id)
     and public.arrangement_side(arrangement_id) is distinct from public.side_of(arrangement_id, created_by));
