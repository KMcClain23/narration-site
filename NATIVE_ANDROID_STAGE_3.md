<!-- STAGE3-TOKEN: bittern-4471-route-plus-late -->

# Native Android — Stage 3

**Token: `bittern-4471-route-plus-late`.** If this line is missing or reads
differently, you have a stale copy — stop and say so rather than building.

**This single file supersedes `NATIVE_ANDROID_STAGE_3_DESIGN.md` and every earlier
`NATIVE_ANDROID_STAGE_3.md`.** They were split across two documents, several pairs
in circulation had identical filenames, and a pre-patch pair reached the repo
without either of us being able to tell. One file, one token.

---

# 1. What Stage 3 is

**Agenda / Today** and **Card detail**, plus a one-clause trigger change and a
one-line control swap.

Decided by Dean, 26 August 2026:

| | |
|---|---|
| screens | Agenda/Today, Card detail |
| `deadline` means | **audio delivery deadline**; reaching `editing` means it was met |
| `released_at` | becomes a true release date — re-stamps on transition |
| `words_recorded` | Dean will maintain it; Stage 3 **displays** it, no write grant |
| agenda shape | **port `api/agenda/route.ts`, plus a late group** |
| cadence | build the whole stage, **one report at the end** |
| git | **Claude Code commits and pushes**, as throughout this project |

That last row corrects earlier drafts, which put "every git command" under Dean's
exclusive work. That was a mis-transcription of a different fact — *I* have no shell
on Dean's machine — and it reversed the standing practice. It is not a change.

---

# 2. What earlier drafts got wrong

Recorded because the errors are load-bearing, not for contrition.

- **`board_for_session()` does not leak financial columns to a future editor.** Its
  body raises `BOARD_ACCESS_NOT_ENABLED` for any non-admin, and the `Role read`
  policy is admin-only. The role-aware projection recommended earlier is **withdrawn
  entirely.** The claim came from reading the return type instead of the body.
- **There is no canonical status ordering, and none is needed.** See §3A.2.
- **The agenda spec described a different screen than the route implements.** See
  §3A.1. Resolved in favour of the route.

The rule this stage inherits: **read the body, not the signature.** A return type, a
grant list, an exclusion array and a function name are summaries. None is the
mechanism.

---

# 3A — Agenda / Today

**No migration.** No new table. `time_blocks` is dropped — see §3A.4.

## 3A.1 — `api/agenda/route.ts` is the base

Port it. It is running code that already encodes the workflow, and it is the
specification for what an agenda means here — the same relationship `PUT /api/board`
had to Stage 2's writes, where most of that stage's bugs were found by comparing
against the route rather than reasoning from scratch.

What it produces: books with **today** in `recording_dates`; a **due-soon** set
inside `DUE_SOON_DAYS = 7`; **week and month hours** from `narrationPlan`.

Produce a **divergence list**: every point where Android behaves differently from the
route, with the reason. If the list is empty, say so explicitly. It is a deliverable,
not a note.

Where the route and this document disagree on anything except §3A.3, **the route wins
and you tell me.**

## 3A.2 — The status set is canonical already

Do **not** build a status ranking. `CardEditModal.tsx:131`'s `STATUSES` puts `recast`
after `released`, so ranking by it scores a recast card as further along than a
released one. `recast` is an off-ramp, not a stage.

The rule needs a **set**:

```
{ contracted, prepping, recording }
```

Three independent definitions already agree — `ACTIVE_STATUSES` in
`api/agenda/route.ts:16`, `AT_MIC_STATUSES` in `board-card-utils.ts:89`, and
`ATTENTION_STATUSES` in `board-filters.ts:43`. That is as canonical as this codebase
gets.

The rationale is already written, in the place it is used, and it should be carried
across verbatim rather than paraphrased:

> *Editing is deliberately absent. A book past the mic still has work in it, but none
> of it happens in the booth, and an agenda that lists it is telling you to record
> something you have already recorded.*

Define the set **once** in Android, named, carrying that comment.

`recast` cannot appear anyway — `board_for_session()` does not return it. `audition`
is `STATUSES`' seventh value and has **zero rows**; do not build for it.

## 3A.3 — The late group: the one thing added to the route

The route's `dueSoon` filters `deadline >= today`. A card that slips past its delivery
deadline while still in `{contracted, prepping, recording}` therefore falls **out** of
`dueSoon`, and unless it happens to be recording today it appears **nowhere**. Dean
would learn about it from the client rather than the app.

That is a dropped case, not a design difference, and closing it is the only addition
to the route:

```
late  ==  deadline < today  AND  status in { contracted, prepping, recording }
```

