# Web Fix W1 — wire up `wordsPerFinishedHour`

**Repo:** `D:\Developer\narration-site` (the Next.js web admin)
**Found:** during Native Android Stage 1 discovery, 25 August 2026
**Size:** small, except for one file that touches invoices
**Status: RESOLVED, 27 August 2026 (Stage 5). The deferral history below is kept
deliberately — it records why this waited, and the residual risk it names is the thing
that was finally closed.**

---

## Why this is deferred, and what was done instead

Fixing the wiring would have moved every future invoice by about +2.2%, because
`payments.ts:735` derives billable hours from word count. That was not a change worth
making as a side effect of building an Android app.

**Instead, the stored setting was changed from 9,200 to 9,400** to match what the code
already computes. Billing is unchanged, the Settings page no longer displays a number
nothing uses, and the Android app reads the setting as designed.

**The residual risk, which is the whole reason this document still exists:** the value
now agrees with the five hardcodes *by coincidence, not by wiring*. Changing the
finished-hour setting again will move Android's figures and leave the web's where they
are — silently, with no error, on money. The Settings field will once again be telling
the truth to one client and lying to the other.

So: do this work before ever tuning that number again. Everything below still applies —
the ⚠️ section is the reason it was deferred, not a reason not to do it.

---

## ⚠️ This section described a money change. It no longer applies.

**As written, this warned that the fix would move every invoice by about +2.2%,**
because the divisor would go from the hardcoded 9,400 to the stored 9,200. That was
true on 25 August. It is not true now.

The resolution taken instead was to change the stored setting to 9,400, so by the time
this work was done **the setting and the five hardcodes already agreed**. W1 therefore
moved no number at all.

That makes the acceptance test stronger rather than weaker: **the expected difference
in every figure, before and after, is ZERO.** Any difference is a defect. A test for
"no change" is far easier to fail than a test for "changed by roughly the right
amount".

Confirmed against a real stored `invoice_draft`: *His For Christmas*, 46,000 words at
$300/PFH, duet. The rewritten path reproduces the stored whole-project amount
`1468.0851063829787` to the last digit, hours `"4.9"`, partial `367.02`. At 9,200 it
would have been `1500.0`.

The two specifics below were the reason for caution and are recorded as resolved:

- **Invoices already sent were computed at 9,400** — and still are. Regenerating a
  draft produces the same total, verified above.
- **If any contract defines finished hours by an external standard**, the divisor is
  now a setting rather than a constant, so matching that standard is a Settings change
  rather than a deploy. Which was the point.

---

## What is wrong

`site_settings` held two tuned values **as found on 25 August 2026** (the finished-hour
value has since been changed to 9,400 — see the deferral note above):

```
studio_words_per_narration_hour = 5000    (default 9200)   TIME
studio_words_per_finished_hour  = 9200    (default 9400)   MONEY   ← now 9400
```

`wordsPerNarrationHour` is threaded correctly through six call sites.
**`wordsPerFinishedHour` is read by nothing except the Settings form that writes it.**
Five files hardcode 9,400:

| File | Line | What it feeds |
|---|---|---|
| `src/components/admin/board-card-utils.ts` | 49 | `estimatedEarnings()` — the board's `~$1,234` |
| `src/components/board/CardEditModal.tsx` | 165 | Finished-hours display in the Production tab |
| `src/app/tools/analytics/lib.ts` | 7 | Career "hours narrated" total |
| `src/app/tools/contract-builder/ContractClient.tsx` | 187 | Auto-filled `finishedHours` on contracts |
| `src/lib/payments.ts` | 735 | **`finishedHours()` — invoice line items** |

`estimatedEarnings()` takes no rate parameter at all, so no caller can override it even if
it wanted to.

## This has already bitten this codebase twice

Not a hypothetical. Two comments in the repo document the same failure:

`src/lib/studio-settings.ts` — the file that created these settings — says the divisor
*"was written down twice and had already drifted once."* That is why the setting exists.

`ContractClient.tsx:180` is more specific still: *"this file's own copy was still using a
stale 9,300 until this migration."* One file quietly billed at a different rate than the
rest of the app.

The setting was the fix. Its wiring was finished for one field and not the other, so the
same drift is live again — with the added twist that Settings now *displays* a number the
app does not use, which is worse than a plain hardcode. Anyone reading Settings would
reasonably conclude their earnings were computed at 9,200.

---

## The fix

### The pattern to follow is already in this repo

`narrationPlan()` takes `wordsPerHour` as a **required, non-optional** parameter, and
`board-card-utils.ts:158` explains why in detail:

> *"This was a trailing optional argument with a sensible-looking default, and three
> separate surfaces forgot to pass it… A missing rate is now a build error rather than a
> number that is quietly wrong by a factor of two."*

Apply that reasoning verbatim. **`estimatedEarnings` gets a required parameter, not an
optional one with a default.** An optional parameter here would recreate the exact bug
being fixed, and the compiler is the only thing that reliably catches a forgotten rate.

