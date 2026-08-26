# Native Android — Stage 2: writes

**Depends on:** Stage 1 complete ✅, and `NATIVE_ANDROID_STAGE_2_DESIGN.md` rev. 3, whose
five locked decisions this spec implements. Read that first — it explains *why*, and it
records two claims that turned out to be wrong, which is the more useful half.
**Prepared:** 25 August 2026

---

## Scope

**In:** the board's own mutations, admin only.

- First-15 toggle becomes interactive
- Status moves (long-press action menu, and Move to Pipeline)
- Mark as released, with its confirmation
- Swipe-to-archive, with reason and notes
- Optimistic updates with rollback
- The database changes that make all of the above safe for two clients

**Out, deliberately:**

- **Card creation.** Locked in the design brief §4: it drags in its own defaults and a
  second allowlist, and an optimistic create has nothing to roll back to, so its failure
  path needs its own design. Starting a project is not a phone job.
- **The full card edit modal.** Stage 2 is the board's gestures, not a form. The
  "Edit on web" link stays.
- **Anything for the editor role.** Still read-only, still not created.

---

# 2A — The migration

One re-runnable section appended to `supabase/migrations.sql`, following that file's
conventions. Nothing here changes an existing row.

## 2A.1 — `updated_at` trigger

`board_cards.updated_at` is read by three surfaces — `contacts/authors/page.tsx:21`,
`contacts/co-narrators/page.tsx:22`, and `api/board/export/route.ts:28` — and feeds a
**visible, sortable "Last activity" column** on both contact pages. The rating cron
deliberately abstains from setting it, and that abstention is what keeps the column
meaningful.

```sql
create or replace function public.board_cards_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
declare
  ignored text[] := array[
    'updated_at', 'amazon_rating', 'amazon_review_count', 'amazon_rating_updated_at'
  ];
begin
  -- Bump only when something a person could have changed actually changed.
  -- The rating cron writes amazon_* and nothing else. Three surfaces read this
  -- column as "last human edit", including a sortable column on the Authors and
  -- Co-narrators pages; an unconditional bump would push every author with a
  -- released book to "last activity: today" within about four days and quietly
  -- destroy the column's meaning. No error, no failing test — just noise.
  if to_jsonb(new) - ignored is distinct from to_jsonb(old) - ignored then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists board_cards_touch_updated_at on public.board_cards;
create trigger board_cards_touch_updated_at
  before update on public.board_cards
  for each row execute function public.board_cards_touch_updated_at();
```

The exclusion set is small and stable; an inclusion list would grow with every migration
and silently stop tracking any column nobody remembered to add. A future column counts as
a human edit by default, which is the safe direction to fail in.

**Then delete `updated_at` from the update object in `PUT /api/board:195`.** Two writers
of one rule is the drift this stage exists to end — and the route sets it
*unconditionally*, so a manual Amazon Refetch through that route would bump it where the
trigger would not.

## 2A.2 — `released_at` auto-stamp trigger

Port the rule from `PUT /api/board`, exactly: stamp only on transition **to** `released`,
and only when the existing value is null. A manually entered date is never overwritten.

```sql
create or replace function public.board_cards_stamp_released_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'released'
     and coalesce(old.status, '') is distinct from 'released'
     and new.released_at is null
  then
    new.released_at := now();
  end if;
  return new;
end $$;
```

Trigger it `before update` alongside the other. Then **delete the auto-stamp block from
`PUT /api/board`** — the snapshot read of `released_at`, the `existingReleasedAt` variable
and the `if` that sets it.

**Not in scope for this trigger: the Pacific-midday anchoring.** That normalises a
*user-picked date* from a date input, which is an input-format concern, not a derived
value. The auto-stamp is an instant and needs no anchoring. Android's date handling should
send a correct `timestamptz` directly. Leave `dateOnlyToPacificNoon` where it is.

## 2A.3 — Write access

Two independent gates. Both are needed, and they fail differently — which matters in 2C.

```sql
-- RLS: admin may update. The role list is the extension point, as in Stage 0.
drop policy if exists "Role update" on public.board_cards;
create policy "Role update" on public.board_cards
  for update to authenticated
  using      ((select public.current_app_role()) in ('admin'))
  with check ((select public.current_app_role()) in ('admin'));

-- Column privileges: the allowlist, enforced by Postgres rather than asserted
-- in TypeScript. Stage 2 grants only what the board's gestures touch.
grant update (
  status, first_15_complete, released_at,
  archived_at, archived_reason, archived_notes
) on public.board_cards to authenticated;
```

