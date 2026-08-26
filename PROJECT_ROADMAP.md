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
*In progress, 25–26 August 2026. Design brief rev. 3 + `NATIVE_ANDROID_STAGE_2.md`.*
**2A migration applied and verified 8/8. 2B deletions done. 2C not started.**

2A.4 results: `updated_at` advanced on a granted write (`04:13:14` → `04:16:17`) and was
**unchanged** on an amazon-only write, with a control write moving it — the trigger's
exclusion works. `released_at` stamps on transition and never overwrites. An ungranted
column returns `42501 permission denied`; an RLS-refused row returns **zero rows, no
error**; anon returns `42501`. The role test used one token across three readings —
1 as admin, 0 as editor, 1 as admin again — so the gate demonstrably moved rather than
never having been on.

Settled by that run: trigger assignments are **not** checked against column privileges.
`updated_at` is set by the trigger while `authenticated` holds no grant on it. No extra
grant needed.

**Two Stage 1 regressions surfaced during this work, both now fixed.**
`sourceFor(EDITOR)` pointed at `board_cards_editor`, a view that does not exist until F3 —
recorded in Stage 1 as "unreachable", when it is one `update profiles` away. It now raises
before touching the client and shows "Board access is not enabled for this account yet",
deliberately **not** falling back to `board_cards`, where RLS would return zero rows and an
editor would see an ordinary empty board. Separately, the error surface interpolated the
PostgREST exception message, putting the request URL, query string, `Authorization` and
`apikey` on screen; errors shown to a person are now a sentence, with the object logged.

**Stage 1's item 19 was a false pass, and the reason generalises.** It passed on a build
where a demoted app still held ADMIN in memory and queried `board_cards`. The continuous
session observer added for bug 5 changed that — a cold start now resolves EDITOR and takes
the editor path. The test never re-ran, so the change was invisible. **A test that passed
is only evidence about the build it ran against.**

**Commit `6c6b831` is mislabelled — read this before trusting the history.** Its message
says "delete the other five retry shims", but it also contains **the entire 2A migration**
— both triggers, the RLS update policy and the column grants — which had been sitting
uncommitted, plus the doc edits of that round. Nothing is lost and the committed migration
text is correct; only the attribution is wrong. Deliberately **not** amended: fixing a
commit message on `main` costs a force-push, and this repo had only just gained an
off-machine copy. History integrity beats history accuracy. Cause was `git add -A` without
reading the stage.

**The `GET` retry shim was worse than a widened column list.** The primary board query
already selected `*`, so nothing widened. What the fallback dropped was
`.is("archived_at", null)` — meaning any error whose message merely contained
`archived_at` would have made the board return archived cards among active ones, and the
Archive view return everything. **A read path that answers a different question when
something goes wrong is worse than one that fails, because nothing downstream can tell.**
Two guards in `expenses/route.ts` and `payments/invoice-draft/route.ts` were left
deliberately: they test a real SQLSTATE first and return a graceful "not migrated" answer
rather than mutating a payload and retrying. Same instinct, milder consequence.

**Bug 6 — the board showed "No active projects" to a demoted user.** Found by Dean
mis-tapping during DoD 12. Not a guard failure: `sourceFor` ran and answered correctly for
the role it was given. `BoardViewModel` caches `role` in a `private var` set once by
`start()`, and `refresh()` reads that cache — so after a demotion the app asked
"what may an admin read?" while the live answer was "you are not an admin." RLS evaluates
`current_app_role()` per request, returned zero rows with HTTP 200, and the success path
rendered an ordinary empty board.

**The guard could never have caught it.** It compares a cached client copy of a fact the
server owns and can change underneath it. Rejecting the `board_cards` fallback closed the
route where the app *knows* it is an editor; this is the route where it does not know yet.

**Three unit tests on the guard passed throughout.** They assert `loadBoard` raises before
touching the client. Nothing asserted what the screen does with that raise, or what
happens when the raise never occurs because the premise is stale. The unit was proven;
the join was not.

Fixed by moving the question to the server: an RPC that returns the board and raises for a
non-admin, so identity and consequence are answered atomically and no client cache sits in
the trust path. A cheaper-looking variant — a `security_invoker` view whose predicate calls
an asserting function — was rejected: if RLS filters rows to zero first the predicate never
evaluates, so it would be silently inert in exactly the case it exists for. An RPC body
runs unconditionally.

This does not contradict the design brief's rejection of RPC, which was scoped to *writes*
that are single-row updates needing no validation the schema cannot express. This is a read
whose correctness depends on a fact the client cannot trust its own copy of.

**A second, latent fault behind it:** `start()` returns early when `started`, so even a
re-resolved role would not trigger a reload — `capabilities` would stay stale and the app
would keep offering gestures the server would then refuse.

**And a near-false-pass worth its own line.** On DoD 14 a tap aimed at the First-15
checkbox landed on the card body and opened the detail sheet; the screenshots showed the
expected end state, and only the log — one write across two tests — revealed that the
second test never ran. **A correct rollback and a tap that never happened are pixel
identical.** Screens cannot distinguish "the code did the right thing" from "the code
never ran"; only an execution count can. The hit box measured 78.1 × 48.0 dp, at the
Material minimum — the sharp edge is that a near-miss inside a 379 × 176 dp clickable card
produces a confident wrong outcome rather than a no-op.

**A verification that destroys its own precondition.** `connectedAndroidTest` uninstalls
the app during teardown, taking the persisted session with it — and the write tests depend
on that session. It would have done this on any run, killed or not. Drive instrumentation
with `adb shell am instrument` after `installDebug installDebugAndroidTest`; `am instrument`
does not uninstall. The general shape is worth remembering because nobody checks for it:
**a check whose side effect consumes the thing it is checking** looks fine the first time
and is invisible until the second run, or the first interrupted one.

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

