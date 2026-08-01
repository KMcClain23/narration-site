-- ============================================================
-- narration-site — Supabase migrations
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS
-- ============================================================

-- board_messages: author ↔ dean messaging thread per card
create table if not exists board_messages (
  id          uuid        primary key default gen_random_uuid(),
  card_id     uuid        not null references board_cards(id) on delete cascade,
  sender      text        not null,            -- 'dean' | 'author'
  sender_name text        not null default '', -- display name
  text        text        not null,
  read        boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists board_messages_card_created
  on board_messages(card_id, created_at);

create index if not exists board_messages_card_sender_read
  on board_messages(card_id, sender, read);

-- Optional per-book columns on board_cards
alter table board_cards add column if not exists first_15_complete boolean  default false;
alter table board_cards add column if not exists dean_message      text;
alter table board_cards add column if not exists author_email      text;
alter table board_cards add column if not exists slug              text;

-- admin_integrations: stores OAuth tokens for external services (e.g. Microsoft 365)
create table if not exists admin_integrations (
  id            uuid        primary key default gen_random_uuid(),
  service       text        not null unique,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create unique index if not exists admin_integrations_service_idx
  on admin_integrations(service);

-- status_change_log: audit trail for batched author status-update emails
create table if not exists status_change_log (
  id         uuid        primary key default gen_random_uuid(),
  card_id    uuid        references board_cards(id) on delete cascade,
  old_status text,
  new_status text,
  emailed    boolean     default false,
  created_at timestamptz default now()
);

create index if not exists status_change_log_unemailed
  on status_change_log(emailed, created_at)
  where emailed = false;

-- site_settings: simple key/value store for admin-controlled site flags
create table if not exists site_settings (
  key        text        primary key,
  value      text        not null,
  updated_at timestamptz default now()
);

insert into site_settings (key, value)
  values ('accepting_projects', 'true')
  on conflict do nothing;

-- email column on authors table for status notification emails
alter table authors add column if not exists email text;

-- email column on co_narrators table
alter table co_narrators add column if not exists email text;

-- released_at: publication date, auto-stamped when status transitions to "released"
alter table board_cards add column if not exists released_at timestamptz;

-- analytics events
create table if not exists analytics_events (
  id         uuid        primary key default gen_random_uuid(),
  event      text        not null,
  page       text,
  metadata   jsonb,
  created_at timestamptz default now()
);

create index if not exists analytics_events_event_created
  on analytics_events(event, created_at desc);

-- is_confidential: marks under-NDA projects. Hides title/author/cover/etc. on
-- the public site while remaining fully visible to Dean on the admin board.
alter table board_cards add column if not exists is_confidential boolean not null default false;

-- production_contacts: outreach CRM for production houses
create table if not exists production_contacts (
  id                serial      primary key,
  company           text        not null default '',
  label             text        not null default '',
  status            text        not null default '',
  job_titles        text[]      not null default '{}',
  contact_names     text[]      not null default '{}',
  contact_info      text        not null default '',
  address           text        not null default '',
  website           text        not null default '',
  finding_source    text        not null default '',
  preferred_contact text        not null default '',
  date_contacted    text        not null default '',
  next_contact_date text        not null default '',
  genres            text[]      not null default '{}',
  notes             text        not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- narration_format: how the audiobook is narrated. Nullable — unset by default,
-- no CHECK violation for existing rows.
alter table board_cards add column if not exists narration_format text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'board_cards_narration_format_check'
  ) then
    alter table board_cards
      add constraint board_cards_narration_format_check
      check (narration_format is null or narration_format in ('solo', 'dual', 'duet', 'multicast'));
  end if;
end $$;

-- production_type/production_company: whether a project is with an indie
-- author or a production company, and which one. production_company is free
-- text (not CHECK-constrained) so "Other" custom entries work without a
-- migration — the admin UI's dropdown enforces the curated list.
alter table board_cards add column if not exists production_type text;
alter table board_cards add column if not exists production_company text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'board_cards_production_type_check'
  ) then
    alter table board_cards
      add constraint board_cards_production_type_check
      check (production_type is null or production_type in ('indie', 'company'));
  end if;
end $$;

-- archived_at/archived_reason/archived_notes: soft-archive for projects no
-- longer active in the pipeline (recasted, canceled, etc.) that should stay
-- accessible in the admin but hidden everywhere else. Separate from status
-- (active workflow stage) and is_confidential (NDA visibility) — a card can
-- be archived regardless of what either of those is set to.
alter table board_cards add column if not exists archived_at     timestamptz;
alter table board_cards add column if not exists archived_reason text;
alter table board_cards add column if not exists archived_notes  text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'board_cards_archived_reason_check'
  ) then
    alter table board_cards
      add constraint board_cards_archived_reason_check
      check (archived_reason is null or archived_reason in ('recasted', 'canceled', 'other'));
  end if;
end $$;

-- photo_url: profile photo for authors and co-narrators, shown alongside
-- their name on book detail pages. Nullable — PersonAvatar falls back to
-- rendered initials when unset.
alter table authors      add column if not exists photo_url text;
alter table co_narrators add column if not exists photo_url text;