Both `using` and `with check` are required: `using` decides which rows may be updated,
`with check` decides whether the *result* is still permitted. Omitting `with check` lets an
admin write a row they could not then read.

**Verify, do not assume:** the `updated_at` trigger assigns `new.updated_at` while
`authenticated` holds no `UPDATE` grant on that column. Column privileges are checked
against the statement's target columns rather than trigger assignments, so this should be
fine — but confirm it with an actual update from an Android-role session before relying
on it. If it does fail, the fix is granting `updated_at` too, not removing the trigger.

**The TypeScript allowlist stays.** `GRANT` binds `authenticated`; the web runs as
`service_role` and bypasses it entirely, so until F2 that array is the web's only
enforcement — not a duplicate awaiting deletion. Comment it as temporary pending F2.

## 2A.4 — Verification

Against the **REST API with a real JWT**, not the SQL editor. The editor bypasses RLS and
would pass every check below against a completely broken configuration — this is Stage 0's
lesson and it has not stopped being true.

1. Admin session updates `first_15_complete` → succeeds, row returned
2. Same update: `updated_at` **advanced**
3. Update touching **only** `amazon_rating` → `updated_at` **unchanged**. This is the case
   the trigger exists for; it is the one to run twice.
4. Set `status` to `released` on a card with `released_at` null → stamped
5. Repeat on a card with `released_at` already set → **unchanged**
6. Update an **ungranted** column (`title`) → `permission denied`, an error
7. Demote to `editor`, retry (1) → **0 rows, no error.** Restore admin.
8. Anon, no session → unchanged behaviour from Stage 0

Report the actual `updated_at` values from (2) and (3) side by side. "It worked" is not a
result for a trigger whose entire job is to sometimes not fire.

---

# 2B — Web cleanup

Settled by the design brief; neither needs the migration.

1. **Delete the on-save Amazon fill** in `PUT /api/board`. Verified inert: 0 of 12 released
   titles carry a refresh stamp after three cron runs, and the same blocked fetch backs
   both callers. Keep the manual **Refetch** button in the Content tab — user-initiated,
   already honest about the block.
2. **Delete the retry shims — there are more than six, and not all are in `PUT`.**
   *Corrected 26 August: the original count came from reading only lines 165–310 of
   `api/board/route.ts` and describing the whole file from its `PUT` handler.*

   | where | what |
   |---|---|
   | `PUT` | six shims — **deleted** |
   | `GET` line 35 | `archived_at` → retries with **`select("*")`** |
   | `POST` lines 115–131 | four more, on the insert path |

   Every column they guard exists, so they can only swallow real errors now, retrying a
   constraint violation into a more confusing failure. They are also why `/api/books`
   silently drops `slug`.

   **The `GET` one is the priority.** An error-triggered `select("*")` on the board read is
   the same defect DoD 18 forbids in Android, reachable by any error whose message
   contains that column name.

---

# 2C — Android

## 2C.1 — Failure semantics ⚠️

**The two gates fail differently, and one of them does not look like a failure.**

| Cause | What comes back |
|---|---|
| Ungranted column | an **error** — `permission denied` |
| RLS refuses the row (role no longer admin) | **success, zero rows** |

An RLS-blocked update is not an exception. PostgREST returns 200 with an empty array. A
client that treats "no exception" as "saved" will show every optimistic update sticking
forever for a user whose access was revoked — the same family as bugs 3–5, where a
transport-shaped answer was read as an authorization one, only inverted.

**So every write must assert on the returned representation, not on the absence of a
throw.** Request the updated row back, and treat zero rows as a failure that rolls back
and surfaces "You no longer have permission to make that change." A write that returns no
row has not happened.

## 2C.2 — Optimistic updates

Apply locally, fire the write, reconcile:

- **Row returned** → replace local state with the server's row. Not with the optimistic
  guess; the trigger may have set `released_at` or `updated_at`, and the server's copy is
  the truth.
- **Zero rows** → roll back, permission message, refresh the board.
- **Error** → roll back, error message, keep the cards.

Rollback restores the exact prior value, captured before the optimistic apply. Do not
recompute it.

## 2C.3 — The gestures

