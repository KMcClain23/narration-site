# dmnarration.com — project roadmap

Last updated 25 August 2026 · Stage 0 verified.

Planning notes for the narration-site admin and its native Android client. Ordering is by
dependency, not by date — the project is worked on "here and there" and nothing is
deadline-bound.

---

## Done

| | |
|---|---|
| **Web admin, Stages 1–7** | Full rebuild. Board, Schedule, Contacts, Inquiries, Payments, Expenses, Released, Tools (Analytics, Contract Builder, Demos, Testimonials, Prepper), Settings. |
| **Mobile web redesign, Stages 1–3** | Bottom tab bar, More sheet, mobile board list, swipe-to-archive, long-press action menu, mobile card edit modal. Functional, but a responsive web app. |

The record of these stages exists **only as code comments** in
`D:\Developer\narration-site`. There are no planning documents. The comments are good —
they explain why, and name the bugs that forced each decision — but they are the whole
archive, and they should be treated as the specification whenever a behaviour needs
reproducing.

---

### Stage 0 — Supabase Auth, roles, RLS ✅
*Verified 25 August 2026.*

`public.profiles` carrying an application role, a `security definer` role lookup, an
auto-provisioning trigger on `auth.users`, and role-aware read policies on `board_cards`
and `site_settings`. Also revoked the default `INSERT/UPDATE/DELETE/TRUNCATE` grants that
`anon` and `authenticated` held on both tables — until then, only RLS stood between the
anon key and `delete from board_cards`.

Files: `supabase/stage-0-android-auth.sql`, `supabase/stage-0-verify.md`.
The web admin continues to use the service-role key and was unaffected.

**Two things this cost, worth remembering:**

*The admin user was created before the trigger existed*, so it got no profile row — and
every downstream symptom pointed somewhere other than the cause. Caused by an ordering
change between two revisions of the spec. Fixed structurally: PART A now raises an
exception if the trigger is missing, and PART C is an upsert with a backfill rather than
an update that can silently affect zero rows.

*Verification had to move off the SQL editor entirely.* It connects as a role that
bypasses RLS, so every check would have passed against a completely broken configuration.
The tests run against the REST API with a real JWT — the surface the app actually uses.
The same principle produced the trigger-fires test and the role-flip test, both of which
caught things inspection would not have. **Carry it forward: verify the mechanism fires,
never that it merely exists.**

---

## Native Android

Repo: `D:\Developer\dmn-admin-android` → **github.com/KMcClain23/dmn-admin-android**
(private). Separate from the web repo; both now have off-machine copies.

### Native Android Stage 1 — scaffolding, auth, Board ✅ COMPLETE
*Closed 25 August 2026. Reopened the same day for a fifth bug, closed again after the
elapsed-time test. **All 21 DoD items verified, nothing outstanding.** Item 1 confirmed on
the physical phone; the offline sign-out confirmed by hand.*

**Bug 5 — going offline on the board destroyed the session.** Found by Dean on the device,
not by the suite. Distinct from bug 3 (cold start, already fixed): this was a running app
losing connectivity. The cause was not the predicted observer misreading a status — there
was no continuous observer at all. `loadRole()` called `currentUserOrNull()`, got null
because the token had expired and the refresh had failed, and classified that as
`ProfileUnusableException` — the exception whose entire job is to sign people out.

Fixed structurally rather than by classification, and this is the rule that matters:

> **Credential destruction is reachable only from an explicit user action.**
> `clearSession()` has one caller, reachable only from the Sign out button. No automatic
> path — role loading, session restore, refresh failure — may destroy credentials; the
> worst any of them may do is refuse to show data. Bugs 3, 4 and 5 were all the same
> shape: an automatic path deciding to discard a credential. This makes that unreachable,
> so a future misclassification costs a wrong screen rather than a lost session. Enforced
> by `CredentialDestructionGuardTest`, which asserts the call-site counts. The guarantee
> covers *application* paths; the library still clears the session on a 4xx, which is
> correct — that is the server actually refusing.

