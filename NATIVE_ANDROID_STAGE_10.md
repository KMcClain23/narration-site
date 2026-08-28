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

---

# Stage 10 continued — appended 28 August 2026

Token: wheatear-4201-pages-and-fields (confirmed against this file before starting)

10A is accepted and verified. Everything below builds on it. One report at the end.

## 10A-bis — the share bound, first and in its own commit

Answered from the data rather than from principle:

    narrator_share_percent   33 null · 0 zeros · one value (99) · none out of range
    royalty_split_percent    34 null · nothing set at all

Bound them: 1–100, NULL ALLOWED, ZERO REFUSED. Same trigger family, same sentence
style, route defers as before.

The asymmetry with word_count is deliberate and is written down so it does not read
as inconsistency. 0 stayed legal there because thirteen rows use it to mean "not
entered" and refusing it would have frozen them. Here nothing holds 0, and null
already means "not set" — allowing 0 would create a SECOND SPELLING OF ONE STATE,
which is how a screen ends up unable to say which one it is looking at.

Same principle both times: the bound goes around what the data holds, not around what
sounds tidy.

Done before 10B, since 10B is what makes those fields reachable.

## 10B — The card editor

Lives in card detail. That screen has been read-only since Stage 3 and it is the
natural home — "no read-only fields" starts there.

**Per-field editing, not a whole-form modal.** Tap a value, change it, save that one
field. A DELIBERATE DIVERGENCE from the web, which PUTs the entire form, and it goes
in the divergence list with its reason: a whole-form write makes "was this sent" and
"was this changed" indistinguishable, which is the trap the page rule already had to
work around with `is distinct from`. Per-field writes do not have that ambiguity, and
FieldWrite was built for them.

Scope: every scalar in the 28-column grant that CardEditModal exposes. Port its
labels, grouping and order — it made those decisions against real data.

word_count gets prominence. It is the field Dean named and the reason for the stage.

The three deferred shapes — tags, trigger_warnings, recording_dates (arrays) and
cover_url (upload) — must be VISIBLE AS DEFERRED, showing their values read-only with
something that says editing them is not here yet. Not silently absent. A field that
vanishes reads as data that does not exist.

amazon_rating and amazon_review_count stay excluded and read-only, cron-owned.

## 10C — Page progress

total_pages is editable on the card, like any other scalar.

current_page is settable from Today, on the recording-today card, where Dean will
actually be when he needs it.

The display rule, which resolves what looked like a conflict in Dean's answer:

    The PERCENTAGE is always shown, from words_recorded — the single store.
    The PAGE LINE ("page 143 of 320") appears additionally when total_pages is set.

He does not want a word-count progress figure and does not get one — no raw word
numbers per book. But he did ask for "the percentage of the book I have completed",
and the percentage is not a word count. Nothing disappears for books with no
total_pages, and the page line is context on top rather than a rival measure.

Hexes & Heartbreakers has no word_count, so pages give it a percentage and no word
contribution to 10D. Correct and honest.

Setting a page on a book with no total_pages asks for total_pages rather than
failing — that is the moment Dean has the book in front of him.

## 10D — The career total

Sum of words_recorded, not computeCareerTotals: different column, different
population, different unit.

THREE categories, and the third is the point:

    exact         released + editing carrying words_recorded — narrated in full
    estimated     recording, derived from page position
    not counted   books with no data, WITH THE BOOK COUNT NAMED

Today: roughly 420,194 exact across 9 books, 23,460 estimated across 1, and NINE
released books not counted — three quarters of the released catalogue.

That third line turns a silently-low number into something actionable. Nine word
counts entered and the figure becomes real. A total that omits them without saying so
looks answered, and looking answered is the failure this project has found five times.

Assert that the three categories account for every non-archived book. Mutation-test by
dropping one.

Placement: History, above Released — a record of completed work, on the screen for
that. If the layout argues for Today instead, say so; a "running total" glanced at
daily is a defensible reading.

## Definition of done — Stage 10 continued

1.  Share bound: 1–100, null accepted, 0 refused. Phone and route refuse identically.
    Quote both sentences and the existing 99 surviving untouched.
2.  word_count corrected from the phone end to end, reflected on the web. Quote both.
3.  Every granted scalar is editable; quote the list and confirm it matches the grant.
4.  The three deferred shapes render read-only with a stated reason.
5.  Setting current_page updates words_recorded; quote before/after.
6.  A whole-form web save carrying an unchanged words_recorded leaves current_page
    intact. Re-verify after 10B exists, since 10B adds a second writer.
7.  A book with total_pages shows the page line; one without shows the percentage
    alone and no empty page row.
8.  Setting a page with no total_pages asks for it rather than failing.
9.  The three career categories account for every non-archived board card. Quote the
    counts and the assertion, and confirm the mutation turns it red.
10. No role == in ui/; no select("*"); all tests green; 0 release warnings.
11. Every value touched restored and quoted, before and after.

## Work only Dean can do

Device confirmation on the physical phone. The Stage 1 claim currently covers a
Settings write only, and this stage adds card writes and page entry — the two things
he asked for. A short checklist, as last time.