-- Stage 2 (admin redesign): add 'prepping' as a valid board_cards.status
-- value, so the new board (/board-v2) can distinguish "queued for
-- recording" from "actively recording" without overloading an existing
-- status. Confirmed via production data + app code that the full current
-- set is audition/contracted/recording/editing/released — all preserved,
-- 'prepping' is additive only.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'board_cards_status_check'
  ) then
    alter table board_cards drop constraint board_cards_status_check;
  end if;
  alter table board_cards
    add constraint board_cards_status_check
    check (status in ('audition', 'contracted', 'prepping', 'recording', 'editing', 'released'));
end $$;

-- Stage 4.1 (admin redesign — Contacts/Authors): new author profile fields
-- for the /contacts/authors detail page (location, preferred contact method,
-- genre chips, free-form notes). Mirrors the naming/typing already used on
-- production_contacts (preferred_contact, genres, notes) for consistency.
alter table authors add column if not exists location           text  not null default '';
alter table authors add column if not exists preferred_contact  text  not null default '';
alter table authors add column if not exists genres             text[] not null default '{}';
alter table authors add column if not exists notes              text  not null default '';

-- 'threads' has been live on authors for a while (used throughout app code)
-- but was never captured in a tracked migration — this brings the file in
-- sync with reality. No-op if the column already exists.
alter table authors add column if not exists threads text not null default '';

-- Stage 4.2 (admin redesign — Contacts/Co-Narrators): the only genuinely new
-- column. location/preferred_contact/skills/notes already exist live in
-- production (added outside any tracked migration) — see the sync block below.
alter table co_narrators add column if not exists representation text not null default '';

-- Documentation only — brings migrations.sql in sync with reality for four
-- columns that already exist live (confirmed via direct query) but were
-- never captured in a tracked migration, mirroring the 'threads' sync above.
alter table co_narrators add column if not exists location          text   not null default '';
alter table co_narrators add column if not exists preferred_contact text   not null default '';
alter table co_narrators add column if not exists skills            text[] not null default '{}';
alter table co_narrators add column if not exists notes             text   not null default '';

-- ============================================================
-- Stage 7.2a — schema drift documentation sync (audited 2026-07-31)
-- Every statement below is documentation-only: the column/constraint/table
-- already exists live. IF NOT EXISTS / guarded DO blocks make all of this
-- a permanent no-op against production. Nothing here changes live data.
-- ============================================================

-- ----------------------------------------------------------------
-- GROUP 1 — column-drift doc-sync on existing (partially-tracked) tables
-- ----------------------------------------------------------------

-- board_cards: base columns that predate this migrations file entirely
-- (confirmed live via information_schema audit, Stage 7.2a)
alter table board_cards add column if not exists title                  text        not null;
alter table board_cards add column if not exists author                 text        not null default '';
alter table board_cards add column if not exists cover_url              text        not null default '';
alter table board_cards add column if not exists status                 text        not null default 'audition';
alter table board_cards add column if not exists deadline               date;
alter table board_cards add column if not exists notes                  text        not null default '';
alter table board_cards add column if not exists author_notes           text        not null default '';
alter table board_cards add column if not exists links                  jsonb       not null default '[]';
alter table board_cards add column if not exists author_token           text        not null default encode(gen_random_bytes(16), 'hex');
alter table board_cards add column if not exists co_narrator            text        not null default '';
alter table board_cards add column if not exists sort_order             integer     not null default 0;
alter table board_cards add column if not exists created_at             timestamptz not null default now();
alter table board_cards add column if not exists updated_at             timestamptz not null default now();
alter table board_cards add column if not exists subtitle               text        not null default '';
alter table board_cards add column if not exists tags                   text[]      not null default '{}';
alter table board_cards add column if not exists description            text        not null default '';
alter table board_cards add column if not exists audible_link           text        not null default '';
alter table board_cards add column if not exists ar_link                text        not null default '';
alter table board_cards add column if not exists books_table_id         uuid;
alter table board_cards add column if not exists chapters               jsonb       not null default '[]';
alter table board_cards add column if not exists word_count             integer     not null default 0;
alter table board_cards add column if not exists first15_due            date;
alter table board_cards add column if not exists pfh_rate               numeric     not null default 0;
alter table board_cards add column if not exists payment_type           text        not null default 'pfh';
alter table board_cards add column if not exists email_updates_enabled  boolean     default true;
alter table board_cards add column if not exists spotify_link           text;
alter table board_cards add column if not exists script_url             text;
alter table board_cards add column if not exists trigger_warnings       text[]      not null default '{}';

-- authors: base columns that predate this migrations file entirely
alter table authors add column if not exists id          uuid        primary key default gen_random_uuid();
alter table authors add column if not exists name        text        not null;
alter table authors add column if not exists bio         text        not null default '';
alter table authors add column if not exists website     text        not null default '';
alter table authors add column if not exists amazon      text        not null default '';
alter table authors add column if not exists instagram   text        not null default '';
alter table authors add column if not exists tiktok      text        not null default '';
alter table authors add column if not exists facebook    text        not null default '';
alter table authors add column if not exists goodreads   text        not null default '';
alter table authors add column if not exists created_at  timestamptz not null default now();

