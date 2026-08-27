<!-- STAGE6-TOKEN: dunlin-1207-released-archive -->

# Native Android — Stage 6: Released + Archive

Token: dunlin-1207-released-archive

Cadence: build the whole stage, ONE report at the end. Stop early only if 6A's
verification disagrees with this document, or if the count question in 6B.3 has no
clean answer.

---

## What the live data holds, verified 27 August 2026

  released      12 active — ALL 12 have released_at, amazon_rating, audible_link
                release dates 2025-11-07 → 2026-08-18
  archived       1 active — Leather & Lies (status recording, reason "recasted")
  recast         1 active, NOT archived, not on the board — invisible from the phone
  editing        1 carries a released_at (How an Angel Dies: Wrath, 2026-07-16)

Released has real content. Archive has one row, and its normal state is empty.

---

## 6A — Migration: extract the guard before adding functions that need it

board_for_session() and card_detail() each open with the same three-line admin check
raising errcode 42501. Stage 6 adds two more functions that need it. Four copies of a
security check kept in step by memory is the disease this project has spent five
stages removing — the exclusion list, the status ordering, chunked(3), the studio
rate defaults.

Extract it once:

  create or replace function public.assert_board_access()
  returns void language plpgsql stable set search_path = public as $fn$
  begin
    if coalesce(public.current_app_role(), '') <> 'admin' then
      raise exception 'BOARD_ACCESS_NOT_ENABLED' using errcode = '42501';
    end if;
  end $fn$;

Then call it from board_for_session, card_detail, and the two new functions.

This modifies two functions that are currently verified, so re-verify BOTH afterwards
against a real JWT — admin returns rows, editor raises, anon unchanged. Do not assume
an extraction is behaviour-preserving because it looks like one.

card_detail currently raises CARD_ACCESS_NOT_ENABLED rather than BOARD_. If the
message is load-bearing anywhere in the app, keep the distinction by passing it in
rather than flattening it; if nothing reads it, say so and use one message. Check
before choosing.

## 6A.2 — Two new functions

  released_for_session()   status = 'released' and archived_at is null
  archived_for_session()   archived_at is not null

Both mirror board_for_session exactly: plpgsql, stable, SECURITY INVOKER, set
search_path, assert_board_access() first, explicit column list, execute granted to
authenticated only, anon and public absent from the ACL.

Lean column lists — enough for a list row. Tapping a row opens card_detail, exactly
as the board does. Do not widen either function to cover the detail screen.

Released needs at minimum: id, title, author, cover_url, released_at, amazon_rating,
amazon_review_count, audible_link.
Archived needs at minimum: id, title, author, cover_url, archived_at,
archived_reason, archived_notes, status.

---

## 6B — Released

Ordered by released_at descending — the newest first, which is the only ordering that
needs no explanation.

### 6B.1 — Amazon figures

All 12 have a rating and a review count. Render both. amazon_rating is numeric and
amazon_review_count is an integer; neither is nullable in practice today but both are
nullable in the schema, so a card missing one renders without it rather than with a
zero. Zero reviews and unknown reviews are different facts.

### 6B.2 — Read api/books/route.ts first

That route already returns released books on the web. Read it before designing, treat
it as the behavioural specification the way api/agenda/route.ts was for Stage 4, and
produce a divergence list with reasons. If it is empty, say so.

### 6B.3 — The count question. Stop here if it has no clean answer.

Stage 2's DoD 8 verified that Mark as Released "increments the Released count", and
that count went 12 → 13. But board_for_session() does not return released cards. So
something else already produces that number.

Find it. Then answer: does released_for_session() agree with it exactly, or does it
replace it? Two independent sources for "which books are released" is precisely how
the 9,300 incident happened, and W1 was five stages of consequence from the same
shape.

If the existing count comes from a different filter — a different status set, a
different archived predicate — say so and stop. That is a finding, not a detail.

---

## 6C — Archive, and un-archive

### 6C.1 — The screen's job is recovery, not browsing

One archived row exists. The empty state is the normal state and should read as
reassurance rather than as absence — nothing has been archived, not "no results".