**The trigger was a lifecycle event, not elapsed time.** Refresh fires on foregrounding and
process start, not on a foreground timer — seven idle foreground minutes attempted no
refresh at all. So the real story behind Dean's report is that a phone left alone locks
its screen, which backgrounds the app, and picking it up again triggers the refresh.
Waiting was necessary but not sufficient. Any future test of this kind must cross a
lifecycle boundary — background/foreground and process death — or it proves only that the
screen does not drift.

**Two lessons, both earned the hard way:**

*A DoD item phrased as an action cannot find a failure that needs elapsed time and a
lifecycle change.* Item 12 passed by enabling airplane mode and pulling to refresh — a
data fetch failing, synchronous with a tap. A tester acts; a user puts the phone down.

*A test you have never seen fail is not yet a test.* The guard test had two holes, both
found by deliberately adding a call site to make it go red: its filter swallowed a call
written on the same line as its wrapper (exactly the evasion it existed to catch), and it
read sources at runtime, which Gradle could not see as an input — so a change breaking the
guarantee left the task up to date and the guard silently did not run. Same principle as
Stage 0's role-flip test: **verify the mechanism fires, never that it merely exists** —
and that applies to the verification machinery itself.

Commits: `b521a58` scaffold/theme · `b3e6958` domain+tests · `735546a` auth/board/sheet ·
`c52b831` live verification · `220e2c1` timeout / keep-cards / offline sign-out ·
`dafaeb2` restore bound, spinner, sign-out · `75a7d9c` structural credential guard ·
`4f2ea93` elapsed-time test + guard-test hardening.
70 unit tests, 4 instrumented, 0 failures, 0 release warnings.

**The offline sign-out is now verified.** Airplane mode → Sign out → network back →
relaunch landed on the sign-in screen, so the local session really is cleared
unconditionally after a best-effort revoke. It had been recorded as untested rather than
assumed-passing on the strength of the guard test; the guard proves how many places can
call it, not that the call works. Both are now true.

Kotlin + Compose, Material 3, dark-only theme ported from the web tokens. Supabase Auth
sign-in with persisted session, role loaded into app state, capability-based rendering.
Board as a two-tab pager (Pipeline / In Production), read-only, plus a read-only card
detail sheet. No mutations.

Spec: `NATIVE_ANDROID_STAGE_1.md`.

**What the live permission test caught — keep doing this.** DoD item 19 (demote to
editor, pull to refresh without signing out) found a real bug that nothing else would
have: `PullToRefreshBox` hears the gesture through nested scroll, so it needs a
scrollable descendant, and the empty-board state was a plain `Box`. Pull-to-refresh was
therefore dead *on an empty board* — the exact state a revocation leaves you in, and the
exact moment you need to retry. The only escape was force-killing the app. Fixed with a
`LazyColumn` holding one full-height item.

**A third bug, caused by the spec itself.** Item 14 read "a profile fetch failure signs
out with an error" — which mandated exactly the wrong behaviour. Launching with no
network destroyed a valid session and demanded the password. "There is no row for you"
and "I could not reach the server to ask" are opposite situations: the first says
permissions are knowable and disqualifying, the second says nothing about permissions at
all. Now separate types. The rule, stated properly: **fail closed on access, not on
authentication** — deny the data, do not destroy the credential.

**A fourth, and it is bug 3's mirror image.** `signOut()` called only
`client.auth.signOut()`, which needs the network to revoke the refresh token — so when
that call failed, the local session *survived a sign-out the user had explicitly asked
for*. Server best-effort, device best-effort: exactly inverted. One bug destroyed a
credential it had no grounds to destroy; the other kept one it fully intended to discard.

They were live at the same time, and that is the only reason the session outlived the
investigation: bug 3 signed the session out offline, bug 4 quietly kept it alive. Had
either been fixed alone, the password would have been needed. Now: revoke best-effort,
clear locally unconditionally.

The general lesson, and it recurs: **a state you reach only by failing is a state nobody
looks at.** Empty, error and loading screens are where interaction quietly stops working,
because the happy path never exercises them. Every future stage that adds one should be
asked whether its gestures still work there.

