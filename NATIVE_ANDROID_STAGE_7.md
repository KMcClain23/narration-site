<!-- STAGE7-TOKEN: merlin-5000-settings-honesty -->

# Stage 7 — Settings honesty on the web

Token: merlin-5000-settings-honesty

Web repo only. No Android changes.

Cadence: ONE CHECKPOINT after 7A, then build the rest and report once. The checkpoint
is not about whether the code is right — it is about whether the refuse/absent/say-so
assignment is right for each surface, and that is a judgement I want to see before it
is built.

---

# 1. Why this stage exists, in your words

W1's residual risk was not removed. It was relocated.

  before: the value agrees with five hardcodes by coincidence, not by wiring
  after:  the value agrees with the fallback by coincidence, not by wiring

Only one default differs from live — narration 9,200 against a stored 5,000. Every
finished-hour default equals the stored value, so on a failed read the four surfaces
that break visibly are the harmless ones, and the five that show nothing include
settle-payment.ts, which settles money.

The trigger is the exact action W1 was meant to make safe. Change the finished-hour
setting, have a read fail, and the web bills at 9,400 while Settings says otherwise.
Android would render nothing. The web would render a confident wrong number.

---

# 2. The four layers, as you found them

  1  const { data } = await supabaseAdmin...   error never destructured
  2  settingsFromRows(data ?? [])              failed read → []
  3  { ...DEFAULT_STUDIO_SETTINGS }            missing key → default
  4  parseSetting → DEFAULT                    unreadable or out of range → default
  +  useStudioSettings                         .catch(() => {}) keeps defaults forever

All four exist because the type promises a value. Every layer is a place someone
honoured that promise with a lie.

---

# 3A — Make the fields nullable, and let the compiler enumerate

Do NOT make StudioSettings nullable as a container. Make each RATE FIELD nullable
individually.

Per-field, not per-object, for two reasons. It matches what Android's B established —
a bad finished-hour blanks money and leaves hours alone — and Stage 7 exists to stop
the two clients differing. And it makes the compiler enumerate per field rather than
per screen, which is the finer answer.

Add the nullability FIRST. Do not grep for consumers and then change the type. W1's
plan named one line in payments.ts and the rate threaded through twelve more
functions; a grep finds occurrences, a type finds the extent of a dependency.

DEFAULT_STUDIO_SETTINGS stays in the codebase but stops being a fallback in the load
path. It is legitimate only for a genuinely unconfigured install, which cannot occur
while all seven keys exist.

### CHECKPOINT — stop here and report

The classified consumer list: every site the compiler surfaced, and which of the three
rules in 7B you propose for it. Include the ones you think are obvious.

Report the list even if it matches your expectation exactly. Especially then — an
enumeration that confirms a prediction is the only kind that proves the prediction was
about the code rather than about the plan.

If any surface has no clean answer, say so rather than choosing.

---

# 3B — The three rules

One principle: A RATE THAT COULD NOT BE READ IS NOT A RATE. Then each surface does
what its situation allows.

**Refuse** — settle-payment.ts, invoice generation, anything that produces a figure
someone will be billed from. Throw. Do not compute. "We could not work this out" is
always better than a number nobody can audit, and a settle is retryable.

**Render the figure absent** — api/agenda, board cards, CardEditModal, analytics,
contract builder, lib/capacity.ts. The rate-dependent figure is absent; everything
else on the surface renders normally. This is Android's B, transplanted: gate the
figure, not the screen.

For api/agenda specifically, the payload carries the availability and the client
renders the gap. Failing the whole request would kill a sidebar that is mostly
rate-independent.

**Say the read failed** — the Settings page itself, as Android's Settings screen now
does. An out-of-range value shows what was stored and that it is not being used —
Android's wording is "Stored value "500000" is outside 1000–30000 and is not being
used." Match it.

---

# 3C — The client hook

useStudioSettings becomes three states: loading, loaded, failed. Not two.

Its comment says the numbers "settle a moment after load" — true on success, false on
failure, with nothing to tell them apart. That is the fifth false landmark this
session. Rewrite it to say what the code does.

