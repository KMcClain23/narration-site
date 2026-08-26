# Native Android — Stage 2 design brief

**Question:** where do the write-path side effects live once two clients can write?
**Status:** decisions made 25 August 2026 — see "Decisions, locked" at the end.
**Prepared:** 25 August 2026 · rev. 3

---

## Correction to earlier statements

Every previous mention of this question named three side effects: `released_at` stamping,
`status_change_log` rows, and the PUT field allowlist.

**`status_change_log` does not exist.** `supabase/migrations.sql:431` drops it. It was an
audit trail for batched author status-update emails; nothing in `src/` references it, and
it is absent from the live schema. It was asserted from a `create table` line earlier in
the same file without checking whether anything still used it, and repeated from there.
Delete it from your mental model and from `PROJECT_ROADMAP.md`.

The rest of this brief is read from `src/app/api/board/route.ts` rather than remembered.

---

## What the write path actually does

`PUT /api/board` is the only mutation endpoint the **board UI** uses.
**Correction to rev. 1, which said there was no second writer:** there is.
`/api/cron/refresh-amazon-rating` writes `board_cards` directly as `service_role`, so
neither RLS nor column grants constrain it. It matters for exactly one thing — see
`updated_at` below. Archive goes through
it (`ArchiveConfirmDialog` sends `archived_at` / `archived_reason` / `archived_notes` as
plain fields). Status moves, the First-15 toggle and release all go through it too — so
there is one write path for everything a *person* does, and one background writer.

Inside it, five things happen that a direct Postgres write would skip:

| # | Effect | Nature |
|---|---|---|
| 1 | `updated_at` set on every update | pure data |
| 2 | `released_at` auto-stamped on transition to `released`, **only when currently null** | pure data |
| 3 | `released_at` date-only values anchored to Pacific midday | pure data |
| 4 | **Amazon auto-fill** — scrapes description / tags / trigger warnings into empty fields | outbound HTTP |
| 5 | A 30+ column allowlist | authorization / schema guard |

Plus six "retry shims" that catch an error mentioning a column name, delete that column
from the payload, and retry. They date from a period when migrations lagged the code.
Every column they guard now exists. **They are dead code that silently swallows real
errors** — a genuine `trigger_warnings` constraint violation would be retried away rather
than reported. They should be deleted in Stage 2 regardless of what else is decided.

### The one that does not fit

Effects 1–3 are derived data: a function of the row and the change. Effect 5 is a
statement about what a client may alter.

**Effect 4 is an outbound network call to Amazon**, and it is the only one that cannot
live in the database. Two things about it worth knowing before deciding its fate:

- It runs on every card save that has an Amazon link and an empty description, making the
  user's save wait on a third-party scrape.
- The project's own cron for Amazon ratings documents that *"Amazon blocks this server on
  datacentre IP reputation, decided on the first request."* If that is true for the rating
  fetch it is likely true for this one, which would mean **this side effect is largely
  inert in production already**. Worth confirming before spending any design effort
  preserving it.

---

## The options

### A — Postgres triggers + column grants *(recommended)*

Effects 1–3 become triggers on `board_cards`. Effect 5 becomes
`grant update (…) on board_cards to authenticated` — the allowlist expressed as the
privilege system that exists for exactly this purpose.

- **Both clients get the effects without either remembering.** So does a psql session, or
  the dashboard, or anything built later.
- **The allowlist becomes enforced rather than asserted.** Postgres rejects an update to
  an ungranted column. Since the editor never writes, there is no admin/editor
  discrimination problem — column grants attach to the database role, and only
  `authenticated`-as-admin will ever hold write access.
- **The web keeps working untouched.** Triggers fire for `service_role` too. Column grants
  do *not* constrain it, so the web's TypeScript allowlist stays as the web's own guard.
- **Cost:** logic moves out of the codebase into migrations. Debugging "why did this
  column change" means reading SQL. Errors surface as Postgres errors, which are less
  legible than a hand-written 400.

### B — RPC functions

`rpc('move_card_status', …)`, `rpc('archive_card', …)`. Both clients call named
operations rather than updating columns.

- More legible at the call site — "release this card" beats "set a column and trust a
  trigger to notice."
- The allowlist becomes the function signature: you cannot pass what it does not accept.
- **Cost:** ceremony per operation, and it only pays off if operations are multi-step or
  need validation the schema cannot express. Here they are single-row updates. It would
  also leave the web either rewritten to match or drifting from Android.

Worth revisiting if Stage 3+ brings operations that touch several tables at once.

