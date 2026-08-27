<!-- STAGE5-TOKEN: osprey-9400-w1-wiring -->

# Stage 5 — W1: wire up wordsPerFinishedHour

Token: osprey-9400-w1-wiring

WEB_FIX_W1_finished_hour.md holds the work plan and it is still correct in structure:
W1.1 through W1.6, in that order, payments.ts last and in its own commit. Read it.

But it was written on 25 August against a different reality and it is stale in ways
that matter. This document is the delta.

── What changed since it was deferred ──

It was shelved because moving the divisor from 9,400 to the stored 9,200 would have
made every future invoice ~2.2% larger. The resolution taken instead was to change
the stored setting to 9,400.

Verified today: studio_words_per_finished_hour = 9400, studio_words_per_narration_hour
= 5000. The setting and the five hardcodes agree.

So W1 is now a pure refactor that moves NO number, and that makes its acceptance test
stronger, not weaker:

  the expected difference in every figure, before and after, is ZERO

Any difference at all is a defect. The original doc's "confirm the only change is the
expected ~2.2%" is obsolete — replace it with exact equality. A test for "no change"
is far easier to fail than a test for "changed by roughly the right amount".

Correct the doc's ⚠️ section and its verification steps 1–5, which say 9,200
throughout. Keep the deferral history and mark it resolved — do not delete the record
of why it waited.

── Android is now a reference implementation ──

This is new since the doc was written, and it is the best check available.

Android reads studio_words_per_finished_hour properly, gates on it, and as of B
renders nothing at all when it cannot be read. Two independent implementations of the
same arithmetic, one of them already correct.

  For the SAME book, the ~$ figure on the phone and in the browser must be identical
  — before the change, after the change, and after changing the setting.

Two implementations agreeing is real evidence. One implementation agreeing with
itself is not. If they disagree after W1, the web is wrong: Android's path was built
under a required-parameter rule and verified against forced failures last week.

── Make the compiler the enumerator ──

The doc already says estimatedEarnings gets a REQUIRED parameter, not an optional one
with a default, and quotes board-card-utils.ts:158 on why. That instruction is now
load-bearing for a second reason: it is how you find the call sites.

You proved this in B.1 — making the fields nullable surfaced every silent default as
a type error and caught heavyDayHours, which neither of us had named. Do the same
here. Add the required parameter FIRST and let the build tell you where the callers
are. Do not grep for them and then add the parameter.

The doc's instruction still stands and now has more force: if a call site has no
clean path to settings, STOP AND REPORT IT rather than defaulting. A default in
payments.ts is how the invoice silently disagrees with the board again.

── The false landmark ──

ContractClient.tsx:180 asserts "the real number has always been 9,400". It becomes
false the moment this lands. That is the third false landmark this session, after the
pager comment and narrationPlan's.

Rewrite it to say what the code does, not what someone believed when they wrote it.

── Verification, given there is no test runner in this repo ──

Everything must be executable. No test-shaped assertions you cannot run.

1. grep -rn "9400" src/ returns nothing except DEFAULT_STUDIO_SETTINGS in
   studio-settings.ts. Quote it. This is the doc's check 6 and it is still the real
   acceptance test for the hardcodes.
2. Cross-client: pick one book. Its ~$ figure on the phone equals its ~$ figure in
   the browser. Quote both, to the cent.
3. A regenerated invoice is byte-identical in every line item to its stored
   invoice_draft. Not "differs only by the rate" — IDENTICAL. Quote the comparison.
4. The doc's check 7, extended across both clients: change the setting to a
   distinctly different value (say 8,000), reload, confirm every surface moves
   together — board, CardEditModal, analytics, contract builder, invoice, AND the
   phone — then set it back to 9,400 and confirm everything returns.

   Check 7 is the one that matters. Everything else passes against a codebase where
   9,400 was simply hardcoded in five new places. Only 7 proves the wiring exists,
   and it now proves it across two clients.
5. Confirm the setting is back at 9,400 afterwards, by reading it, not by remembering
   to.

── Order ──

W1.1 through W1.5 first. payments.ts (W1.6) last and alone, as the doc says. Report
once at the end unless a call site has no clean path to settings, in which case stop
there.