One change that is visible in normal use, so flag it to Dean rather than burying it:
during LOADING, do not render default-derived figures. Show the figure as pending.

A money figure that appears as a 9,400-derived number and then changes is worse than
one that appears a moment later, and first paint is the only moment the defaults were
ever justified. If Dean would rather keep the instant-but-wrong first paint, that is
his call — say so and I will amend.

---

# 3D — Verification

Force each layer independently. Nothing here is a test-shaped assertion you cannot
run — this repo still has no test runner.

Layers 2–4 are forced with reversible SQL on site_settings:

  missing key      delete studio_words_per_narration_hour, observe, restore
  out of range     set it to 500000, observe, restore
  unparseable      set it to "abc", observe, restore

Restore by reading the value back, not by remembering to. Confirm all seven keys
afterwards.

Layer 1 — the whole read failing — needs a temporary local edit to the loader. Make
it, observe, revert it, and prove the revert with a clean git status. Do not commit
the broken form at any point.

### The cross-client check

Android already renders absent. So for the SAME broken setting, the phone and the
browser must now behave the SAME way.

  set studio_words_per_narration_hour = 500000
  → no hours figure on the phone
  → no hours figure in the browser
  → both money figures unaffected
  restore, both return

Two independent implementations agreeing is the strongest evidence available here,
and it is the method W1 proved.

### The money check — read this before doing it

DO NOT SETTLE A REAL PAYMENT TO TEST A REFUSAL.

Verify settle-payment's refusal at the function level: with the rate broken, confirm
the rate resolution throws BEFORE any write is attempted. Prove the ordering — that
the throw precedes the write — by reading the code path, not by observing that
nothing was written.

If the refusal cannot be demonstrated without performing a real settle, STOP AND
REPORT IT. Do not perform one. An unverified refusal on a money path is an acceptable
thing to report; a wrongly settled payment is not.

His For Christmas carries a live $367.02. Nothing in this stage touches it.

> **CORRECTED 27 August 2026:** not live. Invoiced 17 August, paid 20 August. The
> instruction was followed and nothing in Stage 7 touched it, so the outcome stands;
> the premise did not. See the CORRECTION at the end of PROJECT_ROADMAP.md.

---

# 4. Definition of done

0.  Token merlin-5000-settings-honesty confirmed; one Stage 7 file, no stale copies.
1.  Each rate field is individually nullable. Quote the type.
2.  The classified consumer list from the checkpoint, with the rule applied to each
    and any that changed after review.
3.  DEFAULT_STUDIO_SETTINGS appears nowhere in the load or parse path. Quote the grep.
4.  Missing key forced: quote what each surface class rendered. Restored, read back.
5.  Out of range forced: same. Restored, read back.
6.  Unparseable forced: same. Restored, read back.
7.  Whole read forced by temporary edit: same. Reverted, git status clean, quoted.
8.  Cross-client: phone and browser render the same absence for the same broken
    setting, and the same figures when restored. Quote both, at both points.
9.  Settle refusal verified at the function level, with the throw shown to precede any
    write — or reported as undemonstrable. No real settle performed either way.
10. useStudioSettings has three states. A failure is distinguishable from loading, and
    loading does not render default-derived figures.
11. The hook's comment says what the code does.
12. Settings shows a stored-but-unused value with the value quoted, matching Android's
    wording.
13. All seven keys confirmed at their original values by reading them back. Quote them.
14. npm run build succeeds; tsc --noEmit clean.

---

# 5. Work only Dean can do

- Nothing in this stage requires his account, since the forcing is done with SQL on
  site_settings rather than by demoting anyone.
- The instant-but-wrong first paint decision in 3C.
- Device confirmation of the cross-client check, since half of it is on the phone.
- Every git command, as always.

---

# 6. Carried forward

- A grep finds occurrences; a type finds the extent of a dependency.
- A claim that cannot fail was never checked.
- A DoD item that names something the system does not have will not fail — it gets
  satisfied by the nearest real thing, and the substitution hides the absence. Ask
  "which one, and where in the thing under test?" of every item above before starting.
- Two states that render identically are one bug, however many screens they occupy.
- Never round-trip the only instance of anything.
