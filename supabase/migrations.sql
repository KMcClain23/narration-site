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