## Stage 2 — full DoD sweep, 26 August 2026

Run against a single frozen build: `dmn-admin-android` **59015e3**, `narration-site`
**f6bf3b0**, both trees clean, the emulator confirmed running that APK (no source file
newer than the installed binary). Nothing was fixed mid-sweep, so every item below ran
against the same commit and no item needed re-running.

**No inherited passes.** Every item was executed again, including the ones that passed at
2C.2 and the ones whose failure paths were verified separately from their success paths.
A test that passed is evidence about the build it ran against, and that build no longer
existed.

### Result: 17 of 17 pass, 0 fail, 0 could-not-run

**Migration (1–5).** All eight 2A.4 checks re-run live inside a probe that raises at the
end so the whole thing rolls back — nothing persisted, confirmed afterwards against the
row. The two `updated_at` values, side by side on the same starting row:

| write | before | after | |
|---|---|---|---|
| real change (`first_15_complete`) | `2026-08-18 22:03:30.499+00` | `2026-08-26 17:21:37.128787+00` | advanced |
| `amazon_rating` only | `2026-08-18 22:03:30.499+00` | `2026-08-18 22:03:30.499+00` | unchanged |

`released_at` stamped `17:22:06.010329` on the transition in, and unchanged when the
transition repeated. Ungranted column refused with `permission denied`. Demoted update
affected **0 rows and raised nothing** — the zero-rows contract the client depends on.
Anon saw **0 rows**. Greps: no `updated_at` assignment in `PUT /api/board` (one comment
only), no `released_at` auto-stamp (the column is still writable when the client sends
one explicitly, which is the web's edit form and is intended), `fetchAmazonBook` 0 exact
occurrences with both survivors present, `error.message?.includes` 0.

*Probe correction worth keeping:* the first attempt ran the amazon-only check as
`authenticated` and aborted with `permission denied` — because `amazon_rating` is not in
the column grant. That was the probe being wrong, not the system: those columns are only
ever written by the cron's service role. Each check now runs under the identity that
actually performs it.

**Android happy path (6–10).** First-15 toggled, survived a pull-to-refresh, matched the
row. Status move: Pipeline 9→8, In Production 11→12, card under the RECORDING header,
server `recording`. Mark as Released: left the board, Released **12→13**, `released_at`
stamped `17:27:26.148679` by the trigger. Swipe-to-archive: removed, `archived_reason`
`recasted`, row still returned by the Archive view's filter. Board read 9+11=20 after a
full cycle out and back on a new pid, matching the server's 20 active rows.

*Two items verified server-side rather than through the web UI:* DoD 8's "increments the
Released count" was checked as a `count(*)` (12→13) and DoD 9's "findable again via
search" as the archived-row query the Archive view runs. The data conditions hold; the
web pages themselves were not opened.

**Android failure paths (11–14)** — where five of the six bugs lived. Offline toggle: 1
write attempted (counted in the log, since a correct rollback and a tap that never
happened are pixel-identical), banner shown, cards intact, no sign-in screen, session
file byte-identical at 3762 bytes with an unchanged mtime. Revoked mid-session: refused,
rolled back, refusal screen, session file byte-identical, server row untouched; admin
restored, recovered by pull, write landed again. Lifecycle: mutation survived
background→foreground→pull and matched the row. Rollback correctness: the already-complete
card rolled back to **complete** while the incomplete one rolled back to incomplete — each
restoring its own prior value rather than a shared default.

**Hygiene (15–17).** 122 unit tests, 0 failures. No `role ==` in `ui/`, no `select("*")`.
0 Kotlin compiler warnings on the release build. A runtime test now walks every patch any
gesture produces and fails if `released_at` or `updated_at` appears in one, which is
stronger than the grep it replaces.

**Not in this sweep.** Stage 1 item 14's offline sign-out half stays recorded as
**untested**. The credential-destruction guard proves how many places can call
`clearSession()`, not that the call behaves correctly when the network is down. Those are
different claims and the guard must not be allowed to launder one into the other.

### Deferred, deliberately, so they are not rediscovered cold

1. **`HorizontalPager` drag arbitration.** The card's swipe-to-archive detector sits
   inside a pager that also claims horizontal drags. It works, and it is probably correct
   by Compose's dispatch order — a descendant sees the Main pass before its ancestor and a
   consumed change never reaches the pager's scrollable. But nothing in the source says
   so and nothing fails if it stops being true, which is the shape of every bug this
   project has already found. Fix: consume the change explicitly where the swipe commits,
   plus an instrumented test asserting **both** halves — a swipe on a card fires the
   archive path AND leaves the pager's page unchanged; a drag on the surrounding surface
   changes the page AND fires no card action. Half two is not optional: a fix that
   consumes every horizontal drag in the subtree kills paging and passes half one
   perfectly.
2. **Structural nested-scroll guard.** `state.isEmpty -> Unit` left `PullToRefreshBox`
   with no nested-scroll participant, stranding a refused session with no way back short
   of restarting the app. That is DoD 19's bug from Stage 1, reintroduced by a different
   route, in the same state, despite being documented. **Any branch that renders nothing
   kills the gesture**, and the property is invisible when lost. Wanted: a wrapper that
   cannot be constructed without a scrollable child. Vigilance already failed once.
3. **Archive dialog's `OutlinedTextField`.** Stock Material, does not match the app's
   design language. Cosmetic, one dialog, correct as it stands.
