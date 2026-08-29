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
  -- 'recast' belongs to Stage 9, further down this file, but is listed here
  -- too. This script is cumulative and meant to be re-runnable, and a live row
  -- already carries that status: without it this block fails on the way past,
  -- before the statement that would have permitted it is ever reached.
  alter table board_cards
    add constraint board_cards_status_check
    check (status in ('audition', 'contracted', 'prepping', 'recording', 'editing', 'released', 'recast'));
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

-- board_messages: retired feature, table existed in production but was
-- never tracked here. Dropped in Stage 7.5 — see the entry at the bottom
-- of this file.

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

-- ============================================================
-- Stage 7.5 Commit 4 — old /board retirement: drop board_messages
-- Applied and verified against production 2026-08-02. Old /board/page.tsx
-- (Commit 2) and /api/board-messages (Commit 3) were already deleted —
-- this is the final data cleanup. board_messages_sender_check drops
-- automatically with the table.
-- ============================================================

drop table if exists board_messages;

-- ============================================================
-- Stage 7.7 — per-card narrator share override for Duet/Dual projects
-- Applied and verified against production 2026-08-02. NULL means "use the
-- default" (100% Solo/unset, 50% Duet/Dual, hidden for Multicast); any
-- value 1-99 overrides the default for that card regardless of format.
-- ============================================================

alter table board_cards add column if not exists narrator_share_percent smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'board_cards_narrator_share_percent_check'
  ) then
    alter table board_cards
      add constraint board_cards_narrator_share_percent_check
      check (narrator_share_percent is null or (narrator_share_percent between 1 and 99));
  end if;
end $$;

-- payments: one row per expected payment milestone on a project. A project
-- with "50% on contract, 50% on delivery" is two rows; the common single
-- payment-on-delivery case is one.
--
-- Payment status is deliberately NOT stored — it is derived from the dates
-- and amounts (see src/lib/payments.ts). A stored status drifts the moment a
-- due date passes without anyone opening the app.
create table if not exists payments (
  id              uuid          primary key default gen_random_uuid(),
  card_id         uuid          not null references board_cards(id) on delete cascade,
  -- e.g. "Deposit", "On delivery", "Pickups". Free text: milestone naming
  -- varies per client and a CHECK would need a migration per new client.
  label           text          not null default '',
  -- Nullable on purpose: when unset the app falls back to the calculated
  -- estimate (word_count / 9400 * pfh_rate * share) so a project shows an
  -- expected value before any invoice exists.
  amount_expected numeric(10,2),
  due_on          date,
  invoiced_on     date,
  invoice_number  text          not null default '',
  amount_received numeric(10,2) not null default 0,
  received_on     date,
  method          text          not null default '',
  notes           text          not null default '',
  sort_order      integer       not null default 0,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists payments_card_id_idx on payments (card_id);
create index if not exists payments_due_on_idx  on payments (due_on);

alter table payments enable row level security;

-- Financial rows are admin-only: service-role access exclusively, and
-- deliberately no "Public read access" policy of the kind authors/co_narrators
-- carry for the public site.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'payments'
      and policyname = 'Service role full access'
  ) then
    create policy "Service role full access" on payments
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- books was the last table with RLS disabled: the publishable anon key, which
-- ships to every browser, could read, insert, update and delete the entire
-- public catalogue. Confirmed empirically — an anon INSERT returned a NOT NULL
-- constraint error (23502) rather than an RLS denial, i.e. the write was
-- authorized and only the bad payload stopped it.
--
-- No "Public read access" policy is added, unlike authors/co_narrators. Every
-- read of this table goes through the service-role client, which bypasses RLS
-- entirely — src/lib/supabase-browser.ts (the only anon-key client) has no
-- importers anywhere in the codebase. Matching board_cards, which is likewise
-- public-facing but service-role-only in practice.
alter table books enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'books'
      and policyname = 'Service role full access'
  ) then
    create policy "Service role full access" on books
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- Gross fee for a milestone, across all narrators. Null means "same as
-- amount_expected" — a solo project, or one where the client pays each
-- narrator directly. Invoices bill this rather than the narrator's own share,
-- which would bill half of a duet.
alter table payments add column if not exists amount_gross numeric(10,2);

