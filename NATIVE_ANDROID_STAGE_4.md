<!-- STAGE4-TOKEN: kestrel-2207-first15-settings -->

# Native Android — Stage 4

Token: kestrel-2207-first15-settings

Dean set the whole remaining order, 27 August 2026:

  Stage 4  first15_due on the agenda, then Settings (read-only)
  Stage 5  W1 — the finished-hour wiring
  Stage 6  Released + Archive browse
  Stage 7  Payments / Expenses

Only Stage 4 is specified here. Cadence: build both parts, ONE report at the end.

---

## 4A — first15_due joins the agenda

Correction 3 made this cheap: an agenda item is a book plus a SET of reasons, so
first-15 is more reasons in the set, not more sections and not another chance to
render one book twice.

Two states to add — a first-15 that is overdue, and one falling inside the horizon:

  first15 overdue  ==  first15_due < today  AND  NOT first_15_complete
  first15 due soon ==  first15_due within DUE_SOON_DAYS  AND  NOT first_15_complete

first_15_complete is nullable; treat null as not complete, and say so in a comment.

### The priority constraint — this is the part to get right

AgendaReason declaration order is currently LATE, RECORDING_TODAY, DUE_SOON, and
priority comes from that order. Adding first-15 as two more entries forces a question
that ordering alone answers badly: a first-15 due in three days and a delivery due in
six should not be ranked by which CATEGORY they belong to.

The requirement, not the implementation: a card's grouping must never let a category
outrank a nearer date within the same tier. Late outranks upcoming, always. Within
"late", more-late first. Within "upcoming", sooner first, regardless of which kind of
deadline it is.

How to express that is yours — you have the type in front of you and I do not. If the
honest answer is that declaration-order priority no longer fits and it needs a tier
plus a date, say so and change it. Do not preserve a mechanism past the point where
it expresses the rule.

The invariant from correction 3 still holds and must stay green:

  cards rendered == distinct books on the agenda

A book that is late on delivery AND has an overdue first-15 is now possible, and it
is one card with two chips.

### The horizon

Use the SAME DUE_SOON_DAYS for both. Two horizons is two constants maintained by
memory, and this project has now replaced three of those with mechanisms that cannot
drift — the exclusion prefix, the status set, and chunked(3). Do not fork it.

Consequence, stated so nobody is surprised: nothing appears today. Four first-15s are
pending — Devils of Seattle 2026-09-11 (15d), Joy Ride 2026-09-30, Ruined 2026-09-30,
The Wolf King's Bride 2026-10-20 — and none is inside 7 days. Zero are overdue.

So EVERY first-15 state needs constructed data. Build them, verify, restore, quote
before and after. This is DoD 10's discipline applied to a feature that is entirely
invisible against live data rather than partly.

---

## 4B — Settings, read-only

site_settings carries exactly seven keys:

  accepting_projects              true
  available_months                [11, 12, 1, 2]
  studio_daily_capacity_hours     6
  studio_heavy_day_hours          4
  studio_max_books_per_day        2
  studio_words_per_finished_hour  9400
  studio_words_per_narration_hour 5000

Read-only is structural, not a UI choice: site_settings has a "Role read" policy and
no update policy at all. A write would return zero rows, not an error. Do not add a
write path and do not add one later without a migration that makes the refusal
visible.

### Three things in that data

available_months is [11, 12, 1, 2] — November through February, a contiguous window
that crosses the year. Sorting it numerically renders "January, February, November,
December", which turns one window into two and is wrong. Render it in seasonal order
starting from the run's beginning, or render it unsorted as stored. Whichever you
choose, a test with a wrapping window is required — this one wraps, so live data
covers it.

accepting_projects is a boolean and must not render as "true". It is a state about
whether Dean is taking work.

studio_words_per_narration_hour (5000) and studio_words_per_finished_hour (9400) are
one word apart and mean different things — one drives TIME estimates, the other drives
MONEY. The web's own comment in studio-settings.ts is the clearest explanation of the
difference anywhere in either codebase, and it exists because the divisor "was written
down twice and had already drifted once". Label them on the phone so they cannot be
confused at a glance, and carry that distinction across.

### The W1 hazard is displayed, not fixed

studio_words_per_finished_hour = 9400 agrees with five hardcoded 9400s in the web by
coincidence, not by wiring. Android reads the setting; the web does not. Changing that
value moves Android's earnings figures and leaves every invoice where it is, silently,
with no error.

Stage 4 does not fix that — Stage 5 does. Stage 4 puts the number where Dean will see
it. Do not add a warning banner or any other UI editorialising; the fix is scheduled
and a screen that scolds is worse than one that reports.

---

## Definition of done

0. This document carries token kestrel-2207-first15-settings.

**Agenda**

1. Both first-15 states constructed, rendered, restored. Before/after quoted for each.
2. A card that is late on delivery AND has an overdue first-15 renders as ONE card
   with both chips. Constructed, quoted, restored.
3. A first-15 due sooner than a delivery deadline groups ahead of it. Constructed.
   This is the case category-ordering gets wrong.
4. cards rendered == distinct books, still green, and still red under the mutation
   from correction 3.
5. With live data unchanged: zero first-15 reasons appear. Quote the count.
6. DUE_SOON_DAYS is one constant serving both. Quote it and its use sites.

**Settings**

7. All seven keys render. Quote the screen's values against a server-side read.
8. available_months renders as a contiguous Nov–Feb window, not Jan/Feb/Nov/Dec.
   Test with a wrapping window.
9. accepting_projects renders as a state, not "true".
10. The two words-per settings are distinguishable on screen. Say how.
11. No write path exists. grep for any update against site_settings; quote it.
12. Pull-to-refresh through ScrollableContent; the screen scrolls when empty.

**Hygiene**

13. No role == in ui/; no select("*").
14. All unit tests green including SwipeVersusPagerTest and AgendaTest; 0 release
    warnings.

---

## Work only Dean can do

- Construct and restore the first-15 rows, or approve you doing it and check the
  restore.
- Device confirmation of both.
- Every state in 4A is constructed data. If any restore is incomplete the board is
  wrong afterwards, so restores are quoted, not asserted.

---

## Carried forward

- Read the body, not the signature.
- Remove the constant rather than tuning it — chunked(3), the exclusion list, and the
  status ordering were all the same mistake.
- Describe the symptom, not the cause, when reporting a defect you have not read.
  My "Spacer or weight" guess was wrong and chunked(3) was found because you read the
  layout instead.
- A state you reach only by constructing data is a state nobody looks at. 4A is
  entirely that.