### W1.1 — A shared server-side loader

There is currently no server helper for studio settings: `api/agenda/route.ts` queries
`site_settings` and calls `settingsFromRows()` inline. This fix needs settings in three
more server contexts, so extract it first rather than duplicating the query a fourth
time — duplication is the original disease here.

Add to `src/lib/studio-settings.ts` (or a `-server` sibling if the import graph objects):

```ts
/** Studio settings for a server component or route handler. */
export async function getStudioSettings(): Promise<StudioSettings> {
  const { data } = await supabaseAdmin.from("site_settings").select("key, value");
  return settingsFromRows(data ?? []);
}
```

Then refactor `api/agenda/route.ts` to use it, so there is exactly one loader.

### W1.2 — `board-card-utils.ts`

- Delete `const WORDS_PER_FINISHED_HOUR = 9400` (line 49). The default already lives in
  `DEFAULT_STUDIO_SETTINGS.wordsPerFinishedHour`; a second copy is the bug.
- Add a required `wordsPerFinishedHour: number` parameter to `estimatedEarnings()`.
  Match `NarrationInput.wordsPerHour`'s comment style and explain why it is required.
- Keep the doc comment distinguishing the two rates — it is the clearest explanation of
  the difference anywhere in the codebase, and it is about to matter more.

### W1.3 — The two client callers *(trivial — both already have `studio` in scope)*

- `BoardCardContent.tsx:120` → pass `studio.wordsPerFinishedHour`
- `CardEditModal.tsx:897` → pass `studio.wordsPerFinishedHour`, and replace the local
  `WORDS_PER_HOUR` at line 165 (used at 891) with the same value. `studio` is already
  present in this component — it uses `studio.wordsPerNarrationHour` at line 922.

### W1.4 — `analytics/lib.ts`

Two changes: the local constant at line 7 (used at line 44 in `computeCareerTotals`), and
the `estimatedEarnings` call at line 102.

`lib.ts` is deliberately pure — keep it that way. Add `wordsPerFinishedHour` as a
parameter to both functions and pass it from the server page, which calls
`getStudioSettings()` from W1.1.

### W1.5 — `ContractClient.tsx`

Line 187's `wc / 9400`. This is a client component with no settings access; add
`useStudioSettings()` as `BoardCardContent` does, and add `studio.wordsPerFinishedHour`
to the `useEffect` dependency array so the field recomputes if settings change.

**Update the comment at line 180** while you are there. It currently asserts *"the real
number has always been 9,400"*, which will be false the moment this lands and is exactly
the kind of stale certainty that caused the 9,300 incident.

### W1.6 — `payments.ts` ⚠️ *the careful one*

Three sites: `finishedHours()` at 735, and `estimatedEarnings` calls at 301 and 318.

`finishedHours(wordCount)` gains a required `wordsPerFinishedHour` parameter, threaded
from its callers — which reach into invoice generation. Trace every caller to its entry
point rather than adding a default anywhere along the way. If a call site has no clean
path to settings, **stop and report it** rather than defaulting; a default in this file is
how the invoice silently disagrees with the board again.

Do this file last, in its own commit, and diff a regenerated invoice against a recent
real one to confirm the only change is the expected ~2.2%.

---

## Verification

*Steps 1–5 said 9,200 throughout and expected a ~2.2% movement. Corrected 27 August:
the setting is 9,400, the expected movement is zero, and exact equality replaces
"roughly the right amount".*

1. Settings shows 9,400; a board card's `~$…` figure matches
   `word_count / 9400 × pfh_rate × share`, hand-calculated
2. The same card in `CardEditModal`'s Production tab agrees with the board
3. Analytics "hours narrated" is **unchanged** and internally consistent
4. Contract builder auto-fills finished hours using the stored 9,400
5. A regenerated invoice is **byte-identical** to its stored `invoice_draft` — not
   "differs only by the rate", identical
6. **`grep -rn "9400" src/` returns nothing** except `DEFAULT_STUDIO_SETTINGS` in
   `studio-settings.ts`. That single grep is the real acceptance test.
7. Change the setting to a distinctly different value (say 8,000), reload, confirm every
   surface above moves together, then set it back to 9,400. The mechanism is not proven
   by the number being right once — only by it *following the setting*.

   **Extended 27 August across both clients.** Android is now a second, independent
   implementation of the same arithmetic, so the phone and the browser must agree on
   the same book — before, after, and at a changed setting. Two implementations
   agreeing is evidence; one agreeing with itself is not.

Check 7 is the one that matters. Everything else passes against a codebase where 9,400
was simply hardcoded in five new places.

---

## Sequencing

Independent of Android Stage 1 and can be done whenever. It only needs to be settled
**before Android §1.7**, where `estimatedEarnings` is ported — Android takes the stored
value as a required parameter either way, so if this lands first, the two agree from the
first build.