-- Money leaving the narrator's account after being paid: a co-narrator's half,
-- an editor's fee, a proofer.
--
-- Deliberately does NOT encode tax treatment. Whether a co-narrator split is
-- pass-through or income-with-an-offsetting-deduction depends on how the work
-- is reported and is a question for an accountant, so `kind` records what the
-- money was for and the app reports payouts separately from earnings without
-- asserting which side of the line they fall on.
--
-- Ordering matters and is encoded in src/lib/payments.ts computeWaterfall():
-- editor/proofer come off the gross BEFORE the narrator split, because
-- production costs are borne by the project rather than by one narrator.
create table if not exists payment_payouts (
  id          uuid          primary key default gen_random_uuid(),
  payment_id  uuid          not null references payments(id) on delete cascade,
  payee_name  text          not null default '',
  kind        text          not null default 'co_narrator',
  amount      numeric(10,2) not null default 0,
  -- Editors and proofers commonly bill per finished hour, the same unit the
  -- narrator's own fee uses. `amount` stays authoritative once set: a payout
  -- already made must not move because a word count was corrected later.
  rate_pfh    numeric(10,2),
  paid_on     date,
  notes       text          not null default '',
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create index if not exists payment_payouts_payment_id_idx on payment_payouts (payment_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payment_payouts_kind_check') then
    alter table payment_payouts add constraint payment_payouts_kind_check
      check (kind in ('co_narrator', 'editor', 'proofer', 'agent', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_payouts_amount_check') then
    alter table payment_payouts add constraint payment_payouts_amount_check
      check (amount >= 0);
  end if;
end $$;

alter table payment_payouts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'payment_payouts'
      and policyname = 'Service role full access'
  ) then
    create policy "Service role full access" on payment_payouts
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- Royalty share income is not a fee. Nobody invoices Audible, the amount is
-- unknowable in advance, and it arrives repeatedly and indefinitely rather
-- than once on delivery. Forcing it through the fee fields would mean an
-- "expected" figure nobody can supply and an invoice that will never exist.
--
-- 'fee'     — the existing shape: expected, invoiced, due, gross, payouts.
-- 'royalty' — a statement that arrived: period, amount, date received.
--
-- Defaulting to 'fee' leaves every existing row exactly as it was. An RS+
-- project is simply one fee row plus as many royalty rows as there are
-- statements, which is what RS+ actually is.
alter table payments add column if not exists kind text not null default 'fee';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_kind_check') then
    alter table payments add constraint payments_kind_check
      check (kind in ('fee', 'royalty'));
  end if;
end $$;

-- Which royalty period the statement covers, e.g. "Q1 2026" or "Jan 2026".
-- Free text: distributors report on different cadences and a date range would
-- imply a precision the statements don't always have.
alter table payments add column if not exists period text not null default '';

create index if not exists payments_kind_idx on payments (kind);

-- ============================================================
-- Stage 9: 'recast' board_cards.status
--
-- An author can replace a narrator mid-project. The work stops, but a
-- cancellation fee is usually still due, so the card has to survive as
-- something billable. Archiving it (the previous convention) removed it from
-- the Payments page entirely, which meant the fee could never be invoiced.
--
-- Additive: widens the existing CHECK, no data is rewritten.
-- ============================================================

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'board_cards_status_check') then
    alter table board_cards drop constraint board_cards_status_check;
  end if;

  alter table board_cards
    add constraint board_cards_status_check
    check (status in ('audition', 'contracted', 'prepping', 'recording', 'editing', 'released', 'recast'));
end $$;

-- ============================================================
-- Stage 9: payments.stripe_payment_link
--
-- Stored rather than regenerated: reopening the invoice editor must not mint a
-- second link for the same money, which would leave two live URLs an author
-- could pay against and no way to tell which one they used.
-- ============================================================

alter table payments add column if not exists stripe_payment_link text not null default '';

-- ============================================================
-- Stage 9: payments.paypal_payment_link / paypal_invoice_id
--
-- The PayPal-hosted invoice raised for this payment, alongside the Stripe one.
-- Stored for the same reason: reopening the editor must not mint a second
-- payable link for the same money.
-- ============================================================

alter table payments add column if not exists paypal_payment_link text not null default '';
alter table payments add column if not exists paypal_invoice_id text not null default '';

-- ============================================================
-- Stage 9: payment link closure
--
-- Deactivating a Stripe Payment Link needs its plink_ id; the URL alone cannot
-- address it through the API. payment_links_closed_at is stamped once the
-- outstanding links have been retired, so settling a payment twice doesn't
-- re-call either provider.
-- ============================================================

alter table payments add column if not exists stripe_payment_link_id text not null default '';
alter table payments add column if not exists payment_links_closed_at timestamptz;

-- ============================================================
-- Stage 9: payments.invoice_draft
--
-- The invoice as last edited — corrected finished hours, hand-adjusted lines, a
-- rewritten note, the whole-project choice. All of it was regenerated on every
-- open, discarding whatever had been typed the time before.
--
-- Stored as a document rather than columns because that is what it is: a draft
-- of a thing to be sent, whose shape follows the invoice format rather than the
-- payment record's.
-- ============================================================

alter table payments add column if not exists invoice_draft jsonb;

-- ============================================================
-- Stage 10: expenses
--
-- Business expenses tracked through the year, so the tax report is a query
-- rather than an evening with a shoebox.
--
-- Two category columns on purpose. `label` is what the expense is in plain
-- terms — "studio gear", "coaching" — and `schedule_c` is the line it files
-- under. Keeping both means the page reads in the narrator's language while the
-- report speaks the accountant's, with no translation step in between to drift.
-- ============================================================

create table if not exists expenses (
  id            uuid        primary key default gen_random_uuid(),
  incurred_on   date        not null,
  vendor        text        not null default '',
  description   text        not null default '',
  amount        numeric(10,2) not null default 0,
  label         text        not null default '',
  schedule_c    text        not null default 'other',
  method        text        not null default '',
  notes         text        not null default '',
  -- Where it came from, and enough to recognise the same receipt twice: a
  -- folder rescanned next month must not re-import what it found last month.
  source        text        not null default 'manual',
  email_id      text        not null default '',
  receipt_url   text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists expenses_incurred_idx on expenses (incurred_on desc);
create unique index if not exists expenses_email_idx on expenses (email_id) where email_id <> '';

alter table expenses enable row level security;

-- Service-role only, like payments: spending data has no business being
-- readable by the public site.
drop policy if exists expenses_service_role on expenses;
create policy expenses_service_role on expenses
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- How a payout was paid.
--
-- Not decoration. A payment network that settles a business payment files its
-- own 1099-K on it, and the payer is told not to report the same money again
-- on a 1099-NEC. Zelle and cheques are not such networks, so those stay the
-- payer's to report. Without the method recorded, every payout looks alike and
-- the $600 question cannot be answered.
alter table payment_payouts add column if not exists paid_via text not null default '';

-- ---------------------------------------------------------------------------
-- Editors and proofers as contacts.
--
-- They were the one working relationship with nowhere to live: payouts record
-- a payee_name as free text, so the person who edits most of the catalogue
-- existed only as a string repeated on each payment, with her email and Venmo
-- handle kept somewhere outside the app entirely.
--
-- No FK to payment_payouts on purpose. That column is free text and matching
-- is done by name, the same convention authors and co-narrators already use
-- against board_cards; adding a constraint now would break every existing row.
create table if not exists editors (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null default '',
  -- How they get paid. Kept beside the name because the moment it is needed is
  -- the moment a payout is marked paid, not tax season.
  venmo      text        not null default '',
  paypal     text        not null default '',
  role       text        not null default 'editor',
  notes      text        not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'editors_role_check') then
    alter table editors add constraint editors_role_check
      check (role in ('editor', 'proofer', 'both'));
  end if;
end $$;

-- Name is the join key to payment_payouts.payee_name, so duplicates would
-- split one person's history in two.
create unique index if not exists editors_name_idx on editors (lower(name));

alter table editors enable row level security;

drop policy if exists editors_service_role on editors;
create policy editors_service_role on editors
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Seeded rather than typed in, so the name matches payment_payouts.payee_name
-- exactly and her existing history attaches on the first load.
insert into editors (name, email, venmo, role)
select 'Marizete', 'marizete.gp@gmail.com', '@Marizete-Garcia', 'editor'
where not exists (select 1 from editors where lower(name) = 'marizete');

-- ---------------------------------------------------------------------------
-- The specific days a book gets recorded on.
--
-- A weekly pattern could not answer the question that matters: this week has a
-- conference in it, that one does not. Real dates can, and they belong to the
-- book rather than to the narrator, because the answer changes per deadline.
--
-- jsonb array of "YYYY-MM-DD" strings. Empty means nothing has been chosen and
-- the display falls back to counting weekdays, which is where it started.
alter table board_cards add column if not exists recording_dates jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Time at the mic that is not narrating a manuscript.
--
-- Pickups, retakes, a demo, an audition, a day that is simply not available.
-- None of it comes from a word count, so none of it was visible in the
-- capacity calendar, which meant the calendar quietly promised hours that were
-- already spoken for.
--
-- card_id is optional and deliberately not a hard requirement: pickups usually
-- belong to a book, a dentist appointment does not.
create table if not exists time_blocks (
  id         uuid        primary key default gen_random_uuid(),
  on_date    date        not null,
  hours      numeric(5,2) not null default 1,
  label      text        not null default '',
  card_id    uuid        references board_cards(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists time_blocks_date_idx on time_blocks (on_date);

alter table time_blocks enable row level security;

drop policy if exists time_blocks_service_role on time_blocks;
create policy time_blocks_service_role on time_blocks
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- How much of a book has actually been narrated.
--
-- Every time figure until now answered "how long does this book take", which
-- stops being the useful question the moment recording starts. What is left is
-- what has to fit in the week, and a book three quarters done was still
-- claiming its full weight in the capacity calendar.
--
-- Counted in words of this narrator's own share, not of the manuscript: on a
-- duet the two halves are recorded separately and only one of them is yours.
alter table board_cards add column if not exists words_recorded integer not null default 0;

-- ---------------------------------------------------------------------------
-- Dialogue marked directly on the page image of a PDF.
--
-- The text-based highlighting needs a trustworthy text layer, and a print PDF
-- typeset with subsetted fonts does not have one: the glyphs draw correctly
-- but extract as gibberish, so character names come out wrong and nothing can
-- be matched against them. The page still renders perfectly, which is what a
-- narrator reads from anyway.
--
-- Stored as fractions of the page rather than pixels, so a highlight drawn at
-- one zoom level lands in the same place at any other.
create table if not exists page_highlights (
  id            uuid        primary key default gen_random_uuid(),
  manuscript_id uuid        not null references manuscripts(id) on delete cascade,
  character_id  uuid        references characters(id) on delete set null,
  page          integer     not null,
  x             numeric(6,5) not null,
  y             numeric(6,5) not null,
  w             numeric(6,5) not null,
  h             numeric(6,5) not null,
  note          text        not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists page_highlights_page_idx on page_highlights (manuscript_id, page);

alter table page_highlights enable row level security;

drop policy if exists page_highlights_service_role on page_highlights;
create policy page_highlights_service_role on page_highlights
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- What a mark on the page is: dialogue, or a voice to hear.
--
-- A voice pin is a character dropped into the margin so their sample can be
-- played while reading past. It lives in the same table as the dialogue
-- highlights because it is the same thing in every other respect -- a place on
-- a page belonging to a character -- and a second table would double every
-- query that draws the page.
alter table page_highlights add column if not exists kind text not null default 'highlight';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'page_highlights_kind_check') then
    alter table page_highlights add constraint page_highlights_kind_check
      check (kind in ('highlight', 'voice'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The share of a book's royalties that belongs to someone else.
--
-- A fee is split once, at invoice time, and the waterfall handles it. Royalties
-- arrive every month for years, and the split has to be applied to each
-- statement as it lands — which meant doing the arithmetic by hand twelve times
-- a year, per book, and remembering that it was owed at all.
--
-- Stored on the book because that is where the agreement lives: it is the same
-- fifty percent in July as it was in April.
alter table board_cards add column if not exists royalty_split_percent integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'board_cards_royalty_split_check') then
    alter table board_cards add constraint board_cards_royalty_split_check
      check (royalty_split_percent is null or (royalty_split_percent between 1 and 99));
  end if;
end $$;

-- Zero now means "these royalties are not split", which the original 1-99
-- range had no way to say: a book with a co-narrator splits by default, so
-- "none" has to be expressible as a value rather than as an empty field.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'board_cards_royalty_split_check') then
    alter table board_cards drop constraint board_cards_royalty_split_check;
  end if;
  alter table board_cards add constraint board_cards_royalty_split_check
    check (royalty_split_percent is null or (royalty_split_percent between 0 and 99));
end $$;

-- ============================================================
-- Android Stage 2: the write path moves into the database
--
-- Until now every rule about a board_cards update lived in
-- PUT /api/board — which meant a second client writing directly would
-- silently skip all of them. Rather than reimplement those rules in Kotlin
-- and keep two copies in step, they move here, where every client gets them
-- without remembering: the web, Android, a psql session, anything built later.
--
-- Spec: NATIVE_ANDROID_STAGE_2.md. Reasoning: NATIVE_ANDROID_STAGE_2_DESIGN.md.
-- ============================================================

-- ---- updated_at ----------------------------------------------------------
--
-- Deliberately NOT an unconditional bump. board_cards.updated_at is read by
-- contacts/authors, contacts/co-narrators and the board export, and feeds a
-- visible, sortable "Last activity" column on both contact pages. The ratings
-- cron touches three books a day; if its writes bumped this, every author with
-- a released book would read "last activity: today" within about four days and
-- the column would quietly stop meaning anything — no error, no failing test.
--
-- W2, 26 August 2026: the exclusion was a literal list of four column names, and
-- the comment here claimed it was "small and stable". It was neither. A fifth
-- amazon column, amazon_rating_attempted_at, was added later for the cron's
-- rotation and nobody added it here — so every attempt stamp, including the ones
-- for books the fetch failed on, bumped updated_at. That is the whole of the
-- cron's write on a blocked fetch, so in production the column it was written to
-- protect was being moved by the very job it was written to exclude.
--
-- Now matched by prefix. A list of names cannot be kept in step with a schema by
-- remembering to; the rule "amazon_* is machine-written" is the actual intent and
-- it holds for columns that do not exist yet. Note this deliberately covers the
-- two fields the Book Edit modal lets a person type in by hand — that was already
-- true of the old list and remains the decision: a rating is a fact about the
-- book's reception, not activity on the project.
--
-- An inclusion list would still be wrong in the other direction: it would have to
-- grow with every future migration and would silently stop tracking any column
-- nobody remembered to add. A new non-amazon column counts as a human edit by
-- default, which is the safe direction to fail in.
create or replace function public.board_cards_touch_updated_at()
returns trigger language plpgsql set search_path = public as $fn$
declare
  new_j jsonb := to_jsonb(new);
  old_j jsonb := to_jsonb(old);
  k text;
begin
  for k in select jsonb_object_keys(new_j) loop
    if k = 'updated_at' or k like 'amazon\_%' then
      new_j := new_j - k;
      old_j := old_j - k;
    end if;
  end loop;

  if new_j is distinct from old_j then
    new.updated_at := now();
  end if;
  return new;
end $fn$;

drop trigger if exists board_cards_touch_updated_at on public.board_cards;
create trigger board_cards_touch_updated_at
  before update on public.board_cards
  for each row execute function public.board_cards_touch_updated_at();

-- ---- released_at ---------------------------------------------------------
--
-- Ported exactly from PUT /api/board: stamp only on the transition INTO
-- released, and only when nothing is there. A hand-entered release date is
-- never overwritten — that guard is the whole reason the rule is not simply
-- "set it when status is released".
--
-- Pacific-midday anchoring deliberately stays in TypeScript. That normalises a
-- date a person picked in a date input, which is an input-format question; this
-- stamp is an instant and needs no anchoring.
-- Stage 3: released_at becomes a true release date.
--
-- The third clause was `new.released_at is null`, which stamped only the FIRST
-- release. Dean's decision is that re-releasing re-stamps, so it had to change —
-- but NOT by deleting the clause, which is the obvious move and the wrong one.
-- Deleting it makes the trigger clobber a released_at the caller supplied in the
-- same statement, and released_at is one of the six columns the Android client is
-- granted. Marking an older book released with its real historical date would
-- become impossible in one write, silently.
--
-- `is not distinct from old.released_at` reads as: stamp now(), unless the caller
-- supplied a date in this statement. Verified over REST with a real JWT: an
-- explicitly supplied 2020-05-01 survived where now() would have replaced it.
--
-- The first two clauses are unchanged and test the TRANSITION rather than the
-- state, which is the part usually got wrong.
create or replace function public.board_cards_stamp_released_at()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if new.status = 'released'
     and coalesce(old.status, '') is distinct from 'released'
     and new.released_at is not distinct from old.released_at
  then
    new.released_at := now();
  end if;
  return new;
end $fn$;

drop trigger if exists board_cards_stamp_released_at on public.board_cards;
create trigger board_cards_stamp_released_at
  before update on public.board_cards
  for each row execute function public.board_cards_stamp_released_at();

-- ---- write access --------------------------------------------------------
--
-- Two independent gates, and they fail differently, which the Android client
-- has to account for: an ungranted column raises permission denied, while a row
-- RLS refuses simply is not returned — a successful statement affecting zero
-- rows. A client reading "no exception" as "saved" would show every optimistic
-- update sticking forever for a user who had lost access.
--
-- Both using and with check are required. `using` decides which rows may be
-- updated; `with check` decides whether the result is still permitted. Without
-- the latter an admin could write a row they would then be unable to read.
drop policy if exists "Role update" on public.board_cards;
create policy "Role update" on public.board_cards
  for update to authenticated
  using      ((select public.current_app_role()) in ('admin'))
  with check ((select public.current_app_role()) in ('admin'));

-- The allowlist, enforced by Postgres rather than asserted in TypeScript.
-- Only what Stage 2's gestures actually touch: the First-15 toggle, status
-- moves, and archiving. Everything else stays ungranted and therefore refused.
--
-- The TypeScript allowlist in PUT /api/board is NOT redundant. GRANT binds the
-- authenticated role; the web runs as service_role and bypasses column
-- privileges entirely, so until F2 migrates it to Supabase Auth that array is
-- the web's only enforcement.
grant update (
  status, first_15_complete, released_at,
  archived_at, archived_reason, archived_notes
) on public.board_cards to authenticated;

-- ---- the board read ------------------------------------------------------
--
-- Stage 2 bug 6: the app asked "what may an admin read?" while the live answer
-- was "you are not an admin". The client caches the role at sign-in, RLS
-- evaluates it fresh, and a demoted session therefore received zero rows with
-- HTTP 200 — rendered as an ordinary empty board reading "No active projects".
-- A person would believe that. It says "you have no work", not "you cannot see
-- this", and it is the same silent-wrong-answer the board_cards fallback was
-- rejected to avoid, reached by a different route.
--
-- The fix has to answer the fact and its consequence in one breath, because the
-- defect is precisely the window between them. Hence a function rather than a
-- relation.
--
-- NOT a security_invoker view whose predicate calls an asserting function, which
-- looks cheaper and keeps the client's decode path unchanged. If RLS filters the
-- rows to zero first, the predicate is never evaluated and the assertion never
-- fires — silently inert in exactly the case it exists for. A function body runs
-- unconditionally. That asymmetry is the whole reason this is an RPC.
--
-- WHEN F3 ARRIVES, THE EDITOR GETS ITS OWN FUNCTION. The return type below
-- carries all eighteen columns, pfh_rate and payment_type among them, and that is
-- correct precisely because this function is admin-only by assertion. The shorter
-- change — widening the role test here to admit an editor — hands them every
-- financial column on the board, because the return type does not narrow with the
-- caller. Write board_editor_for_session() with its own narrowed return type
-- instead. Two functions, two shapes, each one enforcing its own.
--
-- SECURITY INVOKER, deliberately, not DEFINER. The assertion below is the gate;
-- RLS stays underneath it as a second, independent one. A DEFINER function would
-- bypass RLS and make this single raise the only thing standing between an
-- editor and every financial column on the board.
create or replace function public.board_for_session()
returns table (
  id uuid,
  title text,
  author text,
  co_narrator text,
  cover_url text,
  status text,
  deadline date,
  first15_due date,
  first_15_complete boolean,
  word_count integer,
  pfh_rate numeric,
  payment_type text,
  is_confidential boolean,
  narration_format text,
  narrator_share_percent smallint,
  recording_dates jsonb,
  words_recorded integer,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
begin
  -- Read live, never from anything the client sent. This is the assertion the
  -- view form could not make.
  if coalesce(public.current_app_role(), '') <> 'admin' then
    -- The marker is matched by the client to produce its not-enabled message.
    -- Matching a token we control beats matching prose that may be reworded, and
    -- 42501 is what makes PostgREST answer 403 rather than 400.
    raise exception 'BOARD_ACCESS_NOT_ENABLED'
      using errcode = '42501';
  end if;

  -- The definition of "the board" lives here now rather than in the client, so
  -- there is one copy of it. Active, non-archived work only: 'released' belongs
  -- on the Released page and 'audition' is not yet active production.
  return query
    select
      c.id, c.title, c.author, c.co_narrator, c.cover_url, c.status, c.deadline,
      c.first15_due, c.first_15_complete, c.word_count, c.pfh_rate,
      c.payment_type, c.is_confidential, c.narration_format,
      c.narrator_share_percent, c.recording_dates, c.words_recorded, c.created_at
    from public.board_cards c
    where c.status in ('contracted', 'prepping', 'recording', 'editing')
      and c.archived_at is null;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, which would put this within
-- reach of an unauthenticated request. The assertion would refuse it, but the
-- grant should not depend on the assertion being right.
revoke execute on function public.board_for_session() from public, anon;
grant  execute on function public.board_for_session() to authenticated;

-- ---- card detail ---------------------------------------------------------
--
-- One card in full, for the Android detail screen. Mirrors board_for_session()
-- deliberately: same guard, same error style, same security posture. Nothing new
-- is invented here, because a second pattern is a second thing to get wrong.
--
-- A RAISE, not zero rows. A direct select would work — RLS answers zero rows to a
-- non-admin — but zero rows cannot be told apart from an archived card or a bad
-- id, and the app would have to guess which. That ambiguity is Stage 2's bug 5
-- again, where a correct rollback and a tap that never happened were pixel
-- identical. The app already renders this errcode as its refused screen.
--
-- SECURITY INVOKER, so RLS still applies underneath the guard.
--
-- THE COLUMN LIST IS 35 OF THE TABLE'S 43, CHOSEN. The eight omitted, and why:
--
--   slug, sort_order         web routing and board ordering; neither is
--                            information about the book, and the phone has no
--                            /narrated-works route to use a slug for.
--   updated_at               machine bookkeeping. The board already treats it as
--                            such, and W2 was about keeping it that way.
--   archived_at,             a detail screen is reached from the board, which
--   archived_reason,         never shows archived cards. Returning them would add
--   archived_notes           three columns the screen cannot act on.
--   amazon_rating_updated_at the cron's rotation bookkeeping, not a fact about
--   amazon_rating_attempted_at  the book. The rating and review count ARE
--                            returned, because those are.
--
-- A wider return type is a wider surface for F3 to narrow later, which is why the
-- omissions are written down rather than left implicit.
create or replace function public.card_detail(p_id uuid)
returns table (
  id uuid, title text, subtitle text, author text, co_narrator text, cover_url text,
  status text, deadline date, first15_due date, first_15_complete boolean,
  word_count integer, words_recorded integer, pfh_rate numeric, payment_type text,
  narration_format text, narrator_share_percent smallint, royalty_split_percent integer,
  is_confidential boolean, production_type text, production_company text,
  recording_dates jsonb, description text, notes text, tags text[],
  trigger_warnings text[], chapters jsonb, links jsonb, audible_link text,
  ar_link text, spotify_link text, script_url text, released_at timestamptz,
  amazon_rating numeric, amazon_review_count integer, created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path to 'public'
as $fn$
begin
  if coalesce(public.current_app_role(), '') <> 'admin' then
    raise exception 'CARD_ACCESS_NOT_ENABLED'
      using errcode = '42501';
  end if;

  return query
    select
      c.id, c.title, c.subtitle, c.author, c.co_narrator, c.cover_url, c.status,
      c.deadline, c.first15_due, c.first_15_complete, c.word_count, c.words_recorded,
      c.pfh_rate, c.payment_type, c.narration_format, c.narrator_share_percent,
      c.royalty_split_percent, c.is_confidential, c.production_type,
      c.production_company, c.recording_dates, c.description, c.notes, c.tags,
      c.trigger_warnings, c.chapters, c.links, c.audible_link, c.ar_link,
      c.spotify_link, c.script_url, c.released_at, c.amazon_rating,
      c.amazon_review_count, c.created_at
    from public.board_cards c
    where c.id = p_id;
end $fn$;

revoke execute on function public.card_detail(uuid) from public, anon;
grant  execute on function public.card_detail(uuid) to authenticated;

-- ============================================================
-- Stage 6: Released + Archive  (applied 26 August 2026)
-- ============================================================

-- 6A. One admin guard, four callers.
--
-- board_for_session() and card_detail() each carried their own copy of the same
-- three-line check, and Stage 6 adds two more functions that need it. Four
-- copies kept in step by memory is the shape this project has spent five stages
-- removing -- the exclusion list, the status ordering, the studio rate defaults.
--
-- The marker is a PARAMETER rather than a constant because it is load-bearing:
-- BoardRepository.kt matches CARD_ACCESS_NOT_ENABLED to tell "this card is not
-- readable" from "the board is not readable", and flattening the two messages
-- would silently retarget that branch. Checked before choosing, per 6A.
create or replace function public.assert_board_access(
  p_marker text default 'BOARD_ACCESS_NOT_ENABLED'
) returns void
language plpgsql stable
set search_path = public
as $fn$
begin
  -- `using message =` rather than `raise exception p_marker`: the bare form
  -- reads its argument as a format string, so a '%' in a marker would raise
  -- "too few arguments for format" instead of the refusal the app matches on.
  if coalesce(public.current_app_role(), '') <> 'admin' then
    raise exception using message = p_marker, errcode = '42501';
  end if;
end
$fn$;

revoke all on function public.assert_board_access(text) from public, anon;
grant execute on function public.assert_board_access(text) to authenticated;

-- board_for_session() and card_detail() were re-created to call it; their
-- bodies below the guard are unchanged. Both were re-verified over REST with a
-- real JWT afterwards -- admin returns rows, editor raises 42501 with its own
-- marker, anon is refused at the ACL -- because an extraction that looks
-- behaviour-preserving is still a rewrite of a security check.

-- 6A.2. Released, INCLUDING archived ones, with archived_at in the column list.
--
-- One query is the source for both "which books are released" questions. The
-- list filters to non-archived for display and any count applies the same
-- predicate to the same rows, so the difference between "all-time released" and
-- "currently visible" is a line of code at the point of use rather than a
-- difference between two functions that can drift apart unobserved. The web
-- keeps two routes with two different archived predicates -- deliberately, and
-- they agree today only because no released book has ever been archived.
--
-- Ordering matches /api/released/route.ts exactly, secondary sort included:
-- `nulls last` is explicit because DESC defaults to NULLS FIRST in Postgres and
-- the web route overrides it. Without the title tiebreak, two books released on
-- the same day could swap places between loads with nothing to explain it.
create or replace function public.released_for_session()
returns table(
  id uuid, title text, author text, cover_url text,
  released_at timestamp with time zone, amazon_rating numeric,
  amazon_review_count integer, audible_link text,
  archived_at timestamp with time zone
)
language plpgsql stable
set search_path = public
as $fn$
begin
  perform public.assert_board_access();

  return query
    select
      c.id, c.title, c.author, c.cover_url, c.released_at, c.amazon_rating,
      c.amazon_review_count, c.audible_link, c.archived_at
    from public.board_cards c
    where c.status = 'released'
    order by c.released_at desc nulls last, c.title asc;
end
$fn$;

-- Archived, whatever the status. The archive is a recovery screen: a card is
-- there because it was archived, not because of what it was doing when it was.
create or replace function public.archived_for_session()
returns table(
  id uuid, title text, author text, cover_url text,
  archived_at timestamp with time zone, archived_reason text,
  archived_notes text, status text
)
language plpgsql stable
set search_path = public
as $fn$
begin
  perform public.assert_board_access();

  return query
    select
      c.id, c.title, c.author, c.cover_url, c.archived_at, c.archived_reason,
      c.archived_notes, c.status
    from public.board_cards c
    where c.archived_at is not null
    order by c.archived_at desc, c.title asc;
end
$fn$;

revoke all on function public.released_for_session() from public, anon;
grant execute on function public.released_for_session() to authenticated;

revoke all on function public.archived_for_session() from public, anon;
grant execute on function public.archived_for_session() to authenticated;

-- Un-archiving needs no migration: archived_at, archived_reason and
-- archived_notes are already in the column grant, and a refused write comes back
-- as zero rows with HTTP 200 -- the contract the app already reads as Refused.

-- ============================================================
-- Stage 8A.1: close the ceiling BEFORE opening the door
-- (applied 27 August 2026, in its own commit, before any policy)
-- ============================================================
--
-- payments and expenses had RLS on and one service_role policy each, so nothing
-- was exposed: RLS denies when no policy matches. But both tables granted anon
-- AND authenticated the full seven privileges -- DELETE, INSERT, REFERENCES,
-- SELECT, TRIGGER, TRUNCATE, UPDATE -- inherited from the default schema grants
-- and never narrowed, because board_cards got its ceiling in Stage 0 and these
-- two never did.
--
-- Stage 8 adds a policy for authenticated to these exact tables. A `for all`
-- policy, which is the shortcut everyone reaches for, would have made DELETE and
-- TRUNCATE live on Dean's financial records the moment it was written -- not as
-- a bug anyone would notice, but as a silent widening of what a mistake
-- elsewhere could do. A grant is a ceiling; a policy is a role check. The
-- ceiling goes back first, so the policy that follows can only ever narrow.
--
-- anon is revoked as well, which goes beyond the letter of the plan for the same
-- reason it names: leaving the unauthenticated public role holding TRUNCATE on
-- the payments table while closing authenticated would be indefensible. Unlike
-- board_cards, which grants SELECT to both, nothing should ever read these two
-- as anon.
--
-- Checked before running, because this breaks billing if it is wrong:
--   * all 14 web files touching either table import `supabaseAdmin`, which is
--     service_role, and these revokes do not affect service_role;
--   * `supabaseBrowser`, the anon-key client, has ZERO consumers in the repo;
--   * Android has no reference to either table.
-- Confirmed afterwards over REST: service_role still reads both tables, and anon
-- is now refused with "permission denied for table" rather than an empty result.

revoke all on public.payments  from anon, authenticated;
revoke all on public.expenses  from anon, authenticated;

grant select on public.payments  to authenticated;
grant select on public.expenses  to authenticated;

-- ============================================================
-- Stage 8A.2 / 8A.3: read policies and the two session functions
-- (applied 27 August 2026, AFTER the ceiling above)
-- ============================================================

-- FOR SELECT, never FOR ALL. With the ceiling closed, `for all` could not grant
-- a write today -- but it would state an intent this stage does not have, and
-- the next person to widen a grant would find a policy already agreeing with
-- them. The grant and the policy have to say the same narrow thing, or the pair
-- only looks safe.

create policy "Role read" on public.payments
  for select to authenticated
  using ((select public.current_app_role()) = 'admin');

create policy "Role read" on public.expenses
  for select to authenticated
  using ((select public.current_app_role()) = 'admin');

-- Money that has MOVED. This table does not hold what is owed; that is computed
-- from the card, the rate and these rows -- see the Stage 8 reconnaissance.
--
-- Six actionable-money columns are absent from the return type by design:
-- stripe_payment_link, paypal_payment_link, stripe_payment_link_id,
-- paypal_invoice_id, payment_links_closed_at and invoice_draft. A read-only
-- screen needs none of them, and a live payment URL is the last thing that
-- should travel to a phone. created_at and updated_at are omitted too: neither
-- is displayed, and a narrower type is less for a later stage to have to narrow.
create or replace function public.payments_for_session()
returns table(
  id uuid, card_id uuid, label text, kind text, period text,
  amount_expected numeric, amount_gross numeric, amount_received numeric,
  due_on date, invoiced_on date, received_on date,
  invoice_number text, method text, notes text, sort_order integer
)
language plpgsql stable
set search_path = public
as $fn$
begin
  perform public.assert_board_access();

  return query
    select
      p.id, p.card_id, p.label, p.kind, p.period,
      p.amount_expected, p.amount_gross, p.amount_received,
      p.due_on, p.invoiced_on, p.received_on,
      p.invoice_number, p.method, p.notes, p.sort_order
    from public.payments p
    order by p.received_on desc nulls last, p.sort_order asc, p.label asc;
end
$fn$;

-- Expenses. NOTE: this version returned `has_receipt`; it was superseded later
-- the same day and the reason is recorded at the end of this file. Kept as
-- written so the sequence of migrations reads as what actually happened.
--
-- Verified 27 August: `receipt_url` is an empty string on ALL 21 rows, so there
-- is nothing to open and nothing to sign. Returning a boolean rather than the
-- column means the phone cannot render a link it must not follow. `email_id` is
-- omitted: an opaque mail identifier with no display value.
--
-- schedule_c travels as stored. It is a tax category, and nothing in this app
-- interprets, groups or totals by it -- a tax figure the app invented would be
-- worse than no tax figure.
create or replace function public.expenses_for_session()
returns table(
  id uuid, incurred_on date, vendor text, description text,
  amount numeric, label text, schedule_c text, method text,
  notes text, source text, has_receipt boolean
)
language plpgsql stable
set search_path = public
as $fn$
begin
  perform public.assert_board_access();

  return query
    select
      e.id, e.incurred_on, e.vendor, e.description,
      e.amount, e.label, e.schedule_c, e.method,
      e.notes, e.source, (e.receipt_url <> '') as has_receipt
    from public.expenses e
    order by e.incurred_on desc, e.vendor asc;
end
$fn$;

revoke all on function public.payments_for_session() from public, anon;
grant execute on function public.payments_for_session() to authenticated;

revoke all on function public.expenses_for_session() from public, anon;
grant execute on function public.expenses_for_session() to authenticated;

-- ============================================================
-- Stage 8, finding 1: close the ceiling on payment_payouts too
-- (applied 27 August 2026, its own commit)
-- ============================================================
--
-- The third money table, found while tracing what the "owed" computation
-- actually depends on. 8 rows, 7 of them unpaid, and both anon and authenticated
-- held DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE -- the same
-- default schema grants payments and expenses carried.
--
-- NOTHING is granted back. Payments and expenses got SELECT because a policy and
-- two functions in this stage need it; nothing reads payouts from a session at
-- all, and a table nothing needs should end at a hard deny rather than at
-- SELECT-just-in-case. When a later stage wants it, the grant is one line and
-- will arrive with its reason attached.
--
-- Pre-checked independently rather than inferred from the payments result -- the
-- fact that it held there is not evidence it holds here. All 7 web files
-- referencing payment_payouts import `supabaseAdmin` (service_role, unaffected),
-- including `contacts/editors/page.tsx`, which the payments/expenses sweep did
-- not surface. No REST or rpc reference from client code. Android has none.
-- Confirmed after: service_role still reads it directly AND through the embedded
-- `payouts:payment_payouts(...)` select every payments query uses; anon is
-- refused with "permission denied for table payment_payouts".

revoke all on public.payment_payouts from anon, authenticated;

-- ============================================================
-- Stage 8, finding 2: has_receipt dropped from expenses_for_session
-- (applied 27 August 2026)
-- ============================================================
--
-- `receipt_url` is an empty string on ALL 21 expense rows. There are no
-- receipts. A "receipt exists" indicator would be a control that can never fire,
-- testable only by constructing the data that would make it fire -- and a state
-- reachable only by constructing data is a state nobody looks at.
--
-- So the field goes too, not just the indicator. A function should not return a
-- field about a thing that does not exist: the same narrower-return-type
-- argument that excluded the payment links, turned on this stage's own work.
-- Carrying `has_receipt` would leave a column false on every row and a reader
-- wondering which screen consumes it.
--
-- The DoD item that asked for the indicator was withdrawn for the same reason.
-- When receipts do exist, F1 adds the field and the indicator together, beside
-- the signed-URL work they need anyway.
--
-- CREATE OR REPLACE cannot change a return type, so the old function is dropped
-- first. Nothing called it.

drop function if exists public.expenses_for_session();

create or replace function public.expenses_for_session()
returns table(
  id uuid, incurred_on date, vendor text, description text,
  amount numeric, label text, schedule_c text, method text,
  notes text, source text
)
language plpgsql stable
set search_path = public
as $fn$
begin
  perform public.assert_board_access();

  return query
    select
      e.id, e.incurred_on, e.vendor, e.description,
      e.amount, e.label, e.schedule_c, e.method,
      e.notes, e.source
    from public.expenses e
    order by e.incurred_on desc, e.vendor asc;
end
$fn$;

revoke all on function public.expenses_for_session() from public, anon;
grant execute on function public.expenses_for_session() to authenticated;

-- ============================================================
-- Stage 9A: site_settings becomes writable, with the rule in the database
-- (applied 27 August 2026)
-- ============================================================
--
-- See check_site_setting(), validate_site_setting() and the grants below.
-- Recorded here in the order applied:
--
--   1. check_site_setting(key, value) -- the rule, as a plain function so it can
--      be exercised from a SELECT without writing a row.
--   2. validate_site_setting() -- the trigger, reduced to plumbing: it calls the
--      rule and stamps updated_at, which `authenticated` has no grant for.
--   3. site_settings_validate -- BEFORE INSERT OR UPDATE, fires for every role.
--   4. grant update (value) -- the ceiling. `key` is never writable from a
--      client: renaming a setting from a phone would orphan every reader.
--   5. "Role write" -- FOR UPDATE, admin only, mirroring "Role read".
--
-- WHY A TRIGGER RATHER THAN ROUTE VALIDATION. The rule was said to live in
-- api/studio-settings/route.ts. It did, but that was never the only writer:
-- /api/site-settings accepts ANY key with ANY value and validates NOTHING, so a
-- bad rate could already be stored from the web. Two write paths, one validated,
-- before a phone existed. A trigger covers every writer including psql.
--
-- THE MESSAGE IS THE SENTENCE THE CLIENTS DISPLAY, raised with SQLSTATE 22023 so
-- PostgREST answers 400 and callers can tell a rule from a transport failure.
-- Clients show what the database said rather than composing their own wording --
-- that is what makes "the phone and the web say the same thing" a property
-- instead of two people keeping two strings in step.
--
-- NON-CONTIGUOUS available_months IS ACCEPTED, deliberately, and this differs
-- from what the Stage 9 plan asked for. The web's BookingWindowPicker is a free
-- toggle grid over twelve rolling months, so two clicks produce a gap; its
-- formatter collapses any selection to a range and never errors, and Android
-- lists the months instead. A rule against gaps would break a picker that ships
-- today. An EMPTY list is accepted too: both clients render it as "None", which
-- means Dean is taking no work.

-- ============================================================
-- Stage 10A: card editing, page progress (applied 28 August 2026)
-- ============================================================
--
-- Applied in two migrations; see the live definitions for full bodies.
--
--  1. total_pages, current_page      -- both nullable. A STORED fact, not a
--     derivation: only 4 of 20 board cards have chapters, and chapter page sums
--     are wrong on 2 of the 10 that do (Restrict 21 pages / 11 chapters).
--
--  2. check_card_word_count()        -- the bound, callable from a SELECT.
--     ZERO IS LEGAL and means "not entered": 13 of 34 cards hold 0 today,
--     including nine released books. Refusing it would make 13 rows
--     unupdatable. Otherwise 1000-500000, deliberately wide -- to catch a
--     slipped keystroke, not to have an opinion about book length. Dean's
--     shortest real manuscript is 14,410 and his longest 184,221; the upper
--     bound sits past the longest single-volume novels anyone narrates.
--
--  3. apply_card_rules()             -- ONE WRITER of words_recorded. Pages
--     moving derives it; writing it directly clears current_page, because the
--     page is then no longer known to be accurate. The `is distinct from` there
--     is load-bearing: CardEditModal PUTs the whole form on every save and
--     words_recorded is in that payload even when untouched, so testing
--     presence rather than change would clear the page every time Dean edited
--     a title.
--
--  4. anchor_card_dates()            -- the Pacific-noon rule, moved out of
--     /api/board. Only released_at and archived_at can drift; deadline and
--     first15_due are `date` columns with no instant. Verified: a bare
--     '2026-09-24' into a timestamptz reads as 2026-09-23 in Pacific, while the
--     web's 20:00Z rule reads as 2026-09-24. The heuristic is "exactly midnight
--     UTC", which is the signature of a date-only string and not a time anyone
--     sets a release to.
--
--  5. The grant widened to 28 columns -- exactly the SCALARS CardEditModal
--     exposes plus the two page columns. NOT granted: tags, trigger_warnings
--     and recording_dates (arrays), cover_url (signed upload), amazon_rating
--     and amazon_review_count (cron-owned, client-only validation), and
--     words_recorded -- because the trigger owns it and granting it would give
--     the phone a second way to set the figure this stage exists to keep single.

-- ============================================================
-- Stage 10A-bis: the share bound (applied 28 August 2026)
-- ============================================================
--
-- check_card_share_percent(label, value) guards narrator_share_percent and
-- royalty_split_percent from inside apply_card_rules(). 1-100, NULL ACCEPTED,
-- ZERO REFUSED.
--
-- THE ASYMMETRY WITH check_card_word_count IS DELIBERATE. There, 0 is legal and
-- means "not entered": 13 of 34 cards hold it, and refusing it would have made
-- those rows unupdatable. Here the data says the opposite --
--
--     narrator_share_percent   33 null, 0 zeros, one value (99), none out of range
--     royalty_split_percent    34 null, nothing set at all
--
-- -- and null already means "not set". Allowing 0 as well would give one state
-- two spellings, and a screen reading such a column cannot then say which one it
-- is looking at.
--
-- Same principle producing opposite answers: the bound goes around what the data
-- holds, not around what sounds tidy.
--
-- Zero is refused with its own sentence rather than folded into the range,
-- because "outside 1-100" is true but useless to someone who means "no share".
-- The sentence says what to do instead: leave it empty.
--
--   0    -> Stored value "0" is not a narrator share. Leave it empty to mean not set.
--   101  -> Stored value "101" is outside 1–100 and is not being used.
--
-- IMMUTABLE and callable from a SELECT, like check_card_word_count, so the rule
-- can be exercised without writing a row.
--
-- /api/board needs no change: its error branch keys on SQLSTATE 22023 rather
-- than on a list of rules, so it already defers to this one.

create or replace function public.check_card_share_percent(p_label text, p_share integer)
returns void
language plpgsql
immutable
set search_path to 'public'
as $function$
begin
  if p_share is null then
    return;
  end if;

  if p_share = 0 then
    raise exception using
      message = format(
        'Stored value "0" is not a %s. Leave it empty to mean not set.', p_label
      ),
      errcode = '22023';
  end if;

  if p_share < 1 or p_share > 100 then
    raise exception using
      message = format(
        'Stored value "%s" is outside 1–100 and is not being used.', p_share
      ),
      errcode = '22023';
  end if;
end
$function$;

-- apply_card_rules() gains the two calls at the top, alongside the word_count
-- check. See the live definition for the full body -- the page and
-- words_recorded rules below them are unchanged from 10A.

-- ============================================================
-- Stage 10C step 1: the page columns reach their surfaces (28 August 2026)
-- ============================================================
--
-- board_for_session() and card_detail(uuid) now return total_pages and
-- current_page. 10A created those columns knowing 10C would display them and
-- did not widen the read path; this finishes that rather than extending it.
--
-- TWO functions, enumerated before either was altered. The full list, and why
-- the other four are untouched:
--
--   board_for_session      Board AND Today  -> widened. AgendaScreen is built
--                          from the board fetch, so Today's page line is fed
--                          from here, not from a screen-specific query.
--   card_detail            Card detail      -> widened.
--   released_for_session   History/Released -> no page progress. NOTE for 10D:
--                          it carries neither words_recorded nor word_count,
--                          and board_for_session filters to contracted/
--                          prepping/recording/editing, so RELEASED BOOKS ARE
--                          REACHABLE FROM NEITHER. A career total needs its own
--                          function.
--   archived_for_session   History/Archive  -> no page progress.
--   payments_for_session   Money            -> no page progress.
--   expenses_for_session   Money            -> no page progress.
--
-- DROP then CREATE, because Postgres will not change a function's return type
-- in place.
--
-- AND THE THING THAT WENT WRONG, kept because the next person will hit it:
-- dropping a function discards its grants, and CREATE FUNCTION then grants
-- EXECUTE to PUBLIC by default. anon inherits from PUBLIC, so recreating these
-- two silently REINSTATED the anon grant Stage 8 revoked — while the migration's
-- own comment claimed it had not. Re-granting the three roles by name did not
-- prevent it, because the widening did not arrive through a named grant.
--
-- It was caught by listing grantees for ALL SIX functions rather than the two
-- that changed: the four untouched ones showed authenticated/postgres/
-- service_role, and the two recreated ones showed anon as well. The comparison
-- is what made it visible; checking only the changed pair would have shown
-- three expected roles plus one, with nothing to compare against.
--
-- Fixed by revoking from PUBLIC (the actual holder) and from anon by name.
-- A recreated function is a NEW function as far as privileges are concerned.

-- ============================================================
-- function_grant_audit() — the standing grant guard (28 August 2026)
-- ============================================================
--
-- Returns every function in `public` that PUBLIC or anon can EXECUTE, with a
-- `callable` flag. Empty result is the pass. `npm run check-function-grants`
-- reads it.
--
-- WHY IT EXISTS. CREATE OR REPLACE preserves a function's ACL; DROP + CREATE
-- resets it and grants EXECUTE to PUBLIC. Postgres will not change a
-- table-returning function's return type in place, so widening an RPC REQUIRES
-- drop-and-create, and the new function starts open. Re-granting the intended
-- roles by name does not close it: the grant arrives through PUBLIC, and no
-- named grant touches PUBLIC. "I re-granted the right roles" and "only the
-- right roles can execute this" are different statements.
--
-- WHY THE WHOLE SCHEMA. Listing grantees for the two functions that changed
-- would have shown four roles with nothing to say the fourth was wrong. The
-- four untouched RPCs were the control. A verification of the thing you
-- changed carries no control; a verification across the whole class carries
-- its own.
--
-- PUBLIC is grantee OID 0 in aclexplode() and matches no row in pg_roles, so a
-- plain join drops it in silence — the way a check for exactly this reports
-- clean while the grant sits there. Left join; null rolname IS PUBLIC.
--
-- TRIGGER FUNCTIONS ARE FLAGGED, NOT DROPPED. Postgres refuses to invoke one
-- directly whoever holds EXECUTE — verified against this database:
--   select public.apply_card_rules()
--   ERROR: trigger functions can only be called as triggers
-- so their grant is inert. They are reported separately rather than failing the
-- check, because twenty inert rows would bury the callable ones and a guard
-- that is mostly noise gets ignored. They are not filtered out: narrowing a
-- check until it passes is how a check stops being one.
--
-- Mutation-tested: a throwaway function granted to anon appeared as
-- "zz_guard_probe <- anon", the run went from 11 failures to 12, and dropping
-- it returned the count to 11.
--
-- OPEN FINDING, for Dean rather than for me to act on. Six CALLABLE functions
-- are open to PUBLIC/anon and predate this guard:
--   check_card_share_percent, check_card_word_count, check_site_setting,
--   current_app_role, site_setting_refusal, validate_site_setting
-- None returns data; they raise or return refusal text. current_app_role is
-- referenced by six RLS policies, ALL scoped to {authenticated} — so revoking
-- it from anon would not affect them. Not revoked here: a revoke is the most
-- consequential command in this project and this one was not asked for.

-- ============================================================
-- Closing the callable helpers to PUBLIC and anon (28 August 2026)
-- ============================================================
--
-- Seven functions the grant guard surfaced, all now authenticated/postgres/
-- service_role only:
--
--   card_word_count_refusal(integer)
--   check_card_share_percent(text, integer)
--   check_card_word_count(integer)
--   check_site_setting(text, text)
--   current_app_role()
--   site_setting_refusal(text, text)
--   validate_site_setting()
--
-- THE ARGUMENT IS current_app_role. The only SECURITY DEFINER in the set, and a
-- definer function reachable by an unauthenticated caller runs with the
-- definer's privileges. It returns null for anon today because auth.uid() is
-- null in its CURRENT BODY — a property of the body, not of the grant, and the
-- grant should not depend on the body staying benign.
--
-- The other six are nuisance rather than risk. They go with it because leaving
-- six open while closing one makes the guard's output permanently noisy, and a
-- guard with expected noise is one people stop reading.
--
-- PRE-CHECKED, both halves, before revoking:
--
--   anon cannot reach any validation path. Every policy calling
--   current_app_role is {authenticated}; anon holds SELECT only on board_cards
--   and site_settings and nothing on payments or expenses, so no write fires as
--   anon and no trigger calls these on its behalf.
--
--   authenticated holds an EXPLICIT grant on all seven, separate from PUBLIC.
--   That is the half that mattered: had it held them only THROUGH PUBLIC,
--   revoking PUBLIC would have taken the settings write path down with it —
--   check_site_setting is called by the validate_site_setting trigger, which
--   runs as the invoking user.
--
-- SEVEN, NOT SIX. The seventh, card_word_count_refusal, was in the guard's
-- output from the first run and missing from the list acted on, because that
-- list was read off a `tail` of the output rather than the whole of it. The
-- guard was complete; the enumeration taken FROM the guard was truncated. A
-- sampling error one layer above the tool that exists to prevent sampling
-- errors — and it was the guard's own second run that caught it.

-- ============================================================
-- Stage 10D: career_totals_for_session() (28 August 2026)
-- ============================================================
--
-- Words narrated across the career, in three categories, with the partition
-- asserted inside the function.
--
-- A DEDICATED FUNCTION, not a widened list RPC. The total spans three
-- populations and no list covers them: board_for_session filters to
-- contracted/prepping/recording/editing so released books are absent, and
-- released_for_session carries neither words_recorded nor word_count. Widening
-- the latter would ship twelve rows so a client could sum one number, and would
-- put the summing in a client where a second implementation could drift from
-- this one.
--
-- NOT computeCareerTotals, which the web already has: that counts released
-- only, uses word_count, zeroes multicast, and answers "hours of released audio
-- at the current divisor". Different column, different population, different
-- unit.
--
--   exact        released + editing carrying words_recorded — narrated in full
--   estimated    recording, with pages, derived from page position
--   not counted  everything else, WITH THE COUNT AND TITLES RETURNED
--
-- Today: 420,194 exact across 9 books, 23,444 estimated across 1, 23 not
-- counted, 33 non-archived. Nine of the uncounted are released books with no
-- word count.
--
-- THE PARTITION IS CHECKED AGAINST THE TABLE, not against the buckets. Summing
-- the buckets and comparing to the sum of the buckets would agree with any
-- bucketing at all, including one that dropped a category — the exact failure
-- this exists to make impossible. Mutation-tested by removing the not_counted
-- category: "Career categories account for 10 books but 33 are not archived."

-- ============================================================
-- payments_for_session() carries the card title (28 August 2026)
-- ============================================================
--
-- The function returned card_id and nothing else about the card, so a payment
-- row had no way to say WHICH BOOK it belonged to. Every row fell back to its
-- kind for a heading, and `label` is empty on 24 of 25 rows, so the list read
-- "Fee / Fee ·" down the page. The repetition was the visible symptom; the
-- missing identity was the defect.
--
-- Same reasoning as Stage 8's lean column list rather than an exception to it:
-- cover what the row RENDERS. The row renders the book.
--
-- A JOIN, not a second query. Resolving titles client-side would put the
-- association in a client, where two clients could resolve it differently.
--
-- LEFT join: a payment whose card was deleted still appears. A money row that
-- vanishes because its book did is a total that stops matching what can be
-- seen, which is what the breakdown work exists to prevent.
--
-- Drop-and-create, so the ACL reset and the revokes below are not optional.
-- check-function-grants confirmed clean afterwards — the guard earning its
-- keep on the first widening after it was built.

-- ============================================================
-- Payouts: an admin-only read (28 August 2026)
-- ============================================================
--
-- Stage 8 closed payment_payouts to a hard deny and said "any future Payouts
-- screen starts with a grant and a reason". This is that. The reason: nine
-- payments carry money going OUT to an editor, and the app rendered them as $0
-- with no explanation.
--
-- SELECT ONLY to authenticated, plus a "Role read" policy copying payments and
-- expenses verbatim — including the (select current_app_role()) wrapper, which
-- is the InitPlan-caching form evaluated once per statement rather than once
-- per row.
--
-- payouts_for_session() is SECURITY INVOKER like the rest of the family. As
-- invoker it reads the table AS THE CALLING SESSION, so the policy decides the
-- answer and a non-admin gets zero rows from RLS rather than an error. Definer
-- would read with the owner's privileges and make the grant decorative.
--
-- CREATE OR REPLACE, never DROP + CREATE: a drop resets the ACL and re-grants
-- EXECUTE to PUBLIC. The CREATE still grants PUBLIC on a new function, which is
-- why the revoke is not optional.
--
-- VERIFIED, and the negative test needed a control before it meant anything:
--
--   V1 admin session          payouts_for_session() -> 9 rows
--   V2 non-admin session      -> 0 rows, HTTP 200, no error
--   V3 anon                   no SELECT on the table, no EXECUTE on the rpc
--   V4 authenticated          SELECT and only SELECT
--   V5 full audit clean       all 8 read functions authenticated/postgres/
--                             service_role, no anon, no PUBLIC
--   V6 payments_for_session   still INVOKER, still returns card_title
--
-- V2 FIRST CAME BACK WRONG — 9 rows for a demoted session — and the fault was
-- the harness. The MCP connection runs as postgres, which has rolbypassrls, so
-- RLS never applied. The control caught it: the same test against `payments`,
-- whose policy is identical and known-good, ALSO returned all 25 rows. Re-run
-- under `set local role authenticated`, both filtered to zero.
--
-- A NEGATIVE TEST THAT CANNOT DISTINGUISH ITS SUBJECT FROM ITS HARNESS IS NOT A
-- TEST. The control is what made the difference readable.
--
-- Dean's profile was never committed as changed: the demotion ran inside a
-- transaction that raises at the end. profiles still reads admin.

-- ============================================================
-- payout_summary_for_session() (28 August 2026)
-- ============================================================
--
-- The payout position as a PAIR: expected in, committed out, net, returned
-- together so a caller cannot render one without the others. "$4,680 owed"
-- alone reads as a debt; it is a deduction from income already earned, because
-- Dean pays the editor once the author pays him and the author pays on delivery.
--
-- A SEPARATE function, not a widened payouts_for_session. Widening would change
-- the return type, which requires DROP + CREATE — and that resets the ACL and
-- re-grants EXECUTE to PUBLIC, the regression this project has already had.
-- payments_for_session carries the card join but was changed the same day and
-- is deliberately left alone.
--
-- SCOPED TO UNPAID. A settled payout's book is no longer expected income, so
-- including it would make `net` describe a position that does not exist.
--
-- expected_in uses the same formula the stored payout amounts round to:
--   word_count / studio_words_per_finished_hour * pfh_rate
-- The divisor is READ FROM site_settings rather than hardcoded, so it moves
-- with the studio setting instead of drifting from it.
--
-- Verified as an authenticated admin:
--   expected_in 24142.56  committed_out 4680.00  net 19462.56
--   unpaid 8  paid 1  books_without_word_count 0

-- ============================================================
-- Payout functions carry the board gate (28 August 2026)
-- ============================================================
--
-- payouts_for_session and payout_summary_for_session now call
-- assert_board_access() first, like the other seven read functions.
--
-- Not a live vulnerability: both are SECURITY INVOKER and payment_payouts has a
-- "Role read" policy, so a non-admin already got zero rows. The gap was that
-- every other read function refuses at the door while these two relied entirely
-- on the policy behind it — one layer where the rest have two.
--
-- payouts_for_session moved from `language sql` to plpgsql to carry it. A SQL
-- function has no statement to perform before its query.
--
-- CREATE OR REPLACE, never DROP, and the ACL compared before and after rather
-- than assumed:
--
--   before  all nine: authenticated,postgres,service_role
--   after   all nine: authenticated,postgres,service_role
--
-- The observable change, as an authenticated non-admin:
--
--   before  payouts_for_session -> 0 rows (RLS filtered, no error)
--   after   payouts_for_session -> ERROR 42501 BOARD_ACCESS_NOT_ENABLED
--
-- The regression assertion is on committed_out, NOT expected_in or net.
-- expected_in also reads the divisor from site_settings, which is admin-gated
-- in its own right, so it returns 0 for a non-admin even if the payouts policy
-- failed completely — it would pass for the wrong reason. Only committed_out
-- depends solely on the payment_payouts join.

-- ============================================================
-- E2/E3: one definition of card economics (29 August 2026)
-- ============================================================
--
-- card_economics_for_session() is now the single place the formula lives:
--
--   share  = narrator_share_percent/100 if set
--          ; null if multicast (figure hidden entirely)
--          ; 0.5 for duet/dual ; else 1
--   income = word_count / studio_words_per_finished_hour * pfh_rate * share
--          ; null unless payment_type is 'pfh' or 'rs_plus'
--          ; null if status = 'recast'
--          ; explicit non-royalty amount_expected wins
--   invoice_total = income + editing_cost * (1 - share)
--
-- Divisor from site_settings, not hardcoded.
--
-- THE ASYMMETRY, which is what made the original bug subtle and which this
-- deliberately preserves:
--   EDITOR PAYOUT   word_count / divisor * rate_pfh          NO share.
--   DEAN'S INCOME   word_count / divisor * pfh_rate * SHARE  share applies.
-- committed_out stays the sum of stored payout amounts. The nine-payout test
-- pinning the share-free formula is CORRECT and was not touched.
--
-- ACCEPTANCE, against PRE-E1 data, to the cent:
--   production        function 14901.92   web 14901.92   MATCH
--   ready-to-invoice  function  7262.28   web  7262.28   MATCH
--
-- payout_summary_for_session now aggregates it and its local formula is
-- DELETED, not left unused — an unused copy is how the divergence returns.
-- Signature unchanged, so CREATE OR REPLACE is legal and no ACL was reset;
-- "editing billed back" is therefore folded into net rather than added as a
-- column, since a new column would have required the DROP that resets grants.
--
--   net = income - editing paid out + editing billed back
--
-- The web is deliberately NOT migrated to this function yet. Two
-- implementations existing briefly is acceptable; changing both at once would
-- give a mismatch two possible causes.

-- ============================================================
-- F2/F4: the share correction, and anon's board_cards ceiling
-- ============================================================
--
-- F2. Four cards had narration_format NULL with a co_narrator set, so both
-- clients treated them as solo (share 1) on duet work. Corrected via
-- narrator_share_percent = 50, NOT narration_format.
--
-- The share rule reads narrator_share_percent BEFORE narration_format, so 50
-- gives share 0.5 with the format left null. That matters because
-- narration_format RENDERS PUBLICLY — a format pill on /narrated-works, the
-- individual book page, and the /api/books payload — and the public catalogue
-- includes `contracted`, which all four are. Setting the format would have put
-- a "DUET" pill on the public site. The NULL is now load-bearing and must not
-- be "completed" as a tidy-up.
--
-- narrator_share_percent appears in NO public surface: zero references in
-- api/books, either narrated-works page, or the co-narrator page, and all four
-- referencing API routes are admin-gated.
--
-- Verified with the pages, not the schema: unauthenticated, zero format pills
-- on the catalogue and on both live book slugs (200 each), all four books still
-- listed, narrator_share_percent absent from the public JSON.
--
-- F4. anon held SELECT on board_cards that no policy admitted. Nothing was
-- exposed — as anon the table returned 0 rows while `authors` returned 27 — but
-- the ceiling was open, and one permissive policy later would have admitted
-- anon because the grant was already there.
--
-- Checked before revoking: all 22 board_cards call sites use supabaseAdmin, and
-- the anon browser client is DEFINED AND NEVER IMPORTED. Android signs in
-- first, so its role is `authenticated`.
--
-- NOTE THE POST-CONDITION THAT CANNOT HOLD. The plan expected anon to still
-- return 0 rather than an error. It cannot: removing the grant makes Postgres
-- refuse at the PRIVILEGE layer before RLS is consulted, so the observable
-- changes from an empty result to permission denied. That is precisely the
-- conversion the pre-check existed to make safe, and nothing calls it, so the
-- error is unreachable.
--
--   before  authors=27  board_cards=0   (empty, RLS filtering)
--   after   authors=27  board_cards=ERROR permission denied