-- co_narrators: base columns that predate this migrations file entirely
alter table co_narrators add column if not exists id          uuid        primary key default gen_random_uuid();
alter table co_narrators add column if not exists name        text        not null;
alter table co_narrators add column if not exists bio         text        not null default '';
alter table co_narrators add column if not exists website     text        not null default '';
alter table co_narrators add column if not exists amazon      text        not null default '';
alter table co_narrators add column if not exists instagram   text        not null default '';
alter table co_narrators add column if not exists tiktok      text        not null default '';
alter table co_narrators add column if not exists facebook    text        not null default '';
alter table co_narrators add column if not exists goodreads   text        not null default '';
alter table co_narrators add column if not exists created_at  timestamptz not null default now();

-- production_contacts: already matches live exactly, no drift — no
-- statements needed, listed here only to confirm it was checked.

-- ----------------------------------------------------------------
-- GROUP 2 — constraint doc-sync on existing tables
-- ----------------------------------------------------------------

-- payment_type: valid values already enforced live but never captured here
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'board_cards_payment_type_check'
  ) then
    alter table board_cards
      add constraint board_cards_payment_type_check
      check (payment_type in ('pfh', 'rs', 'rs_plus'));
  end if;
end $$;

-- Note: board_messages_sender_check intentionally NOT doc-synced — the
-- table itself is retired in Stage 7.5 (see comment + memory note below),
-- so the constraint goes away with it rather than being tracked here.

-- ----------------------------------------------------------------
-- GROUP 3 — full CREATE TABLE reconstruction (four fully-untracked tables)
-- ----------------------------------------------------------------

-- books: legacy public-book listing table. NOTE: /api/books GET actually
-- reads from board_cards ("source of truth is board_cards"), while
-- POST/PUT/PATCH/DELETE still write to this table — read/write paths are
-- disconnected. Reconstructed here for documentation only; likely a
-- candidate for its own future deletion review.
create table if not exists books (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  subtitle    text,
  author      text        not null,
  link        text        not null default '',
  cover_url   text        not null,
  tags        text[]      not null default '{}',
  description text        not null default '',
  category    text        not null,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Normalized to match board_cards.co_narrator's convention (plain text,
  -- default '') rather than the odd array-literal default observed live —
  -- two same-named columns in the same codebase should share a shape.
  co_narrator text        not null default ''
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'books_category_check'
  ) then
    alter table books
      add constraint books_category_check
      check (category in ('completed', 'in-progress', 'coming-soon'));
  end if;
end $$;

-- demos: backs /demos-v2
create table if not exists demos (
  id                uuid        primary key default gen_random_uuid(),
  title             text        not null,
  genre             text,
  description       text,
  file_url          text,
  file_key          text,
  duration_seconds  integer,
  sort_order        integer     default 0,
  active            boolean     default true,
  created_at        timestamptz default now()
);

-- pdf_jobs: async PDF-generation job tracking (board-pdf-* routes)
create table if not exists pdf_jobs (
  id         uuid        primary key default gen_random_uuid(),
  status     text        not null default 'pending',
  chapters   jsonb,
  error      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- testimonials: Testimonial Queue (relevant to Stage 7.3)
create table if not exists testimonials (
  id            uuid        primary key default gen_random_uuid(),
  reviewer_name text        not null,
  reviewer_role text        not null,
  book_title    text        not null default '',
  quote         text        not null,
  status        text        not null default 'pending',
  created_at    timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'testimonials_reviewer_role_check'
  ) then
    alter table testimonials
      add constraint testimonials_reviewer_role_check
      check (reviewer_role in ('author', 'narrator'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'testimonials_status_check'
  ) then
    alter table testimonials
      add constraint testimonials_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- ----------------------------------------------------------------
-- GROUP 4 — board_messages: documented, not reconstructed
-- ----------------------------------------------------------------

-- board_messages: retired feature, table exists in production but not
-- tracked here. Table itself will be dropped in Stage 7.5.

-- ============================================================
-- Stage 7.4 Commit 5 — author-portal retirement: drop columns + tables
-- Applied and verified against production 2026-08-01 (author-facing
-- /board/[token] portal, its Resend email flow, and the PDF-chapter
-- subsystem were already deleted in Commits 2-4; this is the final data
-- cleanup). IF EXISTS guards make this safe to re-run.
-- ============================================================

begin;

-- Drop six columns from board_cards
alter table board_cards
  drop column if exists dean_message,
  drop column if exists author_notes,
  drop column if exists author_token,
  drop column if exists author_email,
  drop column if exists email_updates_enabled,
  drop column if exists books_table_id;

-- Drop two orphaned tables
drop table if exists status_change_log;
drop table if exists pdf_jobs;

commit;