Also settled here: a **successful** fetch replaces state (empty included), a **failed**
one keeps the cards and surfaces an error. Revocation needs no special handling — RLS
returns 200 with `[]`, not an error — and clearing cards on a failed refresh was never a
security control, since a revoked user could simply not pull.

### Native Android Stage 2 — writes
*Designed 25 August 2026, not started. Five decisions locked in
`NATIVE_ANDROID_STAGE_2_DESIGN.md`; spec not yet written.*

`UPDATE` policies gated on role, the First-15 toggle, status moves, swipe-to-archive,
the long-press action menu, optimistic updates with rollback.

The real design question is not the UI. It is **where the side effects currently owned by
the Next.js API routes live once two clients can write.** Read from source rather than
remembered, `PUT /api/board` does five things a direct Postgres write would skip:
`updated_at`, the `released_at` auto-stamp, Pacific-midday date anchoring, an Amazon
description/tags scrape, and a 30+ column allowlist.

**Correction:** earlier notes named `status_change_log` as one of these. It does not
exist — `migrations.sql:431` drops it, nothing in `src/` references it, and it is absent
from the live schema. It was asserted from a `create table` line without checking whether
anything still used it. Removed here so it is not carried forward again.

Design brief: `NATIVE_ANDROID_STAGE_2_DESIGN.md`. Recommendation is triggers plus
column-level `GRANT UPDATE`, with the Amazon scrape moved to the existing cron rather than
living on the write path. Three decisions are open for Dean.

### Native Android Stage 3+ — the rest of the app
*Depends on: Stage 2.*

Schedule, Contacts, Inquiries, Payments, Expenses, Released, Settings. Each needs its own
RLS grant added deliberately, one table at a time — Stage 0 deliberately scoped policies
to only what the Board reads, and that discipline is worth keeping.

---

## Deferred — decided against, for now

### Web Fix W1 — wire up `wordsPerFinishedHour`
*Deferred 25 August 2026. Do before ever changing the finished-hour setting again.*

Found during Android Stage 1 discovery: `studio_words_per_finished_hour` was written by
the Settings form and read by nothing that computes money. Five files hold their own copy
of 9,400 while Settings displayed 9,200 — the page showed a number the app did not use.

The setting exists specifically to end this drift (`studio-settings.ts` records that the
divisor "had already drifted once"; `ContractClient.tsx` records a file that billed at a
stale 9,300). One field's wiring was finished, the other's was not.

**Not fixed, because it would have moved every future invoice by ~2.2%** —
`payments.ts:735` derives billable hours from word count, so this is billing, not display.
Not a change worth making as a side effect of building an Android app.

**Done instead:** the stored setting was changed 9,200 → 9,400 to match the code.

**Residual risk — the reason this entry exists.** The value now agrees with the hardcodes
by coincidence, not by wiring. Change that setting again and Android follows it while the
web does not, silently, on money. The next person to tune it will not know that unless
they read this.

Spec: `WEB_FIX_W1_finished_hour.md`.

---

## Backlog — small, no dependencies

**EncryptedSharedPreferences is deprecated** (Jetpack Security 1.1.0) with no drop-in
replacement at the time of writing. Stage 1 kept it and suppressed the warning: a
deprecated encrypted store beats an undeprecated cleartext one, and it is isolated to a
single file holding the Supabase session. Revisit when a successor is established —
research the current replacement then rather than guessing at one now.

**`Capabilities.canUseWebAdmin`** — added in Stage 1 to gate the "Edit on web" link.
Its real referent is F2: until the web admin understands users, an editor cannot use it
at all, so this stays false for them even after F3 grants them the board.

---

## Future stages

### F1 — Migrate R2 covers from public URLs to signed URLs
*Blocks: editor onboarding. Not blocked by anything.*

All 34 cover images are served from a public R2 dev host (`pub-….r2.dev`) with no
authentication, **including titles flagged `is_confidential`**. The URL alone is enough
to fetch one.

