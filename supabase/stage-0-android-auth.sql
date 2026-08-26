-- ============================================================================
-- Native Android — Stage 0
-- Supabase Auth, application roles, and role-aware RLS
--
-- Prepared 25 August 2026. Additive and re-runnable.
--
-- The web admin reads through the service-role key and is UNAFFECTED by
-- everything in this file. Nothing here changes any existing policy, and no
-- existing row is rewritten.
--
-- RUN ORDER — this matters:
--   1. PART A (this file, top section)      SQL editor
--   2. PART B                               Supabase dashboard, no SQL
--   3. PART C (this file, bottom section)   SQL editor, after PART B
--
-- Running PART C before PART B updates zero rows and looks like it worked.
-- ============================================================================


-- ============================================================================
-- PART A — schema, roles, policies
-- Safe to run now. Safe to run again.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A1. profiles — one row per auth user, holding the application role.
--
-- The role lives here rather than in auth.users.raw_user_meta_data because
-- that column is writable by the user it describes, which makes it useless as
-- a security boundary — anyone could promote themselves.
--
--   'admin'  — Dean. Everything.
--   'editor' — planned: project status, deadlines, recording progress. No
--              financial columns, no studio settings, no writes.
--
-- The default is 'editor' deliberately. A default of 'admin' means any row
-- created by a path nobody anticipated — a mis-fired trigger, signup re-enabled
-- by accident, a hand-written insert — silently produces a second
-- administrator. There is exactly one admin and his row is set explicitly in
-- PART C.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  role         text        not null default 'editor',
  display_name text        not null default '',
  created_at   timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('admin', 'editor'));
  end if;
end $$;

alter table public.profiles enable row level security;

-- Privilege-level lockdown, independent of any policy.
--
-- 'authenticated' gets SELECT and nothing else, so even if a permissive
-- UPDATE policy were added here by mistake in some later stage, PostgREST
-- would still refuse the write for want of the grant. Two independent things
-- have to go wrong before a user can change their own role.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all    on public.profiles to service_role;


-- ----------------------------------------------------------------------------
-- A2. Auto-create a profile whenever an auth user appears.
--
-- security definer because the trigger runs as the signing-up user, who has no
-- rights on profiles at all after the revoke above.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- A3. The role lookup every policy below goes through.
--
-- security definer is REQUIRED, not stylistic. profiles has RLS enabled and
-- its own policy calls this function; without security definer the function's
-- read of profiles would itself be filtered by the policy that is calling the
-- function. That is infinite recursion, and Postgres reports it as a
-- stack-depth error at query time rather than at creation — it looks like a
-- mystery until you know.
--
-- set search_path is also required: a mutable search path on a security
-- definer function is a privilege-escalation vector.
--
-- Policies must call this as (select public.current_app_role()), never bare.
-- The subquery form lets Postgres evaluate it once per query as an InitPlan
-- instead of once per row.
-- ----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- A4. Policies.
--
-- Deliberately drop-and-recreate rather than the "if not exists" guard used
-- elsewhere in migrations.sql. The guard means that if a policy definition is
-- ever corrected, re-running the file silently keeps the old, wrong one. These
-- are security boundaries; they should converge on the definition in this file
-- every time it runs.
-- ----------------------------------------------------------------------------

-- profiles: own row only.
--
-- Note what is absent: there is no INSERT, UPDATE or DELETE policy. With none,
-- PostgREST refuses all three regardless of payload. Roles change through the
-- service-role key only — the dashboard, or the web admin.
drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Service role full access" on public.profiles;
create policy "Service role full access" on public.profiles
  for all using (auth.role() = 'service_role');

-- board_cards: admin only for now.
--
-- The role list is the extension point. Giving the editor access to the TABLE
-- would expose pfh_rate and payment_type, so the editor will instead read a
-- narrowed security_invoker view, and this policy widens to
-- in ('admin', 'editor') at that point so the view can read through it.
-- in ('admin') reads oddly with one element. That is the seam, on purpose.
drop policy if exists "Role read" on public.board_cards;
create policy "Role read" on public.board_cards
  for select to authenticated
  using ((select public.current_app_role()) in ('admin'));

-- site_settings: admin only, permanently.
--
-- Rates, capacity, day length. The editor never needs these and they sit close
-- enough to financial detail to keep out of reach.
drop policy if exists "Role read" on public.site_settings;
create policy "Role read" on public.site_settings
  for select to authenticated
  using ((select public.current_app_role()) in ('admin'));