Search over one row is not worth building. Do not build search. If Dean later
archives enough that scanning fails, that is when search earns its place.

### 6C.2 — Un-archive is a write, and the first this stage adds

archived_at, archived_reason and archived_notes are all in the column grant, so the
write is possible with no migration.

It must clear ALL THREE, not just the timestamp. Verified against the database on 26
August: zero rows anywhere carry an archived_reason or archived_notes with a null
archived_at, which means the web's restore clears all three and Android must match.
Leaving orphaned fields would make Android the first thing to break that invariant.

Full Stage 2 write discipline applies and is not negotiable: optimistic apply,
rollback on failure that restores the card's own prior values, refused state
distinguishable from success, zero rows treated as refused rather than as done. A
refused un-archive that looks like a successful one is Stage 2's bug 5 in a new
screen.

### 6C.3 — The restored card returns to its own status

Leather & Lies is archived with status 'recording'. Un-archiving returns it to the
board as a recording card. That is correct — the archive did not change its status
and neither does the restore. Do not "helpfully" adjust it.

---

## 6D — The recast card

One active card has status 'recast'. It is not archived, board_for_session does not
return it, and it is not released. It appears in no Android view whatsoever.

This is the 'recast'-status versus 'recasted'-archive-reason collision that Stage 3
flagged as a hazard, now with a consequence: the same idea is recorded two ways and
one of them is invisible.

Do NOT decide this yourself and do not build for it. Report:
  - what the web does with recast cards, and where they appear
  - whether a recast card is reachable anywhere on the web
  - whether making it reachable belongs in this stage, a later one, or nowhere

Dean decides. A card that exists in no view is a card he cannot find, and he should
know that before choosing.

---

## Definition of done

0. Token dunlin-1207-released-archive confirmed; one Stage 6 file, no stale copies.

**Migration**

1. assert_board_access() exists. board_for_session and card_detail both call it.
2. Re-verified after extraction, over REST with a real JWT: admin returns rows,
   editor raises with the SQLSTATE quoted, anon unchanged. BOTH functions.
3. released_for_session and archived_for_session: prosecdef = false, ACL quoted with
   anon and public absent, editor raises, admin returns the expected counts — 12 and 1
   today.

**Released**

4. 12 cards render, newest first. Quote the first and last titles with dates.
5. Divergence list against api/books/route.ts, with reasons. State explicitly if empty.
6. 6B.3 answered: where the existing Released count comes from, and whether the new
   function agrees with it exactly. Quote both counts.
7. A card with a null amazon_rating renders without a rating, not with a zero.
   Construct one, verify, restore, quote before and after.

**Archive**

8. One card renders. Empty state verified by constructing the empty case — unarchive
   the only row, look, restore it.
9. Un-archive clears archived_at, archived_reason AND archived_notes. Quote all three
   before and after, then re-archive to restore Leather & Lies exactly as found,
   including its reason.
10. Refused un-archive: demote to editor, attempt it, confirm it rolls back and
    reports refusal rather than appearing to succeed. Restore admin.
11. The restored card returns to the board under its own prior status.

**Report, do not build**

12. 6D — the recast card. Findings only.

**Hygiene**

13. No role == in ui/; no select("*"); all tests green including SwipeVersusPagerTest,
    AgendaTest and FailureVisibilityTest; 0 release warnings.
14. Every figure on both new screens is either rate-independent or gated per Stage 4B.
    Enumerate rather than assert — the compiler is the enumerator, as W1 proved.

---

## Work only Dean can do

- Demote to editor and restore, for DoD 2, 3 and 10.
- Approve the archive/un-archive cycle on his one real archived row, or do it himself.
  Leather & Lies must end exactly as found, reason included.
- Device confirmation.
- Decide 6D.

---

## Carried forward

- A grep finds occurrences; a type finds the extent of a dependency. W1's plan named
  one line in payments.ts and the rate threaded through twelve more functions.
- A claim that cannot fail was never checked. A comment is such a claim; a required
  parameter is not.
- Two states that render identically are one bug, however many screens they occupy.
- A state you reach only by constructing data is a state nobody looks at. Archive's
  populated state is now that state.