This is not urgent today — the URLs are not published anywhere and only Dean uses the
admin. It becomes real the moment a second person has an account, because the
confidentiality guarantee the app will appear to make would not be backed by anything.
Nulling `cover_url` for confidential titles in the editor's view hides them from the
*app*; it does nothing about a URL that has already been seen.

Scope: move to a private bucket, generate short-lived signed URLs server-side, update the
web admin's image paths and the Android app's Coil configuration. Rotating the bucket
also invalidates any URL that has already leaked, which is most of the point.

**Do this before onboarding the editor**, not after.

### F2 — Migrate the web admin to Supabase Auth
*Depends on: Native Android at a stable point. Blocks: editor web access.*

The web admin authenticates with a single shared secret (`ADMIN_SECRET_KEY`) in a cookie
and reads everything through the service-role key, bypassing RLS. It has no concept of
users at all, so it cannot express "this person may see the board but not the money".

Until this is done, **Android is the editor's only possible surface.**

Scope: replace the cookie gate with Supabase Auth sessions, move server components and
API routes from the service-role client to a request-scoped user client, and let the RLS
policies written in Stage 0 do the work they were designed for. Large, and worth doing
only once the Android app has proven the role model in practice.

Deliberately sequenced after Android rather than before: the Android app is greenfield
and can be built correctly from the start, whereas this is a migration of twenty-odd
working pages. Better to learn the role model on the cheap surface.

### F3 — Onboard the editor
*Depends on: F1, Android Stage 2 or 3.*

Read-only visibility of project status, deadlines, and recording progress. Explicitly
**not** `pfh_rate`, `payment_type`, estimated earnings, studio settings, or any write
access.

Mechanism, designed in Stage 0 and sketched in `NATIVE_ANDROID_STAGE_1.md`:

1. Create the auth user; the trigger gives them `role = 'editor'` automatically
2. Create the `board_cards_editor` view — `security_invoker = true`, narrowed column set,
   `cover_url` nulled for confidential titles
3. Widen the `board_cards` policy from `in ('admin')` to `in ('admin', 'editor')` so the
   view can read through it
4. Flip `Capabilities.of(EDITOR)` in the Android app to its real values

If Stage 1 is built as specified, step 4 is the only Android change and **no UI code
should need touching at all**. That claim is worth testing on the day; the
`canViewFinancials = false` preview required in Stage 1's definition of done is what
makes it testable long before then.

Column-level `GRANT`s cannot do this job, for the record: Postgres column privileges
attach to *database* roles, and admin and editor are both `authenticated` — they are
distinguished only by a row in `profiles`. Hence the view.

**An unsolved problem, found during Stage 1 discovery.** Stage 0 denied the editor
`site_settings` wholesale, on the reasoning that studio numbers sit close enough to
financial detail to keep out of reach. That was too coarse, and the live values show why:

```
studio_words_per_narration_hour = 5000   (default 9200)   ← TIME, production
studio_words_per_finished_hour  = 9400                    ← MONEY
```

Recording speed is **not** financial. It is the divisor behind "4.2 hrs at the mic" and
"2.1 hrs/day" — the recording-progress figures the editor is specifically meant to see.
Denied the setting, their app falls back to the 9200 default against a real value of
5000, and every booth figure comes out roughly 46% too optimistic. Silently: no error,
no empty state, just wrong numbers that look plausible.

So the split is **per key, not per table**. When F3 lands, expose
`studio_words_per_narration_hour` (and probably `heavy_day_hours`, which is only a colour)
while keeping `studio_words_per_finished_hour` admin-only. A `security_invoker` view over
`site_settings` filtered by key is the same mechanism as `board_cards_editor` and costs
almost nothing.

Recorded now because it is invisible until someone is looking at wrong numbers and has no
reason to doubt them.

---

## Dependency graph

```
Stage 0 ──► Android S1 ──► Android S2 ──► Android S3+
                              │
                              └──────────────┐
                                             ▼
                                   F3 · onboard editor
                                             ▲
                          F1 · R2 signed URLs┘

F2 · web admin → Supabase Auth   (after Android is stable;
                                  required before editor web access)
```