-- ----------------------------------------------------------------------------
-- A5. Revoke write privileges from anon and authenticated.
--
-- NOT a precaution — a live finding. Both tables currently grant
-- INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER to BOTH anon and
-- authenticated. That is Supabase's default for tables created through the
-- dashboard, and today only RLS stands between the anon key and
-- `delete from board_cards`. It has never been exploitable because neither
-- table has a permissive write policy — but that means a single mistaken
-- `for all` policy in any future stage is the whole distance between safe and
-- catastrophic.
--
-- Revoking makes read-only structural rather than policy-dependent. SELECT is
-- kept so RLS remains the thing that governs reads (anon still gets 0 rows,
-- authenticated gets what its role allows) rather than a privilege error.
--
-- Stage 2 adds admin writes and will re-grant INSERT/UPDATE to authenticated
-- explicitly and deliberately. That is the correct time to do it.
--
-- The web admin uses the service-role key and is untouched by this.
-- ----------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger
  on public.board_cards   from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.site_settings from anon, authenticated;

grant select on public.board_cards   to authenticated;
grant select on public.site_settings to authenticated;

-- PostgREST caches the schema. New table, so nudge it.
notify pgrst, 'reload schema';


-- ----------------------------------------------------------------------------
-- A6. Pre-flight assertion — STOP HERE and read the output before PART B.
--
-- Added after the first run of this file, where the admin user was created
-- without a profile row. The trigger from A2 must exist BEFORE any user is
-- created; a user created first gets no profile and no error, and the symptom
-- (PART C updating zero rows) appears in a completely different place from the
-- cause.
--
-- This raises rather than returning a row, so it cannot be skimmed past.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'on_auth_user_created'
       and tgrelid = 'auth.users'::regclass
       and tgenabled <> 'D'
  ) then
    raise exception
      'STOP: on_auth_user_created is missing or disabled. Do not create any user until it exists.';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'handle_new_user' and p.prosecdef
  ) then
    raise exception
      'STOP: public.handle_new_user() is missing or is not SECURITY DEFINER.';
  end if;

  raise notice 'PART A complete. Trigger and function verified. Proceed to PART B.';
end $$;


-- ============================================================================
-- PART B — dashboard, no SQL. Do this before PART C.
-- ============================================================================
--
-- B1. DISABLE PUBLIC SIGNUP  ⚠  the security-critical step
--
--     Authentication → Sign In / Providers → Email
--     → turn OFF "Allow new users to sign up"
--
--     The policies above grant on role. Supabase allows public email/password
--     signup BY DEFAULT. With signup open, anyone could create an account and
--     receive an 'editor' profile from the trigger in A2. The 'editor' default
--     limits the damage; it does not remove the need to get this right.
--
--     Do this FIRST, before creating the admin user below.
--
-- B2. CREATE THE ADMIN USER
--
--     Authentication → Users → Add user
--       Email:        Dean's admin email
--       Password:     generated, stored in a password manager
--       Auto-confirm: YES  (there is no confirmation flow to complete)
--
--     Dashboard user creation uses the admin API and still works with signup
--     disabled. The A2 trigger gives this user a profile row with role
--     'editor'; PART C promotes it.
--
--     Do not create this user from code. Do not put the password in any file.
-- ============================================================================


-- ============================================================================
-- PART C — promote the admin. Run AFTER PART B.
-- ============================================================================

-- C1. Backfill any auth user that has no profile row.
--
-- Self-healing, and it exists because this failed once: a user created before
-- the A2 trigger existed gets no profile, and every downstream symptom —
-- an empty board, a null role, a promotion that updates zero rows — points
-- somewhere other than the cause. Defaults to 'editor', like the trigger.
--
-- Safe on every future run: with the trigger working, this matches nothing.
insert into public.profiles (id)
select u.id
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null;

-- C2. Promote the admin.
--
-- An upsert rather than an update, for the same reason. An UPDATE against a
-- missing row succeeds, reports "0 rows", and leaves you with a working login
-- that can read nothing. This cannot fail that way.
--
-- Replace the email, then run. Keyed on email rather than a hard-coded uuid,
-- which would differ in any future environment.
insert into public.profiles (id, role, display_name)
select id, 'admin', 'Dean'
  from auth.users
 where email = 'REPLACE_WITH_ADMIN_EMAIL'
on conflict (id) do update
   set role = 'admin',
       display_name = 'Dean';

-- Confirm. Expect exactly one row: the admin email, role 'admin'.
-- If this returns zero rows, PART B did not happen or the email does not match.
select u.email, p.role, p.display_name, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
 order by p.created_at;