`Capabilities.canEdit` becomes `true` for `ADMIN`, `false` for everything else. It is
already present and hard-`false`; this is the seam it was built for. Nothing else in the
UI learns about roles.

- **First-15 checkbox** — interactive when `canEdit`. Toggles `first_15_complete`.
- **Long-press action menu** — port `BoardActionMenu`: move to Prepping / Recording /
  Editing, Move to Pipeline (`contracted`), Mark as Released, Archive.
- **Mark as Released** — confirmation dialog, then `status = 'released'`. The card leaves
  the board (it is outside `ACTIVE_STATUSES`), so it fades and is removed, and the
  Released count increments.
- **Swipe-to-archive** — port the thresholds exactly: −90dp, 0.5 velocity flick, −110dp
  clamp. Then the confirm dialog with reason and notes, writing `archived_at`,
  `archived_reason`, `archived_notes`.
- **Card detail sheet** stays read-only. Editing fields is not this stage.

## 2C.4 — What stays out of Kotlin

No Kotlin implements `released_at` stamping, `updated_at`, or the allowlist. If you find
yourself writing any of those rules in the app, the migration is wrong — go fix it there
instead.

---

# Definition of done

Numbers, not pass/fail.

**Migration**

1. All eight checks in 2A.4, with the two `updated_at` values from (2) and (3) quoted
2. `grep` finds no `updated_at` assignment left in `PUT /api/board`
3. `grep` finds no `released_at` auto-stamp block left in `PUT /api/board`
4. `grep -rn "fetchAmazonBook" src/` returns **nothing**. `fetchAmazonBookResult` and
   `fetchAmazonRating` both survive — Refetch reaches the first via
   `/api/board/amazon-preview`, the cron reaches the second.
   *Corrected: the original wording folded `9400` into this grep, which cannot pass or
   fail. Those four occurrences are W1's territory and explicitly out of scope here.*
5. `grep -c "error.message?.includes" src/app/api/board/route.ts` returns **0** — all
   shims, in `GET` and `POST` as well as `PUT`

**Android — happy path**

6. First-15 toggles, survives a pull-to-refresh, and matches the web
7. Each status move lands the card in the right section of the right tab
8. Mark as Released removes the card and increments the Released count
9. Swipe-to-archive removes the card; it is findable again via search
10. Board still reads 20 after a full cycle out and back

**Android — failure paths, which is where this stage's risk actually is**

11. **Offline mutation:** toggle First-15 with airplane mode on → optimistic apply, then
    rollback with an error, cards intact, no sign-out. Bug 5's family — confirm the write
    failure does not touch the session.
12. **Revoked mid-session:** demote to `editor` in the SQL editor, then attempt a toggle
    **without signing out** → rolls back with a permission message, does not appear to
    succeed. Restore admin, confirm writes work again. This is the zero-rows case from
    2C.1 and the most likely thing to be silently wrong.
13. **Lifecycle:** perform a mutation, background the app, foreground it, pull to refresh →
    the change persisted and the local state matches the server. Stage 1's bug 5 needed a
    lifecycle boundary rather than elapsed time; every future state check inherits that.
14. **Rollback correctness:** a failed toggle on an already-complete First-15 restores
    *complete*, not the default. Test the rollback of a non-default prior value.

**Hygiene**

15. Unit tests for the optimistic-update reducer including the zero-rows path
16. `grep` finds no `role ==` in `ui/`; no `select("*")`
17. 0 release warnings

---

# Review checkpoints

- **After 2A.4** — the migration and all eight verification results, before any Android
  code. If the trigger's exclusion is wrong, everything above it is built on sand.
- **After 2B** — the two deletions, with the greps.
- **After 2C.1–2.2** — the write path and its reducer tests, before the gestures are wired.
- **After the DoD** — the full stage, with items 11–14 reported individually.

---

## Carried forward from Stage 1

- **A state you reach only by failing is a state nobody looks at.** Stage 2 adds a failure
  state to every gesture by construction. Items 11–14 exist for that reason and are not
  optional.
- **Verify the mechanism fires, never that it merely exists** — including the verification
  machinery. Two of Stage 1's guard-test holes were found by deliberately making it fail.
- **Credential destruction is reachable only from an explicit user action.** Nothing in
  this stage may add a path to `clearSession()`. `CredentialDestructionGuardTest` should
  still pass unchanged; if it goes red, that is the stage doing something it should not.
