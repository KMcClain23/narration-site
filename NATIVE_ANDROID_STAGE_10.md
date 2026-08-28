<!-- STAGE10-TOKEN: wheatear-4201-pages-and-fields -->

# Native Android — Stage 10: card editing, page progress, career total

Token: wheatear-4201-pages-and-fields

CHECKPOINT after 10A. The migration is the irreversible part and I want to see it
before anything is built on it. Then one report for the rest.

## Corrections to the reconnaissance

A Cowboy's Runaway HAS word_count 92,000 — your table was right and the prose named
the wrong book. The recording card without one is Hexes & Heartbreakers (word_count
0, words_recorded 0).

Your coverage figure is worse than stated: NINE of twelve released books have neither
word_count nor words_recorded. A career total today covers a quarter of the released
catalogue, not most of it.

---

# 10A — Migration

## 10A.1 — Widen the grant to the SCALARS the editor will expose

Scope by what the mechanism covers, not by taste. FieldWrite handles one column, one
scalar, one outcome — so this stage ships every scalar field CardEditModal exposes,
and defers the two shapes it genuinely does not cover:

  DEFERRED: tags, trigger_warnings (list editors), cover_url (two-step signed upload).
  Say so on screen rather than omitting them silently.

  EXCLUDED, not deferred: amazon_rating, amazon_review_count. Cron-owned. Their
  validation is client-only on the web and a phone would bypass it entirely — the
  comment about 4.5 clamping to 5.0 writing "a wrong number that looks right and then
  ranks the book first" is the argument for leaving them alone, not for porting them.

Widen to exactly the scalars shipped, and no further. The grant is an inventory of
what the app writes.

## 10A.2 — word_count gets a bound, in the database

It has no validation anywhere — not client, not route, not database — and it feeds
hours, earnings, page-derived progress and the career total. Dean's stated use case is
correcting a wrong one; nothing currently stops the correction being wrong the other
way.

A trigger, raising a sentence in the 9A style, and the route defers to it. Propose the
bound rather than inventing one — I would rather see your reasoning about what a
plausible manuscript is than have you pick a number.

## 10A.3 — The date rule moves too

The Pacific-noon anchoring lives in /api/board's PUT. A date written from the phone
must land on the SAME INSTANT as one written from the web, or deadlines drift by a day
between clients and the drift is invisible.

Per 9A: it belongs in the database. Same trigger family.

## 10A.4 — Page columns, and one writer

Two new columns: total_pages, current_page. Both nullable — most books have neither.

Dean wants pages as the progress, but words_recorded must stay the stored truth:
narrationPlan, the agenda's hours, and the schedule all read it, and hours cannot come
from pages.

So the rule, enforced by trigger, not by convention:

  when current_page or total_pages changes
      words_recorded := round(word_count × share × current_page / total_pages)

  when words_recorded is written directly
      current_page := null

That second half is the important one. Editing the words directly means the page is no
longer known to be accurate, so it is CLEARED rather than left lying. Drift becomes
impossible instead of merely unlikely.

One writer of words_recorded, as you said. Make it the trigger.

Hexes & Heartbreakers has no word_count, so pages will give it a percentage and no
word contribution. That is correct and honest, and it is an argument for 10A.1 rather
than a defect.

### CHECKPOINT — report 10A before building 10B–10D

---

# 10B — The card editor

Scalars only, using FieldWrite. The web's modal is the specification for labels,
grouping and order — port, do not design.

word_count first in whatever the editing surface is. It is the field Dean named.

# 10C — Page progress

total_pages editable on the card. current_page settable from Today while recording.

Per-book display is "page 143 of 320" and the percentage. NO per-book word figure —
that is Dean's explicit answer.

A book with no total_pages shows no page progress and says so, rather than showing 0%.

# 10D — The career total

Sum of words_recorded. Not computeCareerTotals — that counts released only, uses
word_count, zeroes multicast, and answers "hours of released audio at the current
divisor". Different column, different population, different unit. Your call and I
agree with it.

THREE categories, not two:

  exact        released + editing with words_recorded   — narrated in full
  estimated    recording, from page position
  not counted  books with no data, WITH THE COUNT NAMED

Today that is roughly 420,194 exact, 23,460 estimated, and nine released books not
counted. A total that silently omits nine books looks answered, and looking answered
is the failure this project has now found five times.

Assert that the three categories account for every non-archived book. Mutation-test by
dropping one.

---

# Definition of done

0.  Token confirmed; one Stage 10 file, no stale copies.
1.  The grant lists exactly the scalars shipped. Quote it.
2.  word_count bound enforced in the database; phone and route refuse identically.
    Quote both sentences.
3.  A date set from the phone and the same date set from the web land on the same
    stored instant. Quote both.
4.  Setting current_page updates words_recorded by the trigger. Quote before/after.
5.  Writing words_recorded directly clears current_page. Quote before/after.
6.  word_count corrected from the phone — Dean's use case — end to end, reflected on
    the web. Quote both.
7.  A book with no total_pages shows no page progress and says why.
8.  The three career categories account for every non-archived book. Quote the
    counts and the assertion.
9.  Deferred shapes (tags, trigger_warnings, cover) are visible as deferred, not
    absent.
10. No role == in ui/; no select("*"); all tests green; 0 release warnings.
11. Every value touched restored, quoted before and after.

# Work only Dean can do

Device confirmation, and the physical-phone pass now covers a Settings write only —
this stage is the second thing worth doing on real hardware.
