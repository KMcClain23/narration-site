<!-- STAGE9-TOKEN: linnet-9400-editable -->

# Native Android — Stage 9: Settings editing, then Money polish

Token: linnet-9400-editable

## The direction, from Dean, 27 August 2026

He does not want read-only or uneditable fields anywhere. The Android app becomes a
full admin client rather than a read-only companion. Settings is where he hit it, so
Settings goes first; the Money polish follows.

Cadence: 9A is a build with one report-before-building condition, stated in 9A.1.
9B is reconnaissance that stops for Dean.

## Two principles that outlive this stage

**The grant always names exactly what the app writes, and grows one screen at a
time.** board_cards currently grants six columns — the ceiling Stage 0 built so a
mistake in the RLS policy can only expose what the app actually uses. Widening it to
thirty in one go turns that ceiling into a formality and leaves RLS as the only line.
Widen per screen, as each becomes editable. The grant then doubles as an inventory of
the write surface. Do NOT pre-widen board_cards for an editor that does not exist yet.

**The write path is built once, as a mechanism.** Card fields are next, then money
records. Each editable field needs a grant, an input, validation, an optimistic
apply, a rollback to its own prior value, and a refusal distinguishable from success.
Thirty hand-built copies of that is thirty chances to get one wrong, and repeated
discipline is the thing this project has watched fail in every form it takes. Build
it once here — not over-built for cases that do not exist, but assuming the second
and third callers are real, because they are.

---

# 9A — Settings editing

## 9A.1 — The rule has to move into the database

Verified 27 August: site_settings is (key text, value text, updated_at timestamptz)
with NO check constraints, NO triggers, one policy — "Role read" — and no UPDATE
grants to anon or authenticated.

Every rule about a valid setting lives in api/studio-settings/route.ts. The moment
the phone writes to that table it bypasses all of it, and Android could store "abc"
where the web refuses it. Two write paths with one validated is the divisor written
down twice, and you know how that ended.

A BEFORE INSERT OR UPDATE trigger validates `value` against the key's rule and raises
THE SAME SENTENCE the app and the route already use. Android's wording:

  Stored value "500000" is outside 1000–30000 and is not being used.

Per-key and type-aware, because `value` is text and the seven keys are not one type:
five numbers with ranges, one boolean, and available_months — a JSON array that WRAPS
THE YEAR ([11,12,1,2]) and must never be sorted.

Then make the route DEFER to the trigger rather than keep its own copy. One rule, one
place, surfaced by both clients.

**Report before building if deferring cleanly is not possible.** A friendlier first
line in the route is defensible; a second independent rule is not.

## 9A.2 — The ceiling

  grant update (value) on public.site_settings to authenticated;

The `value` column only — `key` must never be writable from a client, because
renaming a setting from a phone is not a thing that should be possible.

Then a FOR UPDATE policy, admin-only, mirroring "Role read". FOR UPDATE, never FOR
ALL: even with the column grant closing the ceiling, FOR ALL states an intent this
stage does not have and the next person to widen a grant would find a policy already
agreeing with them.

## 9A.3 — The write path

Full Stage 2 discipline, unchanged and not negotiable: optimistic apply, rollback
restoring the field's own prior value, refusal distinguishable from success, zero
rows treated as refused rather than as done.

A settings write that silently does nothing is worse than one that fails, because
these values drive money figures on both clients.

## 9A.4 — What this does to Stage 7's display

Stage 7 built "Stored value X is outside the range and is not being used", and forced
that state with direct SQL. A trigger fires for every role, unlike RLS, so that path
closes and the display becomes unreachable by normal means.

Keep it, and label it deliberately unreachable the way you labelled the empty-actions
guard — it still covers values predating the trigger, or written with the trigger
disabled. Note in Stage 7's DoD that its forcing now needs `alter table … disable
trigger` and a re-enable afterwards.

An unreachable control nobody has labelled is the receipt indicator. One that is
labelled and reasoned is defence in depth.

## 9A.5 — Acceptance is cross-client

For each invalid input — out of range, unparseable, wrong type, a non-contiguous
available_months — the PHONE and the WEB ROUTE refuse with the SAME SENTENCE. Quote
both, character for character.

That is the 1,000–30,000 lesson: unifying where a rule lives does not unify how it
reads, and comparing the two strings is the only check that catches it.

Then one live check, which nothing has ever actually done: change
studio_words_per_finished_hour FROM THE PHONE, confirm the ~$ figures move on BOTH
clients, and change it back. W1 exists so that is safe.

---

# 9B — Money polish: propose, do not build

After 9A. "Polish" is Dean's eye, not mine, and I have seen one screenshot.

Read both tabs as they stand. Report what is cramped, inconsistent, missing or harder
to read than it needs to be, with screenshots and a proposal for each. Then stop.

Three I noticed, which may not be what he means:
  - royalty descriptions truncate mid-word ("…only a carrie…"), and those stored
    notes are long
  - the rows are dense — label, kind, date, method and note stacked with the amount
    right-aligned
  - I have never seen the Expenses tab at all

Do not rebuild anything on that list. Dean reacts to your proposal; then we build.

---

# Definition of done

0.  Token linnet-9400-editable confirmed; one Stage 9 file, no stale copies.

**Migration**

1.  The trigger exists and validates all seven keys. Quote its definition.
2.  `authenticated` holds UPDATE on `value` and nothing else on site_settings. Quote
    the full privilege list before and after.
3.  The policy is FOR UPDATE and admin-only. Quote it.
4.  A non-admin update returns zero rows and is rendered as refused, not as done.
    Use a throwaway user; do not demote Dean's account.
5.  The route defers to the trigger — or the reason it cannot, reported.

**Editing**

6.  Each of the seven settings is editable from the phone and the new value reads
    back from the database. Quote one before/after per type: number, boolean, array.
7.  Each invalid input is refused by the phone AND the route with an identical
    sentence. Quote both for each case.
8.  available_months survives a wrapping window unsorted. Quote what was stored.
9.  A refused write rolls the field back to its own prior value and says so.
10. studio_words_per_finished_hour changed from the phone moves the ~$ figures on
    both clients. Quote a figure from each, before and after, then restore and quote
    again.

**Mechanism**

11. Name the reusable pieces and what a second caller has to supply. If it is not
    reusable, say so rather than claiming it.

**Hygiene**

12. No role == in ui/; no select("*"); all tests green; 0 release warnings.
13. All seven keys confirmed at their original values by reading them back.

---

# Work only Dean can do

- Approve any setting changed for a test, and confirm the restore.
- Device confirmation — still emulator-only, and the physical-device claim from
  Stage 1 remains open.

---

# After this stage

Card fields, using 9A's mechanism, with the grant widened to exactly the fields the
editor exposes and no more. Then money records. Then Schedule / Contacts / Inquiries.

Not specified. How much of it is easy depends on what 9A's mechanism turns out to be.