Cards in `editing` past their deadline are **delivered** and must not appear here.
Rendering them as late is the specific defect this rule exists to prevent — there are
six of them and DoD 11 names them.

**Not in this stage:** `first15_due`. The route does not consider it, Dean approved
"route plus a late group", and adding a second commitment type is scope I am not
taking. Eleven cards carry a `first15_due` and four are pending; zero are overdue.
Recorded as a candidate for a later stage, deliberately deferred, not overlooked.

## 3A.4 — `time_blocks` is dropped

The route reads `time_blocks` for blocked time. That table has **one row and nothing
dated in the future**, and it has no Android RLS grant — Stage 0 scoped policies to
`board_cards` and `site_settings`.

Porting it would need a migration for a table carrying one historical row. Drop it,
note the omission in the divergence list, and leave Schedule to the deliberate grant
the roadmap already plans for it. **`grep` should find no reference to `time_blocks`
in the Android source** (DoD 12).

## 3A.5 — What the live data contains today

| | count |
|---|---|
| recording today (`2026-08-26`) | **1** |
| due soon, `deadline` within 7 days, pre-delivery | **1** |
| **late** under §3A.3 | **0** |
| past `deadline` but in `editing` (must not show as late) | 6 |
| cards with any `recording_dates` | 11 |

The screen has real content on day one. **The late group does not** — it cannot be
reached without constructed data.

Construct it: move one card to a past `deadline` while in `recording`, verify it
renders in the late group, restore it to its exact prior value, quote before and
after. A state that ships having never rendered is the same failure this project has
been chasing all along.

Use `kotlinx-datetime` `LocalDate` and `todayIn(TimeZone.currentSystemDefault())`.
These are date-only columns; a UTC instant comparison shifts the boundary by up to a
day, and the failure is invisible because it makes dates look *closer*, not further.

## 3A.6 — Progress

Render `words_recorded / word_count`. Display only — `words_recorded` stays out of
the write grant this stage.

Guard the division: `word_count` could be zero, and `words_recorded` may exceed it
once maintained by hand. Clamp, and state what you clamped to.

`words_recorded` is 0 on 18 of 20 active cards. Dean has a backfill statement (§6)
that makes it truthful for completed books; whether he has run it is his to say.

## 3A.7 — Structure

Pull-to-refresh through `ScrollableContent`. The empty state scrolls — use `blank()`,
not a bare `Box`. The type now makes the alternative uncompilable.

---

# 3B — Migration

Verified **against the REST API with a real JWT**, not the SQL editor. The editor
bypasses RLS and would pass every check below against a broken configuration. Stage
0's lesson, still true.

## 3B.1 — `released_at` becomes a true release date

Replace the third clause. **Do not delete it.**

```sql
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
```

The first two clauses are unchanged and correct — they test the *transition*, not the
state. The third now reads: *stamp `now()`, unless the caller supplied a date in this
statement.* `released_at` is one of the six granted columns, so a caller supplying a
real historical date is a write the schema permits and the trigger must not clobber.

Deleting the clause outright would overwrite that silently. That is why this is not
the one-liner it looks like.

**Do not backfill or clear any existing `released_at`.** `How an Angel Dies: Wrath`
carries `2026-07-16` and that is a fact about July.

## 3B.2 — `card_detail(p_id uuid)`

Mirror `board_for_session()` — same shape, same guard, same error style:

```sql
create or replace function public.card_detail(p_id uuid)
returns table (/* explicit column list */)
language plpgsql stable set search_path = public
as $fn$
begin
  if coalesce(public.current_app_role(), '') <> 'admin' then
    raise exception 'CARD_ACCESS_NOT_ENABLED' using errcode = '42501';
  end if;

  return query
    select /* explicit columns */
    from public.board_cards c
    where c.id = p_id;
end $fn$;
```

**Security invoker** — do not add `security definer`. RLS must still apply, and
definer is where the recursion trap lives.

**A raise, not zero rows.** A direct select would work and return zero rows to a
non-admin, but zero rows cannot be told apart from an archived card or a bad id. The
app already renders this errcode as its refused state. Ambiguity here is Stage 2's
bug 5 again, where a correct rollback and a tap that never happened were
pixel-identical.

Grant `execute` to `authenticated` only; confirm `anon` and `public` are absent from
the ACL, as Stage 0 did for `board_for_session()`.

Choose the column list deliberately — it should cover what 3C renders and nothing
more. A wider return type is a wider surface for F3 to narrow later.

---

# 3C — Card detail

Depends on 3B. Opens from a board card tap; back returns to the originating tab with
scroll position intact.

Traps confirmed in the live data:

- **`chapters[].number` is null** in real rows. A non-nullable `Int` is a parse crash
  reachable only by opening one particular book. Find that book and open it.
- **`chapters[].status`** — enumerate the distinct values **from the data**. The
  sample showed `not_started` and `live`; a sample is not an inventory.
- **`links`** is `not null` and empty on every row today. Render nothing when empty.
- **`recording_dates`** is a flat array of date strings.
- **`recast` is a status; `recasted` is an archive reason.** One letter apart, in a
  codebase that already lost a day to `9300` versus `9400`.

Financial fields render via `Capabilities.of(role)`, never a `role ==` in a composable.

---

# 3D — Sign-in

Replace the stock `OutlinedTextField` on the sign-in screen with `DmnTextField`.
Carried from Stage 2's close. One line.

---

# 4. Definition of done

Numbers, not pass/fail. Quote values.

**Zero**

0. This document carries token `bittern-4471-route-plus-late`, and no stale Stage 3
   document remains in the repo.

**Migration**

1. `released_at`, four cases over REST with a real JWT, before/after quoted each:
   (a) transition to released, `released_at` null → stamped;
   (b) transition to released, `released_at` already set, caller supplies none →
       **re-stamped**, new distinct from old;
   (c) transition to released with an explicit `released_at` in the same statement →
       **the supplied value survives**, not `now()`;
   (d) update to an already-`released` card with no status change → **unchanged**.
2. `card_detail` as admin returns one row for a known id. Quote the column count and
   confirm it equals the function's return-type arity.
3. `card_detail` as `editor` raises. Quote the message and SQLSTATE.
4. `card_detail` as anon — unchanged from Stage 0.
5. `prosecdef = false` on `card_detail`; quote the ACL, confirm `anon` and `public`
   absent.

**Agenda**

6. Divergence list against `api/agenda/route.ts` — every difference, with reasons.
   Explicitly state if empty.
7. The status set is defined in exactly one place. Quote it and its carried comment.
8. Recording-today and due-soon counts as rendered, each matched against a
   server-side `count(*)`. Both are **1** today.
9. The late group is **empty** against live data. Quote the count.
10. Constructed late card renders in the late group; restored; before/after quoted.
11. The six `editing` cards past `deadline` do **not** appear as late. Name all six.
12. `grep` finds no reference to `time_blocks` in the Android source. Quote it.
13. Progress renders. Quote `words_recorded / word_count` for one card per status,
    and state the clamp behaviour for zero and over-100%.
14. Pull-to-refresh works; the empty state scrolls.

**Card detail**

15. Opens on tap; back returns to the same tab and scroll position.
16. Every column in `card_detail`'s return type is rendered or listed as deliberately
    omitted. **The omission list is the deliverable.**
17. The book with a null `chapters[].number` opens without crashing. Name it.
18. Distinct `chapters[].status` values, enumerated from the data. Quote the set.
19. `links` renders nothing where empty — every row today.
20. Demote to `editor` with detail open, pull → the refused screen, not "not found".
    Restore admin.

**Hygiene**

21. No `role ==` in `ui/`; no `select("*")`.
22. All unit tests green including `SwipeVersusPagerTest`; 0 release warnings.
23. Sign-in uses `DmnTextField`.

---

# 5. Review

One report at the end. Stop early only if 3B's verification disagrees with this
document, or if the route contradicts §3A.1 in a way §3A.3 does not cover.

---

# 6. Work only Dean can do

- Demote to `editor` and restore to `admin` in the SQL editor, for DoD 3 and 20.
- Construct and restore the late card in DoD 10 — or approve Claude Code doing it and
  check the restore himself.
- Device confirmation of both screens.
- **Decide the `words_recorded` backfill.** Without it, seven finished books read 0%:

```sql
update public.board_cards
   set words_recorded = word_count
 where status in ('editing', 'released')
   and words_recorded = 0
   and word_count > 0;
```

Dean's statement to run — a knowing write to production, not a side effect of
building a screen.

---

# 7. Carried forward

- **Read the body, not the signature.** Three consecutive errors this session were
  this one.
- **Reporting an intention as a fact is its own error class.** Two documents were
  described as being in the repo when they had only been sent to a chat.
- **Write the illegal construction.** It is the only thing that distinguishes a guard
  from a comment.
- **A mechanism's purpose is not an inventory of its coverage.** Count the set.
- **A parser that skips what it does not understand converts an unknown into a pass.**
- **Verify the mechanism fires, including the verification machinery.**
- **A comment claiming to be the mechanism when it isn't is a false landmark.**
- **A state you reach only by failing is a state nobody looks at** — and one needing
  constructed data to reach is the same thing wearing a different coat.