### C — Android calls the Next.js API routes

Reverses the Stage 0 architecture for writes only. Android already holds a Supabase JWT
the routes could verify.

- Zero duplication; all logic stays in TypeScript.
- **Cost:** every write goes through Vercel; the routes have no concept of users, so this
  path cannot serve the editor when F3 arrives; and it re-introduces exactly the
  dependency Stage 0 removed. Named for completeness — not recommended.

### D — Reimplement in Kotlin

The status quo trajectory if nothing is decided. Two implementations of the same rules,
drifting. `wordsPerFinishedHour` is what that looks like after a year. Named to be
rejected explicitly rather than arrived at by default.

---

## Recommendation

**A, plus moving the Amazon fill out of the write path entirely.**

1. **Triggers** for `updated_at` and the `released_at` stamp, including the
   "never overwrite an existing value" rule and the Pacific-midday anchoring.
2. **Column-level `GRANT UPDATE`** for the allowlist, alongside the existing RLS policy
   widened to permit `UPDATE` for role `admin`.
3. ~~**Amazon auto-fill moves to the existing cron.**~~ **SUPERSEDED — delete it instead.**
   Verified inert in production: 0 of 12 released titles carry a refresh stamp after three
   cron runs. See "Decisions, locked" §1.
4. **Delete the retry shims.**
5. **Delete the TypeScript that triggers now own**, in the same change.

The migration hazard is smaller than it looks. `updated_at` set twice is harmless.
`released_at` has an "only if null" guard on both sides, so a trigger and the surviving TS
cannot double-stamp. Nothing here needs a flag day.

### What this buys

After it, Android's write path is a plain `update` against `board_cards` under RLS. No
Kotlin reimplementation of any rule, no RPC layer, no shared code to keep in sync — and
the two clients agree because the database makes them, not because both remembered.

---

## Decisions needed from Dean

1. **Amazon auto-fill on save** — move to cron, keep it web-only, or drop it? Check first
   whether it currently works at all from Vercel.
2. **Does Android create cards in Stage 2**, or is it edit-only? The web's New Project
   modal is a `POST` with its own defaults; including it roughly doubles the surface.
3. **Does the web eventually move to this write path too**, or stay on `service_role`
   indefinitely? Not required for Stage 2 — it only decides whether the TS allowlist is
   temporary or permanent.

## Known constraints for whoever writes the spec

- A trigger cannot see *who* acted beyond `auth.uid()`, which is null for `service_role`
  writes. If an audit trail is ever wanted, that is a constraint to design around, not
  something to bolt on later.
- Stage 2 adds a failure state to every optimistic update by construction. Stage 1's
  hardest-won lesson applies directly: **a state you reach only by failing is a state
  nobody looks at**, and one of those failures needed a lifecycle boundary rather than
  elapsed time. Rollback paths need verification that is not a sequence of taps.
- `Capabilities.canEdit` is already present and hard-`false`. Stage 2 wires into that
  existing seam rather than introducing one.


---

# Decisions, locked — 25 August 2026

## 1. Amazon auto-fill: **delete it. Do not move it to the cron.**

Verified against the live database rather than assumed:

| | |
|---|---|
| released titles | 12 |
| with an Amazon link | 12 |
| with `amazon_rating` | 12 — all manually seeded |
| with `amazon_rating_updated_at` | **0** |

`amazon_rating_updated_at` is stamped only on a genuine parse. Three cron runs, zero
stamps. `fetchAmazonHtml` has two callers — the on-save fill and the cron — issuing the
same request with the same headers from the same datacentre IP, and the cron's own
comment records that Amazon blocks on IP reputation at the first request. **The on-save
fill cannot be working.** Moving it to the cron would relocate dead code into a scheduled
job that also cannot reach Amazon.

Delete the on-save path. Keep the manual **Refetch** button in the Content tab: it is
user-initiated, already reports the block honestly, and costs nothing if Amazon's posture
ever changes.

**This is the load-bearing answer.** It removes the only effect that could not live in the
database. All four remaining effects are derived data or authorization, both
database-native, so Option A stops being "recommended with one exception" and becomes
complete.

## 2. `updated_at`: trigger it, but **skip writes that only touch `amazon_*`**

*Rev. 2 said "trigger it unconditionally, the cron's comment is false." That was wrong,
and the reasoning behind it was wrong in an instructive way. Corrected here.*

`board_cards.updated_at` has **three readers**, verified in source:

| where | what it does |
|---|---|
| `app/contacts/authors/page.tsx:21` | `select("author, updated_at")` → max per author → `lastActivity` |
| `app/contacts/co-narrators/page.tsx:22` | same, per co-narrator |
| `app/api/board/export/route.ts:28` | exported as the "Updated At" column |

And `lastActivity` is not internal plumbing: `SortKey = "name" | "email" | "bookCount" |
"lastActivity"`, with a **"Last activity"** column rendered on both contact list pages.
Visible, and sortable by.

**So the cron's comment is accurate, and the meaning it describes is enforced** — by
`PUT /api/board` being the only writer that sets `updated_at` and the rating cron
deliberately abstaining. Rev. 2 proposed rewriting a true comment into a false one.

An unconditional trigger would be quietly corrosive rather than loudly broken. The rating
cron touches three books a day; each write would bump that book's `updated_at`, which
bumps its author's and co-narrators' "Last activity" to today. Within about four days
every person with a released book reads *last activity: today*, and the column — and
sorting by it — stops carrying information. No error, no failing test, just a column that
means nothing any more.

**The trigger must skip when the only changed columns are `amazon_rating`,
`amazon_review_count` and `amazon_rating_updated_at`.**

Implement the comparison as jsonb subtraction rather than an enumerated list of columns
that *do* count:

```sql
-- Sketch. The exclusion set is small and stable; the inclusion set would be
-- large and would grow with every migration.
if to_jsonb(new) - 'updated_at' - 'amazon_rating' - 'amazon_review_count'
                 - 'amazon_rating_updated_at'
   is distinct from
   to_jsonb(old) - 'updated_at' - 'amazon_rating' - 'amazon_review_count'
                 - 'amazon_rating_updated_at'
then
  new.updated_at := now();
end if;
```

That way a column added in a future migration counts as a human edit by default, which is
the safe direction to fail in. An enumerated inclusion list would silently stop tracking
any new column until someone remembered to add it.

## 3. The TypeScript allowlist is **not** retired by the column grants

Also correct, and rev. 1 was wrong to imply otherwise. `GRANT` binds `authenticated`; the
web runs as `service_role` and bypasses it entirely. Until F2 the TypeScript allowlist is
**the web's only enforcement** — not a duplicate awaiting deletion.

Mark it temporary pending F2, but do not schedule F2 around it. The practical difference
is whether that array carries a comment saying "delete when F2 lands" or "permanent"; it
is not worth a twenty-page migration to tidy up one array.

## 4. Scope: **edit-only. No creation in Stage 2.**

Creation brings its own defaults (`status` → `contracted`, slug derivation, a separate
insert shape in the `POST` branch) — a second allowlist to move and a second set of rules
to agree on.

The stronger reason is rollback shape. An optimistic **edit** rolls back to a known prior
state. An optimistic **create** has nothing to roll back to, so its failure path needs its
own design. Stage 2's real risk is failure states, not the happy path, and starting a
project is not a phone job.

## 5. Retry shims: delete all six

Every column they guard now exists. They can only swallow real errors — a constraint
violation gets retried into a different, more confusing failure. They are also why
`/api/books` silently drops `slug`: the fallback chain degrades quietly instead of
reporting.

---

## A note on how this brief shrank

Rev. 1 named five effects. One (`status_change_log`) did not exist. Another (the Amazon
fill) had not worked in production for as long as anyone can measure. Rev. 2 then claimed
`updated_at` was read by nothing, when three surfaces read it and one of them is a
sortable column a person looks at.

All three are the same error: **evidence about one direction taken as evidence about
both.** `status_change_log` — read a `create table`, inferred a live dependency.
The Amazon fill — read code that fetches, inferred fetching. `updated_at` — read the one
place it is written, inferred nothing reads it.

The `updated_at` case has a specific lesson about *how* the wrong conclusion was reached.
It came from a grep that (a) ran against a hand-picked subset of the repo rather than the
repo, and (b) was truncated with `head`. Neither is visible in the output. **A grep over a
corpus you curated is not evidence of absence**, and "I searched and found nothing" is the
most confident-sounding way to be wrong.

Three derived-data effects and one authorization rule is what was actually there. The
difference between five and four is the difference between needing an application layer
and not needing one — the entire design turned on a side effect that was already inert.

**Before designing around a behaviour, confirm it still occurs — and confirm both
directions separately.** Who writes it is not who reads it. Same failure mode as Stage 0's
trigger and Stage 1's guard test, one layer up: code that says it does something is not
evidence that it does, and a search that finds nothing is only as good as what it
searched.
