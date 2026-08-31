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

## W2 — the ratings cron was moving `updated_at` after all

Found in production data after the sweep. **The DoD item was scoped wrong, and that
scoping is why the sweep missed it:** DoD 2 read "no `updated_at` assignment in
`PUT /api/board`". The repo-wide grep the fix demanded was never part of the item. This
is the second time a route-scoped grep has hidden something — the first cost five of
eleven retry shims, which lived in `GET` and `POST`.

**Evidence.** `Heir of the Emberscale` carried `amazon_rating_updated_at`
`04:02:44.989+00` and `updated_at` `04:02:45.076+00` — 87ms apart, which reads as two
writes but is actually one: the first is a JavaScript timestamp computed before the round
trip, the second is `now()` inside Postgres when the statement ran.

**The diagnosis was not the expected one.** The hypothesis was that a caller assigns
`updated_at` by hand. It does not. The repo-wide grep returns 29 hits and **not one of
them is a `board_cards` write**: every hand-assignment belongs to `editors`, `expenses`,
`payments`, `payment_payouts` or `site_settings`, tables with no such trigger.
`settle-payment.ts` was the one real shared-helper candidate — it touches `board_cards`
and assigns `updated_at` in the same file — but its two `board_cards` uses are selects and
the assignment sits on the `payments` write. Nothing needed removing from a helper, and
nothing needed removing from the cron.

**The actual cause was the trigger's exclusion list:**

```
ignored := ['updated_at', 'amazon_rating', 'amazon_review_count', 'amazon_rating_updated_at']
```

`amazon_rating_attempted_at` — the fifth amazon column, added later for the cron's
rotation — was never added to it. Both cron writes carry that column, including
`stampAttempt`, which on a blocked fetch is the *entire* write. So in production the
column the exclusion existed to protect was being moved by the one job it existed to
exclude, on every run, for every book. The comment above the list claimed it was "small
and stable"; it was neither, and the comment is now a record of how the bug happened.

**Probes.** Dean's three, then the isolating fourth, all rollback-only:

| | write | before | after | |
|---|---|---|---|---|
| A | `amazon_review_count` + `amazon_rating_updated_at`, no explicit `updated_at` | `04:02:45.076032` | `04:02:45.076032` | not moved |
| B | same plus `updated_at = now()` | `04:02:45.076032` | `18:01:31.604791` | moved |
| C | `amazon_review_count` + `first_15_complete` together | `04:02:45.076032` | `18:02:02.845432` | moved (correct) |
| D | **`amazon_rating_attempted_at` alone — what `stampAttempt` writes** | `04:02:45.076032` | `18:12:49.036461` | **moved — the bug** |

A is check 3 done non-vacuously: `amazon_review_count` genuinely incremented, so the jsonb
comparison had something to bite on. The original 2A.4 check could have passed against an
empty exclusion array. C covers the mixed write. B moved because the *caller* assigned it
and `updated_at` is itself in the ignored list, so the trigger never overwrote the value —
which is why B looked like caller-assignment in production and pointed at the wrong
mechanism. A omitted `amazon_rating_attempted_at`, the column at fault: the same shape of
scoping miss as the grep.

*One probe is recorded as inconclusive rather than counted.* Re-running the full cron
success write immediately after D inside the same transaction reported "not moved", but
`now()` in Postgres is transaction-start time, so it was assigned the identical value it
already held. It proves nothing either way and is not evidence of the fix.

**Fix: match by prefix, not by list.** `updated_at` or `amazon\_%`, computed over the
row's actual keys, so a sixth amazon column cannot reintroduce this. A list of names
cannot be kept in step with a schema by remembering to. Non-amazon columns still count as
a human edit by default, which is the safe direction to fail in.

**Verified by firing the mechanism, not by the grep.** After the fix, the same row and the
same baseline `04:02:45.076032`: `amazon_rating_attempted_at` alone → **not moved**; full
cron success write → **not moved**; control human edit to `notes` on another row →
**moved**, correctly.

Then the real route, run against the live database with the production `CRON_SECRET`:

```
{"refreshed":0,"failed":1,"considered":1}
[amazon-rating] soft-block (interstitial detected)
[amazon-rating-refresh] book="No One to Hold Me" status=failed:blocked
```

| `No One to Hold Me` | before | after |
|---|---|---|
| `amazon_rating_attempted_at` | `null` | `2026-08-26 18:16:08.142+00` |
| `updated_at` | `2026-08-25 18:38:30.973+00` | `2026-08-25 18:38:30.973+00` |

The attempt stamp advanced; `updated_at` did not move. **Caveat kept deliberately:** Amazon
soft-blocked the fetch, so this exercised the `stampAttempt` path — which is the write that
caused W2 and the only one that runs in production today — but *not* the success path where
`amazon_rating_updated_at` advances. That half remains covered by probe only.

### DoD 2–5, actual numbers rather than "17 of 17"

| item | measure | result |
|---|---|---|
| 2 | `updated_at:` assignments in `src/app/api/board/route.ts` | **0** (1 mention, a comment) |
| 3 | `released_at` mentions in that file / auto-stamp assignments | **5 / 0** — allowlist, `DATE_FIELDS`, explicit-value handling, comment; no implicit stamp |
| 4 | `fetchAmazonBook` exact identifier repo-wide | **0** (`fetchAmazonBookResult` 3 sites, `fetchAmazonRating` 3 sites, both required) |
| 5 | `error.message?.includes` in `api/board/route.ts` / repo-wide | **0 / 0** |

Item 5's zero is the literal DoD string. The two deliberately-kept guards in
`expenses/route.ts` and `payments/invoice-draft/route.ts` are still present and still test
a real SQLSTATE first (`42P01`, `42703`, `PGRST204`), using `error?.message?.includes` only
as a secondary clause — the zero does not mean they were swept away.

### DoD 9 — closed by observation

Dean archived from the app, found the card in the web Archive view, and restored it from
there. Confirmed clean: zero rows anywhere in the table carry `archived_reason` or
`archived_notes` with a null `archived_at`. The un-archive clears all three, not just the
timestamp.

### Recorded, not a defect — `released_at` on a card that went back to editing

`How an Angel Dies: Wrath` — `status = editing`, `released_at = 2026-07-16 17:52+00`.
Pre-existing from July, unrelated to the sweep. It is a live instance of the state check
5's idempotence guard creates: released, moved back to editing, stamp kept. If it is ever
genuinely released again the trigger will decline to re-stamp and it will silently carry
the July date. That is a question about what `released_at` means — first release, or most
recent — not a defect. Dean's call.

### W2 follow-ons

**The prefix moved the memory dependency; it did not remove it.** The list failed because
it needed someone to remember to add. The prefix fails if someone names a *human-editable*
column `amazon_something` — `amazon_asin` and `amazon_url` are both plausible on a book
record — and then editing it silently stops counting as activity. The trigger was left
alone, having just been fixed and verified; the drift is made loud instead.

`npm run check-updated-at-exclusions` asserts:

> the columns the trigger excludes == the columns the ratings cron writes, plus `updated_at`

Neither side is hardcoded. The exclusion side comes from `board_cards_exclusion_audit()`,
which extracts the predicate from `pg_get_functiondef` of the trigger **that is actually
installed** and applies it over `information_schema.columns`; the cron side is parsed out
of the cron's own source, scoped to `.update(...)` arguments. A hardcoded expectation would
be W2 wearing a test's clothes.

*The originally proposed assertion — excluded == not-granted-to-`authenticated`, plus
`updated_at` — was checked and does not hold: 5 excluded against 37 not-granted. The grant
list constrains only the Android client. The web writes as `service_role` and bypasses
column privileges entirely, so `title`, `notes` and `word_count` are all human-editable
yet ungranted. "Not granted to authenticated" is not a proxy for "no human can write it"
until F2. The grant check survives as the third arm below, which is the part that does
hold.*

Mutation-tested in all three directions, each producing its own message:

| mutation | result |
|---|---|
| cron stops writing `amazon_rating_attempted_at` | red — "the trigger excludes … which the cron does not write" |
| cron starts writing `notes` (the W2 shape) | red — "the cron writes notes, which the trigger does NOT exclude. This is W2." |
| `grant update (amazon_rating) … to authenticated` | red — "excluded as machine-written but IS granted UPDATE to authenticated" |

All three restored; the grant list is back to exactly its original six. **Caveat:** this
repo has no test runner, so it is a script nothing runs automatically — a check you
invoke, not a guard that stands watch.

**DoD item 5 was a check that could not fail.** Corrected in the Stage 2 spec. In a grep
pattern `.` is a wildcard, so `error.message?.includes` means "error" + any one character +
"message?" + any one character + "includes". The code writes `error?.message?.includes` —
two characters — which the pattern cannot match. It returned 0 while the two guards it
exists to count sat in the tree, and would return 0 against eleven new shims tomorrow if
they used optional chaining, which is how everyone writes it now. It passed the full sweep
on that basis. Now `grep -rEn "message\??\.includes" src/` returning **exactly 2**, with
both enumerated by file and line, because a count of zero invites the code to hide below
the pattern and a named inventory does not.

**The two kept guards now carry removal conditions,** next to the guards themselves:
delete each once its table/column exists in every environment that reads it, after which a
missing relation is a real fault and should look like one. The original eleven accumulated
precisely for want of that line — each reasonable when written, none with an expiry.

**The success path stays probe-only.** `stampAttempt` is the write that caused W2 and the
only one running today, so the live verification covers the case that matters, but the
path where `amazon_rating_updated_at` advances alongside a rating change is covered by
probe alone. It closes itself on the next successful fetch; after one, run:

```sql
select title, amazon_rating, amazon_rating_updated_at, updated_at,
       updated_at < amazon_rating_updated_at as clean
from public.board_cards
where amazon_rating_updated_at > amazon_rating_attempted_at - interval '1 minute'
order by amazon_rating_updated_at desc limit 5;
```

`clean = true` on a row whose rating genuinely moved is the missing half. Until then this
says probe-only, in those words.

### Recorded, not scheduled — the audit's own blind spots

**A. Both arms of `check-updated-at-exclusions` parse, and neither has been
mutation-tested on its own parsing.** The three mutations that were run changed what the
parsers *read* — a column added, a column removed, a grant appearing — and establish that
the comparison works. None changed the *form* of what is parsed.

The exclusion arm extracts a predicate from `pg_get_functiondef` and re-implements it.
Rewrite that predicate to something semantically identical but syntactically different —
the loop as a `case`, `k = any(array[...])`, a second condition — and the extractor meets
a shape it has never seen. The question is not whether it still gets the right answer; it
is what it does when it cannot tell. **A parser that skips what it does not understand
converts an unknown into a pass.**

Same risk on the cron arm, one step further out. It is scoped to `.update(...)`, which is
right, but a cron that someday writes via `.upsert()`, an RPC, or raw SQL presents a write
the parser does not collect. The cron's column set silently shrinks, the assertion stays
green, and the new column is unexcluded — W2 again, with the guard watching.

The construction that closes both: enumerate every candidate — every mutating call in the
cron source, every branch of the trigger predicate — and fail loudly on any one the parser
cannot decompose. *"Unrecognised write form at line N"* is a useful red. Silence is not.

The audit is verification machinery now, and this project's rule about verification
machinery applies to it: two of Stage 1's guard-test holes were found by deliberately
making the guard fail.

**B. Invoked, not standing watch.** No test runner is being added for this alone. When
there is next a reason to touch the build, the cheap version is making the check part of
whatever already runs on the way to production, so it is not something anyone has to
remember.

**And the principle the first run earned:** *a check that is red for unreal reasons trains
people to ignore it.* A guard with a false-positive history is worse than no guard,
because it produces confident dismissal. The loose-scan version of this check reported
five columns the cron only ever reads; catching that before it shipped is the reason the
check can be trusted now.

## Stage 2 polish — closed

**1. Pager arbitration.** `SwipeVersusPagerTest` asserts both halves: a swipe on a card
archives without paging, and a drag on bare pager surface pages without archiving. The
mutation result was the finding — deleting the explicit `change.consume()` left **both
halves green**, so that line was never load-bearing. `detectHorizontalDragGestures`
consumes the slop crossing itself and descendant-before-ancestor dispatch does the rest.
The line stays as insurance and is now labelled as insurance rather than as the mechanism,
because a comment claiming to be load-bearing when it is not is a false landmark. Removing
the card's swipe handling turns half one red (so it is not vacuous); consuming one level up
turns both red, half two reporting "the pager must have paged".

**2. Structural nested-scroll guard — and this one IS load-bearing.** `ScrollableContent`
has a private constructor, and every factory builds the scrolling container itself; the
caller supplies only what goes inside it. There is deliberately no factory taking an
arbitrary composable — that would be a promise rather than a proof, and a promise is what
existed when `state.isEmpty -> Unit` stranded a refused session on a screen with no way
back short of restarting the app. `blank()` is the only way to say "nothing", and it
scrolls.

Both illegal constructions were written and neither compiles:

```
PullToRefreshSurface(isRefreshing = false, onRefresh = {}) { }
  e: No value passed for parameter 'content'.

ScrollableContent { Box(Modifier) {} }
  e: Cannot access 'constructor(...)': it is private in 'ScrollableContent'.
```

`ShimmerList` and `EmptyBoard` became factories. Both already scrolled — by the author
remembering to, which is exactly the dependency the type removes. Confirmed on the device
that the blank refused state still recovers by pull, that being the state the original bug
lived in.

*Note on the two guards together: the pager guard turned out to be a regression test for
framework behaviour rather than a fix, and the nested-scroll guard turned out to be a real
compile-time constraint. Both outcomes were worth having, and knowing which is which is
the point of writing the illegal construction rather than assuming.*

**3. `DmnTextField`** — card radius, raised surface, amber focus ring, Manrope. Stock
`OutlinedTextField` brings a purple focus ring and a foreign typeface and reads as a
control borrowed from another app. The sign-in screen still uses the stock control and
could adopt this; that is Stage 1 and was left alone.

**Stage 2 is closed.** Its DoD was met at the sweep; these were polish and nothing was
added to them.

## Stage 3 corrections — the progress denominator, and a backfill that corrupted eight books

**The denominator was wrong, and the spec is where it got in.** `recordedFraction`
divided by `word_count` while `narrationPlan` divides by `wordCount × narratorShare`,
so one screen showed A Cowboy's Runaway at **20%** on its progress bar and **40%** by
its remaining hours. The hours were right and they settle the semantics:
`narrationPlan` subtracts `words_recorded` from SHARE words, so `words_recorded` means
the words *this narrator* recorded. That is running code and it predates this work.
DoD 13 in the Stage 3 spec said "words_recorded / word_count", and it was implemented
faithfully.

Fixed to take the share from `narratorShareOf` — **the same function `narrationPlan`
uses**, not a second derivation. `narrator_share_percent` is populated on 1 card in
33, so the inference from `narration_format` is the real mechanism and duplicating it
is how two percentages of one book came to sit on one screen. Multicast resolves to
null and now renders **nothing**, because an equal split is a guess and a confident
wrong number is worse than a blank.

Asserted directly: for any card, `recordedFraction` must equal
`narrationPlan(...).fractionDone`. Mutation-tested by passing `word_count` where share
words belong, which turns that assertion and two others red.

**The backfill.** This statement ran on production:

```sql
update board_cards set words_recorded = word_count
 where status in ('editing','released') and words_recorded = 0 and word_count > 0
```

It touched 9 rows: 6 duet, 1 dual, 1 multicast, 1 solo. Only the solo was correct.
Eight books claimed a full-manuscript recording of books shared with another narrator.
The statement was written without consulting `narration_format` at all.

Reversed on the seven whose share resolves, using the same source as above:

| book | format | share | before | after |
|---|---|---|---|---|
| Unmasked Hearts | duet | 0.5 | 62,777 | 31,389 |
| All the Ways I'd Kill for You | duet | 0.5 | 184,221 | 92,111 |
| Whiskey & Lies | duet | 0.5 | 97,000 | 48,500 |
| Beating For You | duet | 0.5 | 70,983 | 35,492 |
| With a Broken Wing | duet | 0.5 | 120,000 | 60,000 |
| Where My Demons Hide | duet | 0.5 | 117,538 | 58,769 |
| Swing and a Kiss | dual | 0.5 | 103,241 | 51,621 |

**Stopped on one row, deliberately: `How an Angel Dies: Wrath`** (multicast,
110,079/110,079, no explicit `narrator_share_percent`). Multicast has no default split,
so any figure written there would be invented. It is left visibly at a full-manuscript
figure and renders no percentage in the app. **Dean's to decide.**

`The Final Guardian` (solo) was correct and untouched. None of the four
`narration_format is null` rows were touched by the backfill, so that hazard did not
materialise — but the reversal excluded them by rule regardless.

**The lesson, and it is not the arithmetic.** A statement was handed over described as
"Dean's to run knowingly" while giving him nothing to know. Ownership of a decision is
not transferred by labelling it — it is transferred by supplying what the decision
turns on. Here that was one column, `narration_format`, which nobody looked at.

---

## Stages 4 to 7 — the record, 27 August 2026

Written after the fact, in one pass, because the four stages ran with a "one report at
the end" cadence and the reports lived only in the session. Shorter than the entries
above by intent: what is here is what a later reader needs, not a transcript.

### Stage 4 — first15_due on the agenda, read-only Settings

Both shipped. Settings is read-only by the **schema's** decision, not by convention:
`site_settings` has a `Role read` policy and **no update policy of any kind**, so a
write returns zero rows rather than an error. Adding a write path later needs a
migration that makes the refusal visible first.

### The getOrNull inventory

Dean asked for the inventory before any fixing — "report it even where the answer is
'this one is fine, and here is why'" — after a previous count of six turned out to be
eleven. Seven sites, fixed in two groups: three small and independent, then a design
change to `StudioSettings` making every field nullable with a `SettingIssue` per key.
That design change is what web Stage 7 later transplanted.

### Stage 5 (W1) — wordsPerFinishedHour wired through the web

A pure refactor whose acceptance test was that **every figure moved by exactly zero**.
The stored setting had already been changed 9,200 → 9,400 to match the five hardcodes,
so W1 moved no number and any difference at all would have been a defect.

`estimatedEarnings` took a **required** parameter, not an optional one with a default,
and the compiler enumerated the call sites: the plan named one line in `payments.ts`
and the rate threaded through twelve more functions.

Two false landmarks removed: `ContractClient.tsx:180` asserting "the real number has
always been 9,400", and `board-card-utils.ts`'s `narrationPlan` fallback.

### Stage 6 — Released and Archive

Two screens, two RPCs, and one guard extracted.

`assert_board_access(p_marker text default 'BOARD_ACCESS_NOT_ENABLED')` replaced four
copies of the same admin check. The marker is a **parameter** because it is
load-bearing: `BoardRepository.kt` matches `CARD_ACCESS_NOT_ENABLED` to tell an
unreadable card from an unreadable board. `raise exception using message = p_marker`
rather than the bare form, which reads its argument as a format string.

**6B.3 stopped the stage, correctly.** The web answers "how many are released" two
ways — `/api/board-v2/released-count` filters on status alone (a career total, by its
own comment); `/api/released` also excludes archived. They agree today **only because
no released book has ever been archived**. Resolution: Android derives both numbers
from one query with the predicate applied at the point of use; the web keeps both
routes and its count is now labelled *all-time* so the divergence reads as intentional.

Two defects found on the device, not in review:
- **`archived_notes`**: Android wrote the raw string, so an empty note stored `''`
  while the web's `ArchiveConfirmDialog` wrote `null` for the same action. Now matched.
- **Shelf staleness**: a card archived from the board was missing from the board AND
  absent from the Archive until a manual pull — it existed in no visible place. A
  landed board write now marks the shelf stale; the cost is paid on arrival.

**DoD 8 could not be done as written** and was not quietly substituted: its method
(un-archive the only archived row) is what the amended DoD 9 forbids. Covered by unit
test instead. **DoD 9's cycle ran on a constructed card**; Leather & Lies was never
written and still carries its original `updated_at`.

Role verification used a **throwaway user**, created and deleted, rather than demoting
Dean's account — the same rule as the constructed card, one layer up.

### Stage 7 — settings honesty on the web

W1's residual risk was **relocated, not removed**: the value agreed with the fallback
by coincidence instead of with five hardcodes by coincidence. Four of the five defaults
equalled the stored values, so a failed read was invisible precisely where it mattered.

Each rate field is individually nullable. Four rules:

  refuse   settle-payment throws before its only write (one mutation in the file, at
           line 210; the refusal is at 190). buildInvoice throws in its own right.
           UI money actions are disabled WITH THE REASON BESIDE THEM — a throw in a
           component is a white screen, not a refusal, and a silently disabled Invoice
           button reads as "already invoiced".
  absent   agenda, board cards, CardEditModal, analytics, contract builder, capacity
           calendar. Partial sums go null rather than omitting their input silently.
  say so   Settings shows the stored value beside the reason it is not being used.
  reject   the writer refuses a bad value with the issue's own description. The only
           preventive rule of the four: it stops the value existing.

`projectState` gained an `unknown` state so an unreadable rate cannot wear "in
production" or "not tracked".

**The hook was invisible to the enumeration.** Widening a type finds CONSUMERS of a
value and never PRODUCERS of one, and `DEFAULT_STUDIO_SETTINGS` was assignable to the
widened type. Changing the hook's own return type to `loading | loaded | failed`
enumerated 26 further sites and removed the shape entirely.

Verified by forcing all four layers against the live database — missing key, out of
range, unparseable, whole read failing — and observing through the real loader with
`npm run check-settings-honesty`. All seven keys read back at their originals.

**The smallest divergence found:** one stage after the rate was unified across both
clients, they still printed different sentences about the same rejected setting —
Android `outside 1000–30000`, the web `outside 1,000–30,000`, from a stray
`toLocaleString()`, in a sentence both had been told to share.

### Two claims that are NOT verified

1. **Stage 1 item 14, offline sign-out.** Deliberately untested, reason recorded, an
   upgrade on the guard test's strength refused twice. Correct as it stands.
2. **Every device confirmation to date has been on the Pixel 8 emulator, API 35.**
   Physical-phone confirmation is Dean's and remains outstanding. Not a defect — but
   emulator results must not read as device results.

### Next — Stage 8, Payments and Expenses, unspecified

One carried constraint: the card query **excludes archived and INCLUDES recast**, or
His For Christmas disappears and takes a live **$367.02** invoice with it. That is the
whole reason `recast` exists as a status distinct from the `recasted` archive reason —
the contract ends, but the partial project fee still has to be billed.

---

## CORRECTION, 27 August 2026 — "His For Christmas carries a live $367.02"

**The claim was wrong, and it survived four documents because each reader trusted the
last.** Recorded here rather than edited away, because the numbers changing quietly is
how it propagated in the first place.

**What was claimed** (Stage 6's 6D report, this roadmap, the memory index, and the
Stage 8 spec): His For Christmas is a recast card carrying a live, unraised $367.02
invoice, and dropping `recast` from a card query would lose the money.

**What is true**, read from the row on 27 August:

    invoiced_on      2026-08-17
    amount_expected  367.02
    amount_received  367.02      method: Card
    received_on      2026-08-20

It was paid on 20 August — six days before Stage 6 ran. `projectState()` returns
**`paid`**, not `ready`: the `recast -> ready` branch only fires when nothing has been
invoiced and nothing received. Repo-wide, **zero** payment rows have
`amount_received < amount_expected`.

**How it happened, both halves.** Stage 6 read `amount_expected` and reported "$367.02
expected" without reading `amount_received` in the same row — a true fact whose
implication was false. Then a later check that *named* `amount_received`, ran, and
returned 367.02 was read as confirming the claim rather than contradicting it, because
the claim had already been written down.

**The rule that came out of it:** A CHECK PERFORMED TO CONFIRM IS NOT A CHECK. Its
value comes entirely from being willing to have it come back the other way.

**What still stands.** The 8B.3 constraint — a card query must exclude archived and
INCLUDE recast — remains correct, for a weaker reason than the one given. `cardExpected()`
returns null for recast by design, so a recast card's figure cannot be reconstructed
from the rate; it exists only as stored payment rows. Dropping recast loses that
*history*. Nothing is at risk of going unbilled.

---

## Stage 8 and after — the record, 27 August 2026

Findings and reasons. Written after the fact for the same cause as the last backfill:
a one-report cadence leaves the reports in the session and nothing in the repo.

### Stage 8 — Payments and Expenses, READ-ONLY

**The first step was a revoke, not a policy.** `payments` and `expenses` had RLS on
with one service_role policy each, so nothing was exposed — and both granted **anon
AND authenticated** all seven privileges including DELETE and TRUNCATE, inherited from
the default schema grants and never narrowed. `board_cards` got its ceiling in Stage 0;
these never did. Adding a read policy first would have opened a window where a
wide-open ceiling and a live policy were both true, and a `for all` policy — the
shortcut everyone reaches for — would have made deletion of financial records
reachable from a session token.

Order: revoke alone (`bfaff79`), then policies and functions (`e1b3287`). anon was
revoked entirely rather than reduced to SELECT: `board_cards` grants both roles SELECT
because some of it is public, and none of this is.

**`payment_payouts` was the same, and was found by tracing what "owed" depends on**
(`8577efa`). 8 rows, 7 unpaid, both roles holding TRUNCATE. **Nothing granted back** —
a table nothing reads should end at a hard deny rather than at SELECT-just-in-case.
Its pre-check was run independently rather than inferred from the payments result, and
surfaced a seventh file (`contacts/editors/page.tsx`) the first sweep had missed.

**The owed computation was measured, then declined.** 16 functions, 683 lines, across
**three** tables — the migration exposes one of them. The deciding argument was not
the size: **nothing is outstanding today**, so a correct port and a broken one would
render the same $0.00 on every project and *no data exists that would tell them apart*.
The screen answers "what have I been paid" and says in a sentence that it does not
compute what is owed — an absence legible as a decision rather than as a gap.

**DoD 11 was withdrawn mid-stage.** `receipt_url` is an empty string on all 21 rows, so
a "receipt exists" indicator was a control that could never fire. `has_receipt` was
dropped from `expenses_for_session()` too, not just from the UI: a function should not
return a field about a thing that does not exist.

**Capabilities finally gated something.** `canSeeMoney` hides two whole destinations
rather than a field — absent, not disabled and not empty. Kept separate from
`canViewFinancials` on purpose: same answer for every role today, but merging them
would mean a future role allowed to see a rate on a card silently gained the ledger.

### The bottom nav rebuild (`45f4ce4`)

Three defects, one of them structural.

**The grey capsule floating above "Board" was the selection indicator with an empty
icon slot.** `NavigationBarItem` draws the indicator BEHIND the icon; an empty icon
slot left it with nothing in it. Every destination now has an icon and it reads as a
selection.

**Seven destinations left no width**, so "Released" broke as "Release / d" and
"Settings" as "Setting / s" — words split mid-character. Material's guidance is three
to five. Four now: Today, Board, History, Money.

**The grouping was already in the code.** `ShelfViewModel` loads Released and Archive
together; `MoneyViewModel` loads Payments and Expenses together; both pairs already
fail independently. The nav had simply been more granular than the model behind it.
Inside each destination, the Board's own tab row — extracted rather than copied.

**"Shelf" was rejected.** A released book is on a shelf; an abandoned one is not, so
half the contents would have been misdescribed by the group label. **"History"** is
true of both — work that shipped and work that stopped. The tabs inside say which is
which, so the group name only has to be a true superset.

**Settings became its own button, then moved.** Built as a floating button as asked;
the emulator showed it sitting on a payment row with the amount behind it — the figure
half-covered by the gear. Bottom padding does not fix that: padding clears the END of
the list while the overlap happens mid-scroll. It sits beside the bar instead. Still
not a destination, still no label.

**The fix was made a property rather than a fact about today's labels.**
`NavigationBarFitTest` renders the bar at 320dp — the narrowest width Android phones
ship at — and asserts `lineCount == 1` and no visual overflow for every label.
`maxLines` is deliberately UNSET on the bar so a label cannot pass by being truncated.
Its second case feeds the exact seven labels this replaced and asserts at least one
still wraps, so the check cannot quietly become vacuous. Mutation-run before landing:
restoring the seven gave `"Released" wraps at 320.0.dp expected:<1> but was:<2>`.

**A process note worth keeping.** The first UI dump read five tabs and several steps
went into chasing a capability bug that did not exist. Instrumenting showed
`entries=7 canSeeMoney=true` and a node-level dump showed all seven present. The
five-tab reading was never reproduced and no logic changed between the two — recorded
as a bad observation rather than as a fix.

### The /payments outage (`264715b`)

Production `TypeError: Cannot read properties of undefined (reading 'push')`, whole
page down. **Two changes composed and neither alone would have done it.**

Stage 8 added `unknown` to `ProjectState`. The compiler forced every exhaustive Record
open — `OPEN_BY_DEFAULT`, `GROUP_ACCENT`, `GROUP_HINT` — because a `Record` must name
every member. `GROUP_ORDER`, an ARRAY of that union, has no such obligation: it stayed
at five while the union had six, and typechecked perfectly.

Stage 7 made `useStudioSettings` start in `loading` rather than returning defaults on
first render. So on first paint the rate is null, `projectState()` answers `"unknown"`
for EVERY project, and the grouping `useMemo` pushed into a Map with no such key.
**The non-null assertion is what let it compile.**

**This is the FOURTH enumeration blind spot**, alongside the three from Stage 7: a
union widening propagates into exhaustive Records and silently *not* into arrays of the
union. The fix makes the array checkable — `as const satisfies readonly ProjectState[]`
plus an `Exclude<>` guard that fails to compile naming the missing member — and seeds
the Map from the exhaustive label Record rather than from the display-order array.
Loading was also separated from unreadable: "Cannot be worked out — settings
unreadable" against every project for the first few hundred milliseconds would have
been alarming and false.

**Reproduced before fixing**: the shipped version returned HTTP 500 with the exact
reported error; the fix returned 200. It was failing in SSR too, not only in the
browser. `npm run check-first-render` (`3a88ab1`) now fetches eight rate-reading routes
— an SSR fetch IS the loading pass, because `useEffect` does not run server-side — and
is mutation-tested against the pre-fix file.

### Swipe-to-archive removed (`51b17be`), card kebab added (`e30e082`)

The swipe took horizontal drags away from the pager, so paging between Pipeline and In
Production only worked from the gaps between cards. That behaviour was pinned in a test
twice and **nobody ever asked whether it was the behaviour we wanted.**

**It was a removal, not a build.** Long-press had opened an action sheet since Stage 2,
and that sheet already offered Archive — dispatching to the same state and the same
confirmation dialog the swipe used. The swipe was a second, hidden route to a menu item
already present. Nothing was added; the sheet's contents, ordering, dialog and Stage 2
write discipline are untouched.

Dead code went with it rather than outliving the gesture as apparent tuning:
`SwipeToArchive`'s thresholds, `ArchiveAffordance`, and 12 threshold tests.
`ArchiveAffordance` was never a hint — it drew DURING the drag, so only someone already
performing the gesture ever saw it.

`SwipeVersusPagerTest` was **inverted, not deleted**, and keeps its name: the question
"who owns a horizontal drag" is unchanged and only the answer flipped. Its header says
why the name outlived the gesture. Half one now asserts a drag starting ON A CARD
reaches the pager and fires no card action.

The kebab (`e30e082`) is a second ENTRY POINT to the same handler, not a second code
path — bottom-end, diagonally opposite the confidential lock and 108dp clear of the
First-15 checkbox, gated on `canEdit`. Its empty-actions guard is unreachable today and
is recorded as such rather than left looking load-bearing.

### The Money reconciliation (`2b594be`)

The screen showed `$6,844.98 across 24 payments` over `2026 $6,716.08` and
`2025 $8.90` — years summing to $6,724.98. Eight rows, a third of the table, carry an
`amount_received` with `received_on` null, so $120.00 sat in the total and in neither
year. **Every individual figure was correct against the database.**

Fixed by making the invariant structural: `receivedBreakdown()` returns the buckets AND
a total that is the sum of them, so a forgotten bucket cannot leave the total unchanged
— it moves the total, which is visible. `totalReceived()` and
`receivedInYear()`/`yearsWithPayments()` as independent functions were the shape that
allowed it. Undated money gets its own labelled line rather than the total being
narrowed to what is dated: dropping those rows would understate what Dean has been paid
and hide eight payments.

**The family, and this is the fourth instance:** `weekHours` as a blocks-only total,
the all-zero earnings chart, `totalFree` summing only known days, and this. The pattern
is always **the parts and the whole computed by separate code paths, fixed by deriving
one from the other rather than checking them against each other afterwards.**

### A DoD item that was the wrong SHAPE for its defect

Stage 8's DoD said *"quote the screen's values against a server-side read"*. That is a
**per-figure** check, and a per-figure check cannot detect that figures do not relate to
each other. Every number on the Money screen passed it. The reconciliation defect
survived a verification that looked thorough because the item was the wrong shape for
the class of defect it stood in front of.

This is a sibling of the rule about DoD items naming things the system does not have:
there the noun was missing; here the *relation* was. Ask of a DoD item not only "which
one, and where in the thing under test" but "what would this fail to notice".

### The board's date buckets — checked, unchanged

`THIS MONTH` means "within 30 days", not "within the calendar month", which is why a
Sep 24 deadline is in it on 27 August and Sep 30 is not. **Android did not invent
this.** The web's `board-filters.ts` and Android's `BoardFilters.kt` are identical —
no deadline goes to Later, `days <= 7` This Week, `days <= 30` This Month, else Later,
with the same three labels. Dean's established language, left alone.

### The two claims that are still NOT verified

1. **Stage 1 item 14, offline sign-out.** Unchanged. Deliberately untested with the
   reason recorded, an upgrade on the guard test's strength refused twice.
2. **Physical-device pass.** Every check this session ran on the Pixel 8 emulator via
   `adb` against `emulator-5554`; Dean's phone was never connected to this machine.
   Whether the screenshots Dean took were the phone or the emulator is his to say, and
   is deliberately NOT inferred from the images looking like a device. Until he says
   otherwise this stays open.

---

## Stage 9A — Settings editing, 28 August 2026

### The rule moved into the database, and the premise needed correcting first

The plan said every rule about a valid setting lived in `api/studio-settings/route.ts`.
It did — and that was never the only writer. **`/api/site-settings` accepts any key
with any value and validates nothing.** It is admin-only, it is how `available_months`
and `accepting_projects` are written, and it could store `"abc"` in
`studio_words_per_finished_hour` from a browser. There were already two web write
paths and one was validated. The trigger closed a live hole rather than pre-empting a
phone.

**The lesson, and it is Dean's: LOCATING A RULE TELLS YOU NOTHING ABOUT WHO BYPASSES
IT.** "Where is the validation" and "who else writes to this table" are different
questions, and only the first was asked.

The shape: `check_site_setting(key, value)` holds the rule as a plain function — split
out from the trigger so it can be exercised from a `SELECT` without writing a row, and
so a route could call it directly if a friendlier first line were ever wanted, without
a second copy. `validate_site_setting()` is the trigger, reduced to calling the rule
and stamping `updated_at` (which `authenticated` has no grant for, so a phone write
would otherwise keep the previous writer's timestamp).

It raises **the sentence the clients already display**, with SQLSTATE `22023` so
PostgREST answers 400 by itself and callers can tell a rule from a transport failure.
Clients show what the database said rather than composing their own wording — that is
what makes "the phone and the web say the same thing" a property instead of two people
keeping two strings in step.

Three mechanisms, three questions: `grant update (value)` is the ceiling (`key` is
never writable — renaming a setting from a phone would orphan every reader), the
`Role write` FOR UPDATE policy is the role check, the trigger is the rule.

### The Android write path is a mechanism, not a screen

`FieldWrite` carries the four outcomes — Saving, Saved, Refused, Failed — with Refused
a case rather than an error because zero rows arrives wearing HTTP 200.
`serverRefusalMessage()` digs the database's sentence back out of the PostgREST body.
Nothing in the client validates a setting, deliberately: a client that checked the
range itself would be the second copy of a rule just moved into one place.

### WITHDRAWN: the non-contiguous months rule

The DoD asked for a non-contiguous `available_months` to be refused. **Not built, and
it should not be.** The web's `BookingWindowPicker` is a free toggle grid over twelve
rolling months, so a gap is two clicks away; `formatBookingWindow` sorts and collapses
any selection to a range without ever erroring; Android lists the months instead. Empty
is legitimate too — both clients render "None". A rule against gaps would break a
picker that ships today. Dean's own note: a validation rule was specified without
checking whether the shipped UI could produce the state it outlawed.

### CORRECTED: `[11,12,1,2]` is click order

An earlier comment claimed the stored order deliberately expressed a window crossing
the year. **That was invented.** The picker appends each month as it is tapped and
never sorts. Preserving the order is still right — it is data the user produced, and
reordering it would rewrite what they entered — and sorting would still render one
window as two. But the effect was real while the account of the cause was not.
Corrected in `SiteSettings.kt` and `SettingsScreen.kt`.

### The emulator save was an environment artifact

Nine attempts on the emulator could not get a tap on Save to reach the handler;
instrumenting proved `save()` was never called. A long stretch went into cycling
hypotheses on the device — keyboard occlusion, scrolling, overlay hit-testing — which
is the same failure as the five-tab reading in the nav rebuild.

**This time the contradicting observation exists.** Dean installed the APK on his
physical phone, changed "a full day at the mic" from 6 to 5, saw it reflect on the
site, and set it back. `studio_daily_capacity_hours` reads `6` with `updated_at`
`2026-08-28 17:58:43`, so both writes passed the trigger and the value is restored.
The code was never wrong. Closed as an environment artifact; do not reinvestigate.

Two things survive it:

- **`imePadding()` at the app root** stays, on its own merits. `adjustResize` was
  declared but only `SignInScreen` had it, and Settings is the first screen outside
  sign-in with a text input. Every editable screen after this needs it.
- **A known property, not a defect to chase:** with the Settings overlay open, the
  board's header button is still in the semantics tree underneath. The overlay draws
  on top without being modal. It did not cause the save problem. A modifier to block
  it was written and **reverted** — it was added on a hypothesis never confirmed, and
  this project does not ship those. If a stray tap ever lands through an overlay, that
  is where the next person starts.

### What the physical-device test proved, and what it did not

**PROVEN, on real hardware, 28 August 2026:** the UI-to-server hop for a NUMBER
setting. DoD 6 has genuine evidence for that type.

**NOT PROVEN, all still needing the phone:** DoD 7's phone half (an invalid value typed
into the app, refused with the route's sentence — Dean typed a valid one), DoD 9 (a
refused write rolling the field back to its own prior value), DoD 10
(`studio_words_per_finished_hour` changed from the phone moving the `~$` figures on
both clients — daily capacity drives no money). The boolean and the months array are
also unexercised from the UI; one number was edited.

### DoD 9 — verified below the device, and NOT RUN CHEAPLY above it

Recorded as verified at the REST and unit layers, with the device half explicitly
not run. What IS verified: an editor's write to `site_settings` returns `[]` with
HTTP 200 — the zero-rows shape — with the stored value untouched, and
`FieldWrite.Refused` maps that shape under test.

**Not run cheaply, rather than not runnable.** It needs a device where signing out is
acceptable, and Dean has one phone with one session. The door is expensive, not
locked: a future reader with a spare handset can close this in a minute. Same
treatment as Stage 1 item 14, different reason — that one is deliberately untested,
this one is affordable to anyone with a second device.

### 9B — five money-screen fixes, and a naming question that answered itself

Built, in the order Dean set: bottom clearance on both lists (the nav bar was slicing
the last Expenses row mid-value); the Expenses year breakdown via `spentBreakdown()`,
same derive-the-total-from-the-buckets shape as payments and mattering more because
the year boundary on expenses is a TAX boundary; Schedule C out of the accent colour;
vendor over description; tap-to-expand on payment notes.

**The Schedule C labels did not need proposing.** The web already had
`SCHEDULE_C_LABEL` — twelve lines, named as the tax form names them, with
`SCHEDULE_C_LABEL[x] ?? x` already implementing the unmapped-renders-raw rule. Ported
verbatim rather than invented, and all TWELVE rather than the six the data uses, so
the seventh category Dean files does not render as a slug on the phone while the web
names it properly.

That is [[the same lesson as the settings rule]] one turn later: check whether the
thing already exists before designing it. The instinct to propose six labels would
have produced a second, smaller vocabulary alongside a complete one.

Expense rows now carry BOTH names an expense has — the everyday label Dean picked
while typing, then the line it files under — in the web's order.

### The physical-device claim is CLOSED

Open since Stage 1. **Done, 28 August 2026**, on Dean's physical phone, against the
debug build at Android HEAD `67c16ac`.

**Scope, stated plainly: it covers a Settings write and nothing else.** Every other
screen — board, agenda, card detail, released, archive, payments, expenses, the nav —
remains emulator-verified only. That is not a caveat weakening the result; it is the
scope one test earned.

Stage 1 item 14, the offline sign-out, is unchanged and stays deliberately untested.

---

## Stage 10 and after — payouts, one definition, and a public field that nearly moved

The record from the Stage 8 close-out (`48ee154`) to here. Android: `23774ee` card
editor, `52ce1a8` the row merge, `e0863f5` page progress, `ba490f0` career total,
`61dc5fd` app icon, `32413b1` payouts on Money. Web: `b1c81c1` grant guard, `1100a1f`
page columns, `9294572` payment rows, `a6da9cc` payouts grant, `0ef828d` the pair,
`7c8ad6d` settings store, `e3989d2` the gate, `5a78d07` retry and reset, `20fda86`
one definition, `150cb72` the share correction.

### The payouts grant — Stage 8's promise, collected

Stage 8 closed `payment_payouts` to a hard deny and wrote that "any future Payouts
screen starts with a grant and a reason." This is that grant. The reason: nine
payments carry an editor payout — eight pending, one paid — and the Money screen was
rendering all nine as $0.00 with nothing on the row to say why.

`grant select` to `authenticated`, and a "Role read" policy using
`((select current_app_role()) = 'admin')` — copied from `payments` and `expenses`
character for character, **including the `(select ...)` wrapper**, which is the
InitPlan-caching form evaluated once per statement rather than once per row. It looks
like a redundant subquery and is not one.

Four things deliberately NOT done, each a live temptation at the time:

- **No `anon` or `PUBLIC` grant.** Nothing about a payout is public.
- **SELECT only.** No insert, update or delete. The screen reads these; a write path
  is a separate decision that would need its own verification.
- **`payments_for_session` NOT flipped to `SECURITY DEFINER`.** It would have let one
  function read payouts with no grant at all — convenient, and it would silently
  change the security posture of everything else that function already returns.
- **No `DROP` + `CREATE` on any existing function.** A drop resets the ACL and
  re-grants `EXECUTE` to `PUBLIC`; `anon` inherits from `PUBLIC`. That regression has
  already happened here once, on `board_for_session` and `card_detail`, in a migration
  whose own comment claimed the opposite.

### The share defect — the app shipped a number that was twice too big

Recorded as a defect, not a footnote.

The payouts spec defined Dean's expected income as `word_count / 9400 * pfh_rate` and
omitted the narrator share factor entirely. `payout_summary_for_session` shipped to
his phone showing **net $19,462.56** when the correct figure was roughly half.
**Twenty-two of thirty-four cards are duet**, so the error applied to most of the
catalogue rather than to an edge case.

Corrected figures, verified against live data:

| | |
|---|---|
| expected in | **$12,071.28** |
| editing paid out | **$4,680.00** |
| editing billed back | **$2,340.00** |
| net to Dean | **$9,731.28** |

The defect survived review on both sides because no single reader saw both: the web
had the share, the app did not, and nothing compared them.

### The asymmetry — why the defect was invisible

This is the detail that made it hard to see, and it must survive any future tidy-up:

    EDITOR PAYOUT  = word_count / divisor * rate_pfh           <- NO share
    DEAN'S INCOME  = word_count / divisor * pfh_rate * SHARE   <- share applies

The editor is paid for narrating **the whole book**; Dean earns his share of it. Two
formulas that look like the same formula, differing by one factor that is correct to
omit in one of them.

**`PayoutTest.kt`'s no-share assertions are CORRECT.** It pins all nine stored payout
amounts to `round(word_count / 9400 * rate_pfh)` — 638.30 stored as 638, 489.36 as
489, and so on. Someone reading the share fix will want to "finish the job" by adding
the share factor there too. That would be wrong, and it would silently halve what the
editor is owed. The test is the guard against exactly that; do not edit it to agree
with the income side.

### `narration_format` is NULL on four cards ON PURPOSE

**The single most likely entry in this document to be undone by someone tidying up.**

Four unarchived cards carry a co-narrator with `narration_format` left `NULL`:

| card | id |
|---|---|
| All the Ways I'd Die for You | `bbc26e88-95fb-4158-b94a-0cd0cb2edb50` |
| To Dig Up The Past | `f4edd35d-a0ae-476b-a18b-1f3da6ab7211` |
| Sparked Revolution | `b4479faa-b831-413f-8214-a626bd5a7ba1` |
| All The Ways I'd Live For You | `62602ce3-bce0-42c9-a9d2-509a103f3512` |

It looks like missing data. It is a decision.

**`narration_format` renders publicly, in three places:** the format pill on
`narrated-works/page.tsx`, the individual `[slug]` book page, and the `api/books`
payload. The public catalogue filters
`.in("status", ["contracted", "recording", "editing", "released"])` — and all four of
these are `contracted`, not confidential, with two carrying live public slugs
(`all-the-ways-id-live-for-you`, `to-dig-up-the-past`).

Setting them to `duet` would have put a **DUET pill on four books on the public
site**, announcing casting Dean has not announced. The financial fix would have
shipped a content change nobody asked for.

**The lever used instead:** `narratorShareOf` reads `narrator_share_percent` BEFORE
`narration_format`, so `narrator_share_percent = 50` produces the same share of 0.5
with the format left null. Same money, no public change.

Verified with the pages rather than the schema — unauthenticated, after the write:
zero format pills on the catalogue and on both live slugs (200 each), all four books
still listed, `narrator_share_percent` absent from the public JSON. It appears in no
public surface at all; all four routes that reference it are admin-gated.

If you are here because the null looks untidy: **filling it in publishes casting
information.** Leave it.

### One definition — `card_economics_for_session`

The formula existed twice: in the web's `estimatedEarnings` / `cardExpected` /
`cardInvoiceTotal`, and again in the app's payout summary without the share. It now
exists once, in the database.

`SECURITY INVOKER`, `plpgsql`, `search_path=public`, `assert_board_access()` first,
and the divisor read from `site_settings` rather than hardcoded so it moves with the
studio setting instead of drifting from it.

**The acceptance test that qualified it:** it reproduced the web's existing group
totals **to the cent, against pre-fix data** — production $14,901.92,
ready-to-invoice $7,262.28. Anything less than exact would have meant a different
definition wearing the same name.

**UPDATED 29 August 2026 — the migration is PARTIAL, and the precise shape matters.**

`/payments` now calls the function; `cardInvoiceTotal` was deleted, since that page
was its only caller. **Six surfaces still compute in TypeScript** — `tools/analytics/lib.ts`,
`BoardCardContent.tsx`, `CardEditModal.tsx`, `lib/payments.ts`'s own totals,
`settle-payment.ts` and `api/payments/route.ts` — via `estimatedEarnings` and
`cardExpected`, which have roughly twenty call sites between them.

`narratorShareOf` **cannot** be deleted at all: `narrationPlan` uses the share for
SCHEDULING — hours at the mic, hours per day — on books with no income figure, feeding
the agenda, the board, the edit modal and `capacity.ts`.

**The two sides are pinned by a TEST, not by construction.**
`npm run check-card-economics` compares them across every unarchived card on share,
income, editing_cost and invoice_total. It needs service-role credentials and is NOT
in CI, so it runs when someone remembers — treat it as an open item rather than a
gate. Anyone editing either side must run it.

Building that test first is what made the migration safe: with both sides proven equal
on all 33 cards, moving one surface between them *cannot* change a number. All 34
figures on /payments were byte-identical before and after.

**It found two latent divergences before anything moved.** `editingCost` counts
payouts of kind editor OR PROOFER, and only on NON-ROYALTY payment rows; the function
counted only `editor` and ignored the row kind. Neither is reachable in today's data —
all nine payouts are `editor` on `fee` rows — so the earlier "reconciles to the cent"
had passed on those two dimensions *because nothing exercised them*. An edge case with
no row is untested, not passing. `rs_plus` still has no card and remains untested.

"Editing billed back" is folded into `net` rather than returned as its own column.
Adding a column changes the return type, which requires the `DROP` that resets the
ACL. Dean chose to leave it folded rather than take that operation for a display
convenience.

### The gate convention — all ten read functions

Every read function now calls `assert_board_access()` as its first statement.
`payouts_for_session` and `payout_summary_for_session` were the last two without it,
and `payouts_for_session` moved from `language sql` to `plpgsql` to carry it — a SQL
function has no statement to perform before its query.

**The resulting behaviour change is intended and worth knowing:** a non-admin now gets
`BOARD_ACCESS_NOT_ENABLED` rather than an empty list, because the gate fires before
RLS is reached. Not a live vulnerability before — both functions were `SECURITY
INVOKER` and RLS returned zero rows — but every other read function refused at the
door while these two relied entirely on the policy behind it. One layer where the rest
had two.

### The settings store — eight loading windows, not eight requests

Eight components called `useStudioSettings()`, each with its own `useEffect` and its
own fetch. **The request count was the visible cost; eight independent LOADING STATES
were the defect.** The `/payments` outage of 26 August was a component reading a rate
during its own loading window, a `useMemo` capturing it with the rate missing from its
dependency array, and the memo freezing at the loading answer — every project reading
"Cannot be worked out" for three days while the settings were perfectly readable.

**A module store, not a context provider.** A provider must be mounted above every
consumer and fails silently for one rendered outside it; that guarantee would rest on
eight call sites sharing one tree, and they do not — `/board` is a client page, so the
`AdminLayout` it shares with the others is bundled client-side there and cannot be the
server boundary. Nor a server fetch: the only boundary above all eight is the ROOT
layout, which wraps the public site, and `getStudioSettings()` reads with the
service-role client. With a store the guarantee is structural and there is nothing to
mount incorrectly.

- `getServerSnapshot` returns the loading state, so SSR starts no fetch — the property
  `check-first-render` exists to hold.
- **One retry at 1.2s, with 401 exempt.** Consolidating eight fetches consolidates the
  failure too: one 500 now takes all eight consumers. A 401 is not transient — the
  session is gone, and retrying only delays telling the person to sign in again.
- **`resetStudioSettingsCache` is wired into the save path and RE-READS**, not merely
  clears. Nothing necessarily remounts after a save — the settings form stays on
  screen — so a reset that only cleared would leave every consumer in `loading` until
  the next navigation, which is worse than the staleness it fixes.

Verified in a real browser: 1 request on a `/payments` load; under throttling the
settings resolved at 17.7s and across 66 samples inside that window **zero**
settings-derived figures rendered, 8 after it resolved, nothing frozen. Zero hydration
warnings on a production build.

### The app icon

The art is inset to the 66dp safe zone **deliberately**. The mark's gold ring sits at
the outer edge of the source, and at full bleed the adaptive mask clips it on every
launcher shape. **Do not "fix" the margin by scaling the foreground up** — the empty
band is what keeps the ring intact, and it is the first thing that looks like a
mistake to someone who has not seen the clipped version.

Two forms of the mark, by design: the monochrome layer is line art, the notification
icon a filled silhouette, because line art mushes at 24dp. Both are alpha-only assets
at five densities; the visual distinction is the design's, recorded here as intent
rather than as something this record measured.

`ic_stat_dmn` is landed and **deliberately unreferenced** — the app posts no
notifications today. No `NotificationManager`, no `NotificationCompat`, no
`setSmallIcon`, no `POST_NOTIFICATIONS`, and App info confirms "Notifications: Off".
Wiring it up would mean inventing a notification to justify an asset.

Verified with pixels rather than BUILD SUCCESSFUL: the APK's PNG byte sizes match the
source at every density, and screenshots of the launcher drawer and App info both show
the gold ring complete and unclipped.

### The `anon` revoke on `board_cards`

A vestigial `SELECT` grant that no policy admitted. Proven harmless before removal
with a control — as `anon`, `authors` returned 27 and `board_cards` returned 0, so RLS
was doing the work and the harness could demonstrably see data when data was visible.
All 22 `board_cards` call sites verified to use `supabaseAdmin` first.

**The consequence is deliberate: `anon` now gets "permission denied" rather than an
empty result.** That is the intent, not a regression. An empty result meaning "you are
denied" is indistinguishable from one meaning "there is nothing here", and this
project has been bitten repeatedly by exactly that ambiguity. The loud failure is the
better one — and nothing calls it, so it is unreachable by any client.

### Verification practices that caught real defects

Not process decoration — each of these found something in this stretch:

1. **A harness that cannot fail for the reason it claims to test is not testing that
   reason.** The RLS negative test first ran as `postgres`, which holds
   `rolbypassrls`, and reported that a demoted session read all 9 payout rows. A
   control against `payments` — identical policy, known-good — returned all 25 rows
   too, which is what exposed the harness rather than the policy.
2. **Same shape, different tool.** A Slow-3G throttle harsh enough to stop the page
   loading returned all zeroes, which read as "no violations". The window has to be
   wide enough for the thing to happen in.
3. **Confirm a change moved a number by the PREDICTED amount, not merely that it
   moved.** The share correction was predicted to drop production by $2,569.15; it
   dropped by $2,202.15. The data was right and the prediction was wrong — the group
   sums `invoice_total`, and the billed-back term `editing * (1 - share)` was dormant
   at share 1 and switched on with the fix. "It changed" would have hidden that.
4. **A check that informed an action must be re-run after the action.** The grant
   guard's second run found a seventh function its first run had already reported,
   missed because the output had been read through a `tail`.
5. **Prove an enumerator can see what it claims to cover.** Granting `card_detail` to
   `anon` inside a rolled-back transaction made it appear in the audit (0 rows to 1),
   proving the sweep is whole-schema and not keyed on the `_for_session` naming
   convention.
6. **Every probe that writes runs inside a transaction that rolls back**, including
   the quick ones. The quick ones are where it leaks.
7. **When two producers can set a value, a guard on one of them is a guard on
   neither.** `profiles.role` has a column DEFAULT and a `handle_new_user` trigger
   that names the role explicitly. The first version of the guard checked only the
   default, and mutating it *passed the mutation test* — the guard went red exactly
   as intended. The hole showed in the same run's other column: with the default set
   back to `'editor'`, the simulated signup still came out `'pending'`, because the
   trigger decided. A guard that can go red while the system is safe can also stay
   green while it is not. Enumerate the producers, then guard each.
8. **A default's meaning can change without the default changing.** `role` defaulted
   to `'editor'` for months while `'editor'` meant nothing. E1 turned it into a real
   grant over the whole board, and at that instant every account creation became an
   access grant — with no diff, no migration and no review touching the line
   responsible. The code that caused it was written long before the code that made it
   dangerous, so only a test that re-asks the question every run can catch this class.

### Open items carried forward

1. **Web migration onto `card_economics_for_session`.** The next stage. Until then the
   two copies agree by reconciliation, not construction.
2. **`supabaseBrowser` is defined and never imported.** Dead code that is also a trap:
   it is the only anon-key client in the repo, so anyone reaching for a browser client
   would find it and use it against tables that now deny `anon`. Delete it, or comment
   what it is for.
3. **`co_narrator` is stored in two shapes.** Across unarchived cards: **22 rows hold
   a JSON array string** (`["Veronica Moore"]`, and several with multiple names) and
   **9 hold bare text** (`Ann Dahlia`). This is not a four-row curiosity — it is most
   of the catalogue, and anything keyed off that column must handle both. There is no
   Postgres array operator that works against it as stored.
4. **The share rule's fallback is still `else 1`.** After the four corrections no card
   is in that state, so nothing is wrong today. But a NEW card with a co-narrator and
   no format would be costed as solo — the same defect, re-entering through the front
   door. Dean chose to fix the data rather than change the default, on the grounds
   that the default is right for solo work and the co-narrator column is too
   inconsistent to key off. Recorded as a known trap, not a bug.
5. **DoD 2 — `word_count` from the phone, end to end.** Needs Dean's hardware; the
   emulator will not land a save.
6. **DoD 8 — setting a page on a book with no `total_pages`.** CLOSED 2026-08-29, and
   this entry was WRONG about the starting point. It did not fail. The write was
   accepted in full, the page was stored, `words_recorded` never moved, and nothing
   said so — and `pageLine()` renders nothing without a total, so the screen looked
   like it had saved. Silent acceptance with no derivation and nothing rendered, not a
   failure. It now asks for the total, naming the book and the page. See the J1-J8
   section at the end of this file.
7. **Stage 1 item 14, offline sign-out — stays DELIBERATELY UNTESTED.** Refused twice
   on the strength of the guard test, and the reason holds: the guard proves how many
   places can call sign-out, not that the call works with no network. Those are
   different claims and only one of them is tested.

---

## Cleanup batch J1-J8 (2026-08-29)

### Manuscript-derived page counts, and the two controls

Ten page counts applied to cards that had none: With a Broken Wing 440, Blood on the
Asphalt 392, Heir of the Emberscale 255, Beating For You 231, Merciless Punks 224,
His For Christmas 180, Unbound 174, The Circle 133, No One to Hold Me 131, The Final
Guardian 46. Unarchived cards with no `total_pages`: **18 before, 8 after**.

None of the ten had a `current_page`, so the `apply_card_rules` trigger had nothing to
derive from and `words_recorded` could not move. That was checked before the write
rather than inferred from it afterwards.

**Control 1 - money.** `word_count` sum 2,346,308, `pfh_rate` sum 5,965,
`narrator_share_percent` sum 299, `royalty_split_percent` sum null; payments 25 rows,
expected 521.09, received 6,844.98. Identical before and after.

**Control 2 - career.** 33 books, 27 with a word count, `word_count` sum 2,346,308,
`words_recorded` sum 458,239. Identical before and after.

Both controls read the BASE TABLES, not `card_economics_for_session()` or
`career_totals_for_session()`. That is deliberate: a control computed by the same
function whose output it is vouching for cannot detect a fault in that function.

### `books` is write-only - evidence, not impression

- `GET /api/books` reads **`board_cards`**, and says so in the code: "Source of truth
  is board_cards."
- All four `from("books")` sites in `src/app/api/books/route.ts` are **writes** -
  insert, update, update, delete. There is no `select` against `books` anywhere in the
  application or in any `.sql` file in the repo.
- `/admin/books` is **linked from no navigation**. The only mention outside its own
  directory is a comment in `src/app/admin/login/page.tsx`.
- Its 20 rows carry **no unique data**: every title also exists in `board_cards`; its
  two extra columns are `category` (which maps onto `status`: coming-soon, completed,
  in-progress) and `link`, and all 20 links duplicate a link already on the card.

An unlinked admin screen editing a table nothing reads, beside the same data's real
source of truth. **Dean chose delete, and it is done.** Dropped: the table, the editor
at `/admin/books`, the four write handlers on `/api/books`, and the login-page comment
that pointed at it. **The GET handler was KEPT** - it reads `board_cards` and serves the
public catalogue, and shares a route name with the writes and nothing else; deleting it
would have taken the public site down.

Backed up first as `books_full_backup_20260829` - all 20 rows, every column, verified
row-for-row before the drop, which is refused if the backup is not 20 rows.

Verified with the table already dropped and the old code still deployed, which is the
strongest form of the check: `/api/books` returned **200 with 32 items** from
`board_cards`, `/narrated-works` 200, and two real book pages 200. The one 404 in that
run was a slug I guessed rather than took from the payload; re-run against two real
slugs, both 200. Build clean after clearing a stale `.next` route-type cache.

### The backup table is PARTIAL, and was nearly recorded as if it were not

`books_pre_cleanup_20260829` holds **8 rows**, against 20 currently in `books` - and
**4 of its rows are no longer in `books`** at all (Beating For You, Blood on the
Asphalt, Restrict, Tease). It is a snapshot of the rows one cleanup touched, not a
snapshot of the table. All four also exist as `board_cards`, so nothing is unique to
it, but "there is a backup" would have been a misleading sentence to leave behind.

### The career-total attribution catch

The career total moved 23,444 to 39,073 and the obvious culprit was the 17:50
migration. It was not: the change came from Dean's own page entry at 06:45, which took
a book from page 132 to page 220. The migration ran eleven hours later. A figure moving
near a change is not a figure moving *because of* it, and the timestamps were what
settled it.

### Six verification rules

1. **A fixture that reconciles as `null == null` proves nothing.** The `rs_plus`
   branch had no card exercising it. The first fix created a real `rs_plus` card on the
   live board, compared it and deleted it - and it had to be withdrawn, because two
   concurrent CI runs would race: run B's opening sweep could delete run A's row
   mid-comparison, a false FAILURE if it landed before A's read and a false PASS if
   after, decided by timing nobody controls. A test that can corrupt live data is not
   worth what it proves. It is replaced by `scripts/check-rs-plus-branch.ts`: a
   TypeScript half with no database at all, and a SQL half whose row never commits.
   Both assert against ONE hand-derived constant, so TS == EXPECTED and SQL == EXPECTED
   gives TS == SQL transitively, and a wrong EXPECTED fails both halves loudly. The null
   guard is kept, because that was the actual hole: a dropped `rs_plus` returns null on
   its side, and null against null reconciles while proving nothing. Both halves were
   mutation-tested independently - removing `rs_plus` from `board-card-utils.ts` reddens
   only the TypeScript half, removing it from `card_economics_for_session()` reddens
   only the SQL half.

   **THE RESIDUAL GAP, stated because it is a smaller claim than the other eight
   cases carry.** This proves each side handles `rs_plus` correctly against a figure
   written down by hand. It does NOT prove the two agree on a real row end to end,
   which is exactly what the other eight edge cases do prove. It should not be filed as
   equivalent. If `rs_plus` ever gets a real card, delete that file and let the
   reconciliation check cover it properly.

2. **A pipeline that skips when its secrets are missing reports green.** The workflow
   fails when the credentials are absent rather than skipping, because a green tick that
   checked nothing is worse than no tick at all - and it is documented as a SIGNAL, not
   a gate, since Vercel deploys independently of Actions.

3. **A differential test's coverage is a property of the test AND the data.** A
   test that compares two implementations can only see a difference the data
   makes visible. When no row exercises a branch, the two sides cannot disagree
   about it, and the run reports agreement it has not earned. The test is not
   wrong. It is correct and blind at the same time, which is why this keeps
   getting missed - there is nothing to find by reading it.

   **Three instances in this session alone:**

   - **`rs_plus` returned null on both sides and the run reported agreement.**
     No card used `rs_plus`, so both implementations returned null, null equalled
     null, and "All cards reconcile" was printed.
   - **W2/W3 passed before the change they were meant to gate.** They were
     checking a table that nothing ever read, so they would have passed whatever
     the change did.
   - **The reconciliation run reported green across a one-sided change.**
     `editingCost` was mutated to drop card-level payouts entirely and the run
     still said "All cards reconcile", because no payout in the data has
     `payment_id` NULL.

   **What to do about it.** Ask of every differential test: *which rows make this
   difference visible, and how many are there?* If the answer is none, the test
   is not covering that branch no matter how correct it looks. Either construct
   the row — a probe that builds its own data inside a rolled-back transaction,
   as `rs_plus_branch_probe()` and `card_payout_branch_probe()` do — or report
   the branch as UNTESTED. Do not let a green run stand in for either.

   **And a corollary that bit twice here:** a mutation test inherits the same
   blindness. Mutating one side proves nothing if no row exercises the mutated
   branch — the first `editingCost` mutation passed cleanly. A mutation test must
   be shown to FAIL before its passing is worth anything.

4. **An absent field is not "no value" — it is the CONSUMER'S DEFAULT.** Omitting
   a column from a return type is only safe when the consumer's default for it is
   the restrictive one. Ask what the reader does with the missing key before
   deciding the omission is a protection.

   `BoardCardDto` declares `is_confidential: Boolean = false`. The editor board
   function was specified without that column, so an absent key would have
   decoded as NOT confidential and rendered **both of today's confidential covers
   as ordinary ones** — through the very function written to stop an editor
   seeing too much. `canViewConfidentialCovers` is false for an editor precisely
   so that cannot happen, and it reads the flag it was no longer being sent.

   Omission is the right tool for `pfh_rate`, `payment_type` and
   `narrator_share_percent`, because their default is null and null means "no
   figure". It is the wrong tool for a boolean whose default is permissive. Same
   technique, opposite outcome, decided entirely by the consumer.

5. **`current_user` vs `auth.role()` depends on the function's security mode, and
   the earlier preference for `current_user` was an artefact of the harness.**

   Inside `SECURITY DEFINER`, `current_user` is the function's OWNER and can never
   identify the caller — so a service-role escape written as
   `current_user = 'service_role'` is dead code there, silently. `session_user`
   does not rescue it either: PostgREST connects as `authenticator` and then SET
   ROLEs, so it reads 'authenticator' whatever key was used. `auth.role()` reads a
   JWT claim, which `SECURITY DEFINER` does not rebind.

   The reason `current_user` was preferred in the first place is worth naming: the
   SQL harness could set a role with `SET LOCAL ROLE` but was not setting JWT
   claims, so `current_user` was the only thing that varied under test. **A
   limitation of the test environment was promoted into a design rule** — and it
   held for as long as every caller happened to be `SECURITY INVOKER`. The rule
   was never about which is correct; it was about which the harness could see.

6. **`notes` is excluded from every editor-facing function on purpose, and the
   reason is measured rather than assumed.** Of the four populated `notes` on
   `board_cards` today, **three carry financial content** — "No PFH rate recorded;
   not missing data." on Restrict, Tease and Unbound. The fourth is "Live on TT
   with Author".

   It is free text, so it cannot be gated by column and cannot be trusted by
   convention. If an editor needs card context, **add an `editor_notes` column**;
   do not open this field. Anything that opens `notes` to an editor also opens
   whatever Dean writes in it next.

### Open items 2, 3 and 6 above are now closed

- **2 - `supabaseBrowser`:** deleted. It had zero importers.
- **3 - `co_narrator` in two shapes:** normalised to JSON array strings after every
  reader was confirmed to handle both. 32 rows are now arrays; 2 empty strings were left
  alone, since both parsers already yield `[]` for them.
- **6 - DoD 8:** built. See below.

### DoD 8: what it actually did, which was worse than failing

Recording a page on a book with no `total_pages` did **not** fail. `apply_card_rules`
returned early:

```sql
if new.total_pages is null or new.total_pages <= 0
   or new.current_page is null or new.current_page < 0 then
  return new;
end if;
```

The write was accepted in full, the page was stored, `words_recorded` never moved, and
nothing said so - and `pageLine()` renders nothing without a total, so the screen looked
like it had saved. The roadmap had this recorded as "should prompt rather than fail",
which was wrong about the starting point: it never failed.

It now asks, naming the book and the page:

> Set the total page count for "Santa Promised" before recording page 50. Without the
> total there is nothing to measure the page against, so words recorded cannot be worked
> out.

Five cases were checked in a rolled-back transaction: a page with no total is **refused**;
setting a total alone still works; clearing a page still works; a page past the last page
is still refused by the pre-existing guard; and a normal page write still derives. The
early return is retained for the clearing case, which is legitimate and must stay silent.

### The `co_narrator` reader survey (done BEFORE normalising)

Every reader was checked first, because normalising against an unsurveyed reader is how
a data migration breaks a page nobody was looking at.

- **`parseCoNarrators`** (`board-card-utils.ts:308`) - handles array strings, bare text
  and JSON scalars. Used by the co-narrator contact pages, `BoardCardContent`,
  `CardEditModal`, `InvoiceButton`, `PaymentFormModal` and `RoyaltyLedger`.
- **The public book page** (`narrated-works/[slug]/page.tsx:207`) - its own inline copy
  of the same logic, handling all three shapes.
- **`narrationPlan` does NOT read `co_narrator`.** It uses `narratorShareOf`, off format
  and percent. The roadmap and the brief both assumed otherwise.
- **The agenda API does not read it either.**
- **`parseMaybeJsonArray`** (`api/board/export/route.ts:38`) - the one gap, and it is
  LATENT, not live: a valid-JSON *scalar* (a quoted name) falls past the `Array.isArray`
  test and returns `[]`, dropping the name. No row has that shape, and normalisation has
  now made it less reachable still. Left as found and reported rather than fixed unasked.

### Open items carried forward (updated)

1. **Web migration onto `card_economics_for_session`.** Unchanged. `/payments` reads the
   function; six surfaces still compute in TypeScript, pinned by the reconciliation check.
2. **The `books` table and `/admin/books`.** CLOSED - deleted. See above.
3. **The share rule's fallback is still `else 1`.** Unchanged, still a recorded trap.
4. **DoD 2 - `word_count` from the phone, end to end.** Still needs Dean's hardware.
5. **Stage 1 item 14, offline sign-out - stays DELIBERATELY UNTESTED.** Unchanged.
6. **The reconciliation workflow has no credentials yet.** `.github/workflows/reconcile.yml`
   needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as repository secrets.
   Until Dean adds them **it will fail on every push**, which is the intended behaviour and
   not a broken workflow.
7. **`rs_plus` is checked, but by a smaller claim than the other eight cases.** See
   verification rule 1 above. The production fixture is gone; nothing the checks do can
   now reach live data.
8. **`public.rs_plus_branch_probe()` is the only function in the schema whose body
   writes to `board_cards`.** Its rollback is an UNCONDITIONAL `raise` inside a plpgsql
   subtransaction - not in an `if`, not below a check, the only exit from the inner
   block - so the insert cannot survive, including when the select errors. plpgsql
   variables are not transactional, which is what lets the figure survive while the row
   does not. EXECUTE is revoked from PUBLIC and granted only to `service_role`. It
   exists because CI reaches this database over PostgREST, which has no transaction
   control: there is no `DATABASE_URL` and no Postgres driver in the project, so a
   client-side `BEGIN ... ROLLBACK` was not available. **If that function is ever edited,
   the `raise` is the rollback** - removing it commits a card to the live board.

---

## Editing costs belong to the book (2026-08-29)

`payment_payouts.payment_id` was NOT NULL with no `card_id`, so recording an
editor required inventing a payment first. That is where the eight $0 payments
came from: Dean's workaround and the unreadable Money rows were one defect seen
from two ends.

### The remodelling

`card_id` added, backfilled from each payout's payment, then set NOT NULL.
`payment_id` keeps its foreign key but loses NOT NULL - it is now an OPTIONAL
link to the payment that SETTLES the cost, not the payout's identity.

A payout pointing at one book and at a payment for another is silent
corruption, and this change is what makes it possible. A CHECK cannot see
another table, so `check_payout_card_matches_payment()` enforces it as a
trigger, shaped like the existing `check_card_*` validators.

### What was verified, and what moved

- **M1** `payout_summary_for_session` returns 12,071.28 / 4,680.00 / 9,731.28,
  identical across all six fields. Lossless.
- **M2** All 9 payouts map to the SAME card as before, per row, not just in
  total. A total can match while two rows swap books.
- **M4** The mismatch trigger refuses a payout linked to another book's payment,
  naming both. A payout with NO payment link is accepted, and one with a
  MATCHING link is accepted - both checked, because a trigger that refuses
  everything would also have passed the first test.
- **M5** Non-admin gets BOARD_ACCESS_NOT_ENABLED from both functions; anon has
  no EXECUTE and no table grant; admin can INSERT against a book with no
  payment, UPDATE a granted column and DELETE - and UPDATE on `card_id` is
  REFUSED, so the column scope holds and the trigger's rule cannot be
  sidestepped after the fact.
- **M7** The nine `_for_session` functions are byte-identical to baseline.
- **M8** The reconciliation check still passes on all 33 cards.

### Three things in the brief that were not true

1. **M1's fourth figure, 2,340.00, matches nothing.** Not a summary field, not a
   subtotal, not the paid/unpaid split. The real figures are total 5,318, paid
   638, unpaid 4,680 - and `committed_out` is the UNPAID total. Reported rather
   than mapped onto the nearest real number.
2. **M3's production figure is 13,431, not 12,700 - and the difference is not
   this change.** Hexes & Heartbreakers now has BOTH a word count (91,605) and a
   rate ($150); the brief said it needed a rate. Duet share 0.5 gives
   91,605 / 9,400 x 150 x 0.5 = $731, and 12,700 + 731 = 13,431 exactly.
   `Ready to invoice` is $7,262, matching the brief.
3. **The L5 list of six was stale in two places.** Hexes has a rate now, so it
   shows a figure rather than a dash; and `How an Angel Dies: Wrath` is
   multicast and belongs on the list. Deriving the reason from the data, as the
   brief required, produced the correct six where the hardcoded list would not
   have.

### The M7 audit caught a real regression

`rs_plus_branch_probe` was created with `revoke all on function ... from public`
and a single grant to `service_role`. The audit found **anon and authenticated
still had EXECUTE**. Supabase's DEFAULT PRIVILEGES grant EXECUTE to those two
roles EXPLICITLY on every new function in the schema, and an explicit grant is
not a PUBLIC grant - so revoking PUBLIC left both untouched. Revoked by name.

**The rule:** revoking PUBLIC is not enough on this database. Revoke `anon` and
`authenticated` by name, then audit, or the grant is still there.

### A cost that is recorded and invisible

The first end-to-end run of "+ Editor" wrote the payout correctly - against the
book, with no payment created, payments unchanged at 25 - and **nothing on the
page showed it**. The Money screen reads payouts nested under payments
(`payouts:payment_payouts(...)`), and a payout with no payment cannot arrive
that way. The write was right and the row was invisible, which is the same
failure shape as the dashes: it looked like nothing had happened.

Fixed by fetching payouts with `payment_id is null` separately and rendering
them on the row as `<payee> · <kind> · <amount> · not yet on a payment`.

### STILL OPEN

1. **`payouts_for_session` cannot return `card_id` without a DROP.** Proved, not
   assumed: `CREATE OR REPLACE` with the column added is refused with
   `42P13 cannot change return type of existing function`. Per the brief this
   stopped rather than dropping - a DROP loses the ACL, re-grants EXECUTE to
   PUBLIC and destroys the comments. This blocks the PHONE only; the web reads
   `payment_payouts` directly through the service role and never calls that
   function.
2. **`card_economics_for_session` still attributes editing through payments.**
   Its editing CTE joins `payment_payouts -> payments` and filters
   `kind <> 'royalty'`. A cost recorded against a book with NO payment therefore
   does not reach `editing_cost` or `invoice_total`. Nothing is wrong today -
   all 9 existing payouts have a payment - but every payout the new button
   creates will be outside the money figures until this is changed, and changing
   it redefines a money figure, which is not something to do unasked. The
   correct rewrite keys on `po.card_id` and admits a payout where
   `payment_id is null OR its payment is non-royalty`, which preserves today's
   numbers exactly.
3. **M6, the phone end to end, is not done** - it needs Dean's hardware. The web
   equivalent was run in full: added an editor to Hexes & Heartbreakers (a book
   with no payment row), confirmed the payout appeared, confirmed payments
   stayed at 25 and Hexes still had 0 payment rows, then deleted it and
   confirmed it was gone.
4. **The eight hollow payments are now vestigial.** Confirmed exactly eight,
   each $0/$0/$0 carrying exactly one payout. Left untouched: deleting them
   changes the Money screen's row set and is its own decision.

---

## Making the new payouts count (2026-08-29)

The previous stage let a cost be recorded against a book. This one makes it
reach the figures, on both sides at once.

### N1 - a deliberate DROP, and the ACL restored by hand

`payouts_for_session` had to return `card_id`: a payout created against a book
has `payment_id` NULL, so without it the phone gets rows it cannot attribute.
`CREATE OR REPLACE` refuses this with `42P13 cannot change return type of
existing function`, proved rather than assumed.

**The ACL captured before the drop, verbatim:**

```
postgres=X/postgres
authenticated=X/postgres
service_role=X/postgres
```

No PUBLIC entry, no anon, and **no COMMENT** - so there was none to preserve.
One was added, since a drop is the moment you find out.

Restored by name after the recreate, `anon` revoked by name, PUBLIC revoked as
well, and every one of those asserted inside the same migration so a
half-applied recreate fails loudly rather than shipping open. Verified with
`has_function_privilege()`, not by reading the ACL string.

### N2 - editing attributed through the book

The old editing subquery lived inside `agg`, which is built
`from payments group by card_id`. A card with NO payments produced no `agg` row
at all, so its editing was 0 whatever the join said - and that is exactly the
card the "+ Editor" button writes against. Fixing the join condition alone would
not have been enough; editing needed its own CTE keyed on `po.card_id`.

Both arms matter: `po.payment_id is null` (recorded against the book, nothing
settles it yet) `or p2.kind <> 'royalty'` (settled by a real fee). A royalty
statement has no fee to take production costs from.

The TypeScript `editingCost` gained a **required** second parameter rather than
a defaulted one. A default of `[]` would have let all three call sites keep
compiling while silently under-counting, and a cost that is recorded but missing
from the figure is worse than one that errors. Making it required meant the
compiler named every caller - it found exactly three.

### THE RECONCILIATION TEST WAS BLIND TO THIS

Worth stating plainly, because the brief relied on the opposite: *"the
reconciliation test goes red if only one lands."*

**It does not, on today's data.** The TypeScript side was mutated to drop
card-level payouts entirely, and the run reported **"All cards reconcile."**
There are zero payouts with `payment_id is null`, so there is nothing for the
two sides to disagree about, and the test cannot see a one-sided change.

The mutation test was only meaningful once one such payout existed. With one
present, both halves were mutation-tested independently and produced mirror
images:

| mutation | TypeScript | database |
|---|---|---|
| TS side drops card-level payouts | 0.0000 | 100.0000 |
| SQL side drops the `payment_id is null` arm | 100.0000 | 0.0000 |

Both reverted; the probe payout deleted; 9 payouts, 25 payments, 0 loose.

**The standing consequence:** until a real card-level payout exists, this pairing
is held by review and by the mutation test above, not by the reconciliation run.

**SUPERSEDED the same day.** The gap is closed by `card_payout_branch_probe()`
and `scripts/check-card-payout-branch.ts`, which construct the missing row inside
a rolled-back transaction rather than waiting for Dean to create one. See the
section at the end of this file.

### What was verified

- **P1** `payout_summary_for_session` returns 12,071.281914893618 / 4,680 /
  9,731.281914893618 / 8 / 1 / 0 - identical before and after. Web: In
  production **$13,431**, Ready to invoice **$7,262**, both unchanged. A fresh
  before-reading was taken rather than trusting the brief's figures.
- **P2** A payout with `payment_id` NULL against a duet card moved
  `editing_cost` by **exactly the payout amount**. `invoice_total` moved by
  **amount x (1 - share)** - $50 on a $100 payout at share 0.5, NOT the full
  amount as the brief expected. That is the co-narrator's half being billed
  back, and it is correct: on a solo card (share 1) `invoice_total` would not
  move at all.
- **P3** A $500 payout on a ROYALTY payment moved `editing_cost` by 0. Still
  excluded. Note the rule keys on the PAYMENT's kind, not the card's: a payout
  with no payment on a royalty-only book IS counted, which is the first arm
  doing its job.
- **P4** `payouts_for_session` returns `card_id`, populated on all 9 rows -
  checked by calling it, after a first attempt via `information_schema.columns`
  wrongly reported "NO" (that view does not describe set-returning functions).
  `has_function_privilege('anon', ...)` false. Full audit across all ten
  functions identical to baseline. The standing grant guard passes.
- **P6** The L1 mismatch trigger still refuses a payout linked to another book's
  payment, with a matching-link control accepted.

### End to end, on the real page

"+ Editor" on Hexes & Heartbreakers (duet, share 0.5), $321: the production total
moved **$13,431 to $13,591**, exactly `321 x (1 - 0.5) = 160.50`. Before this
stage it would have moved by nothing. Probe deleted, total back to $13,431.

### N3 / N4

`rs_plus_branch_probe` now carries a comment saying it is permanent schema that
exists only for CI, that the unconditional RAISE **is** the rollback, that it is
the only function in the schema whose body writes to `board_cards`, and that
revoking PUBLIC alone was insufficient.

`supabase/migrations.sql` records the rule beside the no-DROP rule: **PUBLIC and
named grants are independent channels, in both directions.** Revoking PUBLIC does
not remove an explicit `anon` grant that Supabase default privileges added; and a
role may hold access ONLY via PUBLIC, so revoking PUBLIC can cut off a role you
did not intend. Verify by privilege, never by reading the ACL string.

---

## Closing the card-level payout coverage gap (2026-08-29)

The previous stage ended with a gap recorded rather than closed: the
reconciliation run could not see a one-sided change to how editing is
attributed, because no payout in the data has `payment_id` NULL. That made the
coverage depend on Dean using the "+ Editor" button before the test could see
the case it creates. Closed the same way `rs_plus` was.

### The probe

`card_payout_branch_probe()` builds its OWN card and its OWN card-level payout,
so the figures depend on nothing in the catalogue:

    duet (share 0.5), 100,000 words, $250/pfh, one $200 editor payout, no payment

It calls `card_economics_for_session()` in the same transaction so the rows are
visible, then rolls both back from an UNCONDITIONAL raise inside a plpgsql
subtransaction — the same shape as `rs_plus_branch_probe()`, for the same reason:
CI reaches this database over PostgREST, which has no transaction control.
Locked to `postgres` and `service_role`, with `anon` AND `authenticated` revoked
BY NAME, per the rule in migrations.sql.

### One shared set of hand-derived figures

    income:   100,000 / 9,400 = 10.638297872340425 finished hours
              x $250 = $2,659.5744680851063
              x share 0.5 (duet) = $1,329.7872340425532
    editing:  one $200 editor payout, attributed to the BOOK = $200
    invoice:  income + editing x (1 - share)
              $1,329.7872340425532 + $100 = $1,429.7872340425532

`scripts/check-card-payout-branch.ts` asserts all three on both sides, so
TypeScript == EXPECTED and SQL == EXPECTED gives TypeScript == SQL transitively.

**The hole here is 0 == 0, not null == null.** `editingCost` returns a number and
never null, so a side that had dropped this branch returns 0 — and a comparison
against a 0 expectation would agree while proving nothing. Every figure must be
non-null AND non-zero.

### Both halves mutation-tested, in mirror image

| mutation | result |
|---|---|
| TypeScript drops card-level payouts | `TypeScript editingCost returned zero`, invoice 1329.7872 vs 1429.7872; SQL green |
| SQL drops the `payment_id is null` arm | `SQL editing_cost returned zero`, invoice 1329.7872 vs 1429.7872; TypeScript green |

Both reverted. Nothing committed: 9 payouts, 25 payments, 0 loose, 0 probe cards,
and the `card_economics_for_session` comment intact after the replace cycle.

### `set_books_updated_at` dropped

Its table went on 2026-08-29, but dropping a table removes its triggers, not the
functions they called — so the function survived, firing for nothing, referencing
a table that no longer existed. Checked BEFORE dropping: zero triggers reference
it, zero non-internal dependencies, `to_regclass('public.books')` is null.

### The residual claim, unchanged in kind

Both probes prove each side against figures written down by hand. Neither proves
the two agree on a real row end to end, which is what the eight edge cases in the
reconciliation run do carry. That is a SMALLER claim and is not filed as
equivalent. When a real `rs_plus` card or a real card-level payout exists, the
reconciliation run covers it properly and the corresponding probe can go.

---

## The arithmetic, extracted (2026-08-29)

Both CI probes were permanent functions whose bodies INSERTED into `board_cards`,
each relying on an unconditional `RAISE` that an innocuous edit could remove. They
were built that way because the formula only existed inside a query over three
tables: the sole way to exercise a branch was to make rows exist.

`public.card_economics()` now holds the arithmetic and nothing else. Ten scalars
in, four figures out. No table reads, no writes, no `assert_board_access()` — it
cannot leak anything because it is never given anything to leak. IMMUTABLE,
PARALLEL SAFE. `card_economics_for_session()` supplies the columns, the payment
aggregates and the studio divisor, and delegates.

### The null semantics were preserved deliberately

`when p_payment_type not in ('pfh', 'rs_plus') then null` looks like it wants
tidying to `is distinct from`. It does not. When `payment_type` is NULL,
`NULL not in (...)` evaluates to NULL, the branch is not taken, and evaluation
falls through to the next test — which is what the original did. "Tidying" that
would move money.

### A one-minute outage, caused by the extraction

The first delegating version failed function resolution: `count(*)` is `bigint`
and `narrator_share_percent` is `smallint`, and **bigint to integer is an
ASSIGNMENT cast, not an implicit one**, so no candidate matched. Between the two
migrations `card_economics_for_session()` raised `42883` and `/payments` was
broken in production for about a minute. Fixed with explicit casts at the call
site rather than by widening the pure function's parameters, so the arithmetic
keeps declaring the types it actually wants.

Worth recording because the extraction was numerically inert and still caused an
outage: **the risk in a refactor is not only in the arithmetic.**

### Verified by the numbers

- **Per-card, not just totals.** All 33 cards compared field by field across
  `share`, `income`, `editing_cost`, `invoice_total`, `title`, `status` —
  **198 comparisons, every one identical**, tolerance 1e-12, and nullness
  compared separately from value so a null turning into 0 could not pass.
- `payout_summary_for_session`: 12,071.281914893618 / 4,680 /
  9,731.281914893618 / 8 / 1 / 0. Unchanged.
- Web: In production **$13,431**, Ready to invoice **$7,262**. A fresh
  before-reading was taken rather than trusting the figures in the brief.
- Full ACL audit before and after: identical, with `card_economics` added as
  anon false / authenticated true / service_role true / no PUBLIC.
- All four checks green: reconciliation, rs_plus, card-payout, grant guard.

### Mutation-tested in both directions, because the pure function is now the
### single point where a one-sided change would hide

| mutation | reconciliation | card-payout probe | rs_plus probe |
|---|---|---|---|
| SQL: share dropped from income in `card_economics` | RED, many cards | RED (income, invoice) | green — correctly |
| TypeScript: share dropped from `estimatedEarnings` | RED, same cards | RED (income, invoice) | green — correctly |

The rs_plus probe staying green in both is right, not a miss: its synthetic card
has share 1, so dropping the share multiplication cannot change its figure. A
probe that went red there would have been reporting something it does not test.

### The probes are now pure

Asserted in the migration itself, and re-checked independently against
`pg_proc.prosrc`: neither body contains `INSERT`, `UPDATE`, `DELETE` or `RAISE`,
and both are IMMUTABLE. That check is the point of the exercise — the bodies
shrank to 401 and 495 characters, and there is no longer any code path in this
schema, outside the application, that writes to `board_cards`.

The residual claim is unchanged in kind: both probes prove each side against
figures written down by hand, not that the two agree on a real row end to end.

---

## E1 — the editor read foundation (2026-08-29)

A second role, made safe before anything is built on it.

### The gate is separate, and assert_board_access was not touched

`assert_editor_access()` admits admin OR editor and is used by exactly two
functions. `assert_board_access()` still guards all ten of the others,
unchanged — widening it would have opened every financial function at once.

**One thing that had to be different, and it is load bearing.**
`assert_board_access()` lets the service role through on `current_user =
'service_role'`, which works because every function calling it is SECURITY
INVOKER. The editor functions are SECURITY DEFINER, and inside a DEFINER function
`current_user` is the function's OWNER, not the caller — so that test can never
be true there. `session_user` is no help either: PostgREST connects as
`authenticator` and then SET ROLEs, so it reads 'authenticator' whatever key was
used. The new gate reads `auth.role()`, the JWT claim, which SECURITY DEFINER
does not rebind and which the existing "Service role full access" RLS policies
already use.

### Why SECURITY DEFINER, written on the object so nobody "fixes" it

Column-level control cannot come from RLS, which filters rows and not columns.
It cannot come from column grants either, because the editor and the admin are
the SAME Postgres role — both are `authenticated` — so a grant that hid a column
from her would hide it from him. The only place the distinction can live is
inside a function that runs as its owner and simply never selects those columns.

`pfh_rate`, `payment_type` and `narrator_share_percent` are OMITTED FROM THE
RETURN TYPE, not nulled. A column that does not exist cannot carry a value; a
nulled one is one careless edit away from carrying it again.

There is deliberately NO RLS policy on `board_cards` for editors. With one she
could query the table directly through PostgREST and every stripped column would
come straight back.

### A deviation from the stated column list, because the list leaked

E1b named sixteen columns and `is_confidential` was not among them. Omitting it
LEAKS, in the exact direction this stage exists to close: `BoardCardDto` declares
`is_confidential: Boolean = false`, so an ABSENT key decodes as NOT confidential
and the editor's board would render every confidential cover as an ordinary one.
`Capabilities.canViewConfidentialCovers` is false for an editor precisely so that
cannot happen, and it reads this flag to do its job. **Two cards are confidential
today**, and both would have been exposed.

It is not a financial column, and the three that are remain absent. Adding it
required a DROP (42P13 again), done with the full discipline: ACL captured
(`postgres`, `authenticated`, `service_role`; no anon, no PUBLIC), restored by
name, anon and PUBLIC both revoked by name, comment re-attached, every one of
those asserted in the same migration.

### The negative tests, each with a live control

- **S1** As editor, `board_cards` returns **0 rows**, `payments` 0, and
  `payment_payouts` 0 — while `board_for_editor()` returns **33 rows in the same
  transaction**. The control matters: a role switch that silently broke the
  session would return zero from everything and look like success.
- **S2** Every admin function REFUSED with `BOARD_ACCESS_NOT_ENABLED`, named
  individually: `payments_for_session`, `expenses_for_session`,
  `card_economics_for_session`, `payout_summary_for_session`,
  `payouts_for_session`, `career_totals_for_session`, `archived_for_session`, and
  also `board_for_session` and `released_for_session`. Control: `board_for_editor`
  still returned 33 in the same transaction.
- **S3** 33 rows, and the response carries exactly seventeen keys with
  **no `pfh_rate`, `payment_type` or `narrator_share_percent` key at all** —
  asserted on key ABSENCE, both in SQL via `jsonb_object_keys` and against the
  real PostgREST payload. Control: `word_count` present.
- **S4** As admin, everything works exactly as before: payments 25, expenses 21,
  economics 33, payout summary 1, payouts 9, career totals 1, archived 1, board
  20, released 12, direct `board_cards` 34. All four standing checks green.
- **S5** Full ACL audit before and after: every function `anon = false`,
  `public_execute = 0`. The three new ones granted to authenticated and
  service_role only.

**One test of mine was vacuous and had to be redone.**
`card_detail_for_editor` first returned 0 rows, which made "no forbidden keys"
trivially true. The cause was the test, not the function: the subquery resolving
the card id ran AS THE EDITOR, who reads 0 rows from `board_cards`, so the
argument was NULL. Re-run with a literal id it returns 1 row, the right title,
24 keys and none forbidden.

### S6 — client-side filtering exists, and it is NOT the boundary

The Android app has `Capabilities.canViewFinancials`, and the UI honours it:
`BoardCardItem` drops the rate line, `CardDetailScreen` skips the whole Money
field group. But `board_for_session()` returns `pfh_rate`, `payment_type` and
`narrator_share_percent` in its payload regardless — the app hides fields it has
already been given. That is presentation, not a boundary, and it is exactly why
`board_for_editor()` exists.

The WEB has no client-side financial filtering at all, and no role concept: it
gates on a single shared admin cookie and reads everything through the
service-role key. `canUseWebAdmin` is already false for editors for that reason.

### E1e — routing, and the decision it reopens

`BoardRepository` carried a deliberate note: *"There is deliberately no role
dispatch left in the read path. Choosing the relation from a cached role is what
produced the bug, so the client no longer chooses; the server refuses."*

A second role brings dispatch back, because the two roles genuinely read
different relations. What makes it safe is that the dispatch is a HINT and not
the boundary, and the two directions are not symmetric:

- a stale ADMIN calls `board_for_session()` and **the server refuses** — loud and
  closed, exactly as before;
- a stale EDITOR calls `board_for_editor()` and succeeds minus the money columns
  — an admin loses columns, and nothing leaks.

`UNKNOWN` calls nothing at all. There is **no fallback**: a refusal is not caught
and retried against the editor relation, because that would turn a routing bug
into a quietly narrower board — bug 6 wearing a new coat. `BoardReadRoutingTest`
asserts all four cases, the no-retry one included.

The role is PASSED IN rather than cached in the repository, so the choice is
visible at the call site.

Also corrected: a comment in `BoardViewModel` claiming *"only an admin gets rows
out of board_for_session(), so a successful read is the server itself saying this
session still is one."* A successful read no longer proves ADMIN — an editor
succeeds against her own relation. What it still rules out is a session that has
lost the role it is acting as, which is the case bug 6 missed.

### Not done, and why

- **Dean creates the editor account himself.** Every test above ran against a
  synthetic editor inserted into `auth.users` and `profiles` inside a
  transaction that was ROLLED BACK. No account was created and no password was
  asked for.
- **`card_detail_for_editor` omits `notes`,** and that is a judgement rather than
  a rule. `notes` is free text that has carried rate remarks before now — one
  card literally reads "No PFH rate recorded" — so it is left out until Dean
  decides an editor should see it.
- **The detail screen is not yet routed by role.** — DONE the same day, see the
  section below. Both reads now route, with no fallback in either.
- **`SupabaseKeySpikeTest` fails, and it failed before this stage** — RESTATED
  the same day once Dean confirmed the new behaviour is the intended one. The
  suite is green: 291 tests, 0 failures.

---

## T — the detail read routed, and a stale assertion restated (2026-08-29)

### T1 — both reads now route, and two corrections came from the consumer

`card_detail_for_editor` is wired for editor sessions, with the same
hint-not-boundary treatment as the board: a stale ADMIN calls `card_detail()` and
the SERVER refuses; a stale EDITOR gets the narrow card; UNKNOWN calls nothing.
No fallback, and `BoardReadRoutingTest` now pins nine cases including both
no-retry ones.

Two problems surfaced by reading the CONSUMER rather than the function, and both
needed a DROP to fix:

- **`updated_at` was returned but `CardDetailDto` has no such field**, and
  `card_detail()` does not return one either. Whether the decoder tolerates an
  unknown key is not established anywhere in this project, and a key the DTO has
  never seen is not the thing to find that out on. Removed; the editor shape is
  now a strict SUBSET of the admin shape, asserted by comparing the two
  functions' output columns — 23 columns, every one present in `card_detail`,
  none financial.
- **The parameter was `p_card_id` while `card_detail` takes `p_id`.** Renamed, so
  the dispatch chooses a function NAME and nothing else. A dispatch that also has
  to remember a different argument name per branch is a second thing to get
  wrong, and a test now pins that they match.

Both DROPs followed the discipline: ACL captured verbatim, restored by name, anon
AND PUBLIC revoked by name, comment re-attached, all asserted in the migration.

### T2 — the spike test restated rather than deleted

It asserted an anonymous read returns an EMPTY LIST. Since the `board_cards`
revoke it returns `42501 permission denied`, and **the new behaviour is the
deliberate one**: a silent empty result meaning "you are denied" is
indistinguishable from one meaning "there is nothing here", and this project has
already paid for that ambiguity once — bug 6 was a demoted session receiving zero
rows with HTTP 200 and rendering them as an ordinary empty board.

The reason is now IN the test, with an explicit instruction not to change it
back: restoring the old assertion would require re-granting `anon` SELECT on
`board_cards`, so the test would be asserting that the database leaks rows to
anonymous callers, dressed as a passing check.

The spike's actual question still gets answered. A REJECTED key comes back 401
before Postgres sees the request; an ACCEPTED one reaches Postgres, is authorised
as `anon`, and is refused by grants. So `42501` is positive evidence for the key,
and the test asserts both halves — permission denied, and NOT a 401 — rather than
accepting any failure at all.

**The Android suite is now 291 tests, 0 failures, 0 errors.** It was 285 of 286
with this one red.

---

## U — signed release builds and distribution (2026-08-29)

The first release build ever made for this app. Before this, `assembleRelease`
produced an unsigned artifact and there was no signingConfig at all.

### U1 — signing, absent-not-fatal

`signingConfigs.release` reads `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`
and `KEY_PASSWORD` from the git-ignored local.properties, the same file the
Supabase keys already come from. Absent does NOT fail configuration, following
the precedent already in that file: a fresh clone still configures, debug still
builds, and `assembleRelease` still produces an artifact — an UNSIGNED one.

The signingConfig is only CREATED when every part is present. A half-configured
one fails at task execution with a message about a null password, which reads as
a Gradle bug rather than as "you have not set up signing". `requireReleaseSigning`
names exactly which properties are missing and says that unsigned local builds
are deliberate and only publishing is blocked.

### U2 — versionCode derived, and not trusted

`git rev-list --count HEAD`, currently **42**, checked against a floor recorded
in the checked-in `version.properties` (`lastPublishedVersionCode=0`). The
publish tasks refuse unless the derived number strictly exceeds it, because Play
rejects a duplicate or lower versionCode permanently and a burned number is
burned for the life of the app.

When git cannot answer, the build still works — floor plus one, so the artifact
installs — but the publish tasks REFUSE, because a number that cannot be derived
reproducibly cannot be checked for monotonicity either. The guard's message says
explicitly not to raise the floor to make a failure pass.

### U3 — the Gradle plugin does not work here, so the CLI does

`com.google.firebase.appdistribution:5.1.1` FAILS TO APPLY on this project:
`Extension of type 'AppExtension' does not exist`. It reaches for AGP's legacy
variant API, which AGP 9 removed — and this build file already carries notes
about AGP 9's other removals. Pinning AGP back to keep a distribution plugin
happy would be the tail wagging the dog.

`publishToFirebase` drives `firebase appdistribution:distribute` instead. Same
one-command result, and it couples nothing: no plugin, no Firebase SDK, nothing
in the binary. It resolves `firebase.cmd` on Windows, and when `FIREBASE_APP_ID`
is missing it says so AND points at the signed .apk it already built, so the
artifact is never lost to a configuration gap.

### U4 — both artifacts

`bundleForPlay` (signed .aab) and `assembleForFirebase` (signed .apk), each
gated on both guards. App Distribution does not take an .aab, which is why both
exist rather than one.

### U5 / U9 — the guard, and the two ways it was wrong first

`*.jks` and `*.keystore` were ALREADY in .gitignore; only `keystore.properties`
was genuinely new. `ReleaseSecretsGuardTest` asks git what is TRACKED, which is
the only question that matters — a .gitignore does not untrack anything already
added, and `git add -f` walks past it.

**The guard did not fail when it should have.** With a fake keystore and a
`KEYSTORE_PASSWORD=hunter2` file both staged, the run reported 3 tests / 0
failures. The test task was UP TO DATE: staging files changes nothing Gradle was
watching, so the guard silently did not run — the identical failure this build
file already documents for `CredentialDestructionGuardTest`. `--rerun-tasks`
forced it and it correctly found both. Fixed by declaring `.git/index` as a test
input, since that is what changes when something is staged. Re-verified WITHOUT
`--rerun-tasks`: 2 failures with the fakes, 0 after reverting.

**Then the guard caught its own documentation.** A comment reading "a
KEYSTORE_PASSWORD= line was staged" matched, because the pattern allowed
whitespace after the `=` and captured the next word. A real assignment has no
space; the regex now requires none. Correct behaviour for the rule as first
written, and the wrong rule.

### U6 / U7 / U8 — what the release build actually did

- **U8, signature conflict:** installing the signed release over the existing
  debug install failed with `INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package
  com.dmnarration.admin signatures do not match newer version`. Clear, and it
  happens in BOTH directions — `installDebug` later failed the same way against
  the release. Dean will hit this on his phone.
- **U8, signing:** apksigner reports the .apk verified, one signer, APK Signature
  Scheme v2. `jarsigner -verify` reports the .aab verified.
- **U7:** `SUPABASE_URL` and `SUPABASE_ANON_KEY` are both present in the release
  DEX, checked by extracting `classes*.dex` from the built .apk and searching for
  the actual values — not by trusting that the release variant reads
  local.properties the same way debug does.
- **U6:** the signed release installs, launches, and renders the sign-in screen
  with no crash, no `SerializationException`, no Hilt failure. A deliberately
  wrong email and password produced the app's own classified message — **"That
  email and password do not match an account."** — which means the HTTPS request
  reached Supabase, the error response was deserialised, and the app classified
  it, all in a release build.

### A false result I reported to myself and had to withdraw

Mid-verification I observed the release build apparently SIGNED IN and showing
live figures — Payments, Expenses 21, real settings — after a clean install, and
began investigating it as an `allowBackup` leak. It was not. `uiautomator dump`
had silently failed on git-bash path mangling (`/sdcard/ui.xml` became
`/Files/Git/sdcard/ui.xml`), and `adb pull` returned a **stale ui.xml left on the
emulator from a session four days earlier**, when the debug build was signed in.

The tell was that `allowBackup="false"` and the backup manager was disabled, so
the story could not be true. Re-dumping via `adb exec-out` with
`MSYS_NO_PATHCONV=1` showed the real first screen: "DMN Admin | Sign in to see
the board." **A file read from a device is evidence only if this run wrote it.**

### NOT DONE, and what each needs

1. **A real device.** Everything above ran on an emulator. Dean's standing note
   that the emulator will not land a save is about writes; these were reads and a
   launch, but "installs and runs on the emulator" is not "installs and runs on
   his phone".
2. **A successful sign-in and a board load.** Needs Dean's password. The failed
   sign-in proves the auth round trip and the deserialisation; it does not prove
   the board renders.
3. **An editor-role session reaching `board_for_editor`.** Needs the editor
   account, which Dean creates himself.
4. **The real upload key.** Signing was verified with a THROWAWAY keystore
   generated outside the repo, used once, and deleted; local.properties was
   restored and `requireReleaseSigning` fails again as it should. **Dean must
   generate the real upload key himself and it must never leave his machine** —
   whoever holds it controls every future update, and Play binds the app to it.
5. **A Firebase project, app id and tester group.** `publishToFirebase` is wired
   and refuses cleanly until `FIREBASE_APP_ID` exists.
6. **`lastPublishedVersionCode` stays 0** until something is genuinely published.
   Update it in the same commit as the release that went out.

---

## V — the first real signed release, and a distribution that went out (2026-08-29)

Dean supplied the real upload key, the Firebase project and the tester group.

### V1 — unsigned is now a build failure, not an artifact

The U stage left `assembleRelease` producing an unsigned artifact deliberately,
with only the publish tasks refusing. That is the wrong place for the refusal: an
unsigned .aab looks finished and is rejected by Play much later, by which time
the cause is nowhere near the effect. `assembleRelease` and `bundleRelease` now
depend on the signing gate.

Configuration is still absent-not-fatal. Verified BOTH ways by removing the four
keys from local.properties and restoring them: release failed with the missing
key names listed, debug built normally.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` confirmed present in the release DEX of
the actual shipped .apk, by extracting `classes*.dex` and searching for the real
values — because "they are in defaultConfig so they should be there" is not
evidence.

### V3 — the CLI, and why

The Gradle plugin was tried first, as instructed, and **fails to apply on this
project**: `Extension of type 'AppExtension' does not exist`. It reaches for
AGP's legacy variant API, which AGP 9 removed. `publishToFirebase` drives the
already-authenticated CLI instead — same one command, no plugin, nothing added
to the binary.

### W — what was verified

- **W1** apksigner: the .apk verifies, one signer, APK Signature Scheme v2.
  `jarsigner -verify`: the .aab verifies. Certificate
  `CN=Dean Miller, OU=Dean Miller Narration, ST=Oregon, C=US`, SHA-256
  `2787a91c64e0c91109ef907812c04c17d3633847357bd25aa434058c08f61f43`.
- **W4** `publishToFirebase` ran end to end: uploaded release **0.1.0 (43)**,
  added release notes, distributed. The group listing then showed `editors` with
  **2 testers and 1 release** — confirmed against the listing rather than against
  the CLI's own success line.
- **W3** The payload boundary, with a positive control: the EDITOR payload
  carries 17 keys and none of `pfh_rate`, `payment_type`,
  `narrator_share_percent`, `royalty_split_percent`; the ADMIN payload from
  `board_for_session()` carries all three. Same query shape, different function.
- **W5** The guard fails on purpose and recovers: 2 failures naming exactly the
  staged fake keystore and the staged password file, 0 after reverting.

### THE PREVIOUS STAGE'S TEST COUNT WAS WRONG, AND THIS IS THE CORRECTION

`ReleaseSecretsGuardTest` carried a literal `KEYSTORE_PASSWORD=<value>` example
inside its own doc comment. While the file was UNTRACKED, `git ls-files` could
not see it and the guard passed. The moment it was committed, the guard matched
its own documentation and went red on a clean tree — and the "294 tests, 0
failures" reported at the end of the U stage had been measured in the window
before the commit.

Fixed by describing the shape instead of writing one. **Not** by exempting the
file: a self-exemption is the one hole a guard like this cannot afford, because
this is precisely the file someone would paste a real password into while
"testing the guard". 294/0 now holds with the file tracked.

### The stale-dump trap, caught a second time

Reading the device again produced a screen showing a sign-in error from a
previous run, on a freshly installed app that could not have had it. Same cause
as last time: `uiautomator dump` writes to a fixed path, and reading that path
gives you whatever is there. The discipline that fixes it is to **delete the file
first and confirm the delete**, so the only thing that can be read is what this
run wrote. Done that way, the real first screen is the clean sign-in screen.

### NOT DONE — and both need Dean

1. **W2 and W3 on a real device, signed in.** Everything ran on an emulator, and
   sign-in needs a password that was deliberately not shared. What IS proven on
   the signed artifact: it installs, launches, renders, and a wrong password
   produces the app's own "That email and password do not match an account" —
   which means HTTPS, Ktor and kotlinx-serialization all work in release. What is
   NOT proven: the board rendering, a card's detail, or the editor's session on
   the phone.
2. **Nothing was uploaded to Play.** The .aab is built and signed and waiting.

### The numbers

- versionCode **43**, versionName 0.1.0, recorded in `version.properties` as
  published to Firebase. Play has burned nothing — the first Play upload also
  enrols Play App Signing, which is Dean's decision to accept.
- `.apk` `D:\Developer\dmn-admin-android\app\build\outputs\apk\release\app-release.apk`
- `.aab` `D:\Developer\dmn-admin-android\app\build\outputs\bundle\release\app-release.aab`

---

## E2 — the editor's write path: typed pickups and editing progress (2026-08-29)

Android and database. The site's half is deferred; see the decisions at the end.

### The shape of the thing

`board_cards` gained `chapters_edited`, `chapters_total`, `editing_completed_at`
and **no editing_status column**. The state is derived: completed_at set is done,
chapters_edited above zero is in progress, neither is not started. A stored
status and a count can disagree — "done" beside 4 of 12 is a row that cannot be
true and would still render. There is one fact, so there is nothing to
contradict.

`pickups` is TYPED. `chapter` is first class rather than part of a location
string, because two features read it: pickups batch per chapter, and E3 names the
email subject from it. A value two features depend on is not a substring.
`kind` is one of misread / noise / sentence / other, and a misread REQUIRES the
said/should_be pair — enforced by a trigger, not by the form, because a typed
form whose types are only enforced in the UI is an untyped table with a hopeful
client. Status is a lifecycle: draft, sent, resolved, dismissed.

Nothing is reserved for audio. E5 adds that when there is somewhere to put a
file; an unused column is a promise the schema cannot keep.

### Every write is an RLS bypass with a gate in front of it

Nine SECURITY DEFINER functions, each naming its columns explicitly. `authenticated`
has no grant at all on `pickups` and no UPDATE grant on the three new board_cards
columns, so the functions are the only route — not the preferred one, the only one.

`update_own_draft_pickup` and `delete_own_draft_pickup` check `created_by =
auth.uid()` **and** `status = 'draft'`. Ownership because an editor changing
someone else's pickup is a bug even while there is one editor — "there is only
one" is a fact about today's data, not a property of the system. Draft because
once sent, the email has gone and the record must stop moving, or it would
disagree with what the narrator was actually asked to do.

`send_chapter_pickups` performs the draft-to-sent transition **and nothing else**.
No email is sent and none is queued. Doing the transition alone means E3 adds a
side effect to a boundary that already exists and is already tested, rather than
inventing both at once.

`resolve_pickup` is admin-gated and only accepts a SENT pickup: resolving a draft
would close something the narrator was never asked about.

### What was verified

- **X1** Whole-row diff as the editor: `set_editing_progress` changed
  `chapters_edited`, `chapters_total` and `updated_at` — the last by the
  pre-existing touch trigger, not by the column list. Title, status, pfh_rate,
  word_count and every other column unchanged. A definer UPDATE is only as narrow
  as its column list, and a whole-row diff is the only thing that catches a list
  wider than intended.
- **X2** Named attempts: direct UPDATE of `chapters_edited` refused outright;
  direct SELECT/INSERT on `pickups` refused; a bogus `kind` refused; a pickup
  with no chapter refused; every financial read refused.
- **X3** `resolve_pickup` as the editor: `BOARD_ACCESS_NOT_ENABLED`.
- **X4** `update_own_draft_pickup` against (a) Dean's draft and (b) her own SENT
  pickup — both refused, as was deleting her own sent one.
- **X5** `kind = 'misread'` without `said` and without `should_be` — both refused
  AT THE DATABASE, each naming which half is missing. "Invalid misread" would be
  true and useless.
- **X6** `board_for_editor` after the DROP+CREATE: 33 rows, no `pfh_rate`,
  `payment_type`, `narrator_share_percent` or `royalty_split_percent` KEY at all,
  asserted on absence; `is_confidential` and the three new columns present.
- **X7** Full ACL audit before and after. The only anon-executable functions are
  the same seven inert trigger functions as the baseline; no new function is
  reachable by anon.
- **X8** Admin unchanged across every function, plus the new ones.
- **X9** Every new definer function calls its gate before touching anything —
  and the check was PROVED NON-VACUOUS against a probe whose gate comes last,
  which it correctly reports as a failure.

Money reconciles and the standing grant guard passes; the stage touched
`board_cards`, so both were re-run.

### One asymmetry worth knowing about

A direct `update board_cards set pfh_rate` as the editor is not refused — it is
RLS-filtered to zero rows. `authenticated` holds a column-scoped UPDATE grant
covering `pfh_rate`, `payment_type`, `narrator_share_percent`,
`royalty_split_percent`, `title` and `word_count`, for the ADMIN's writes from
the phone, and RLS is what stops the editor.

The three new columns are granted to nobody, which is why the same attempt on
`chapters_edited` IS refused outright. For the financial columns the barrier is
one layer, not two — which is exactly why E1's rule that no RLS policy may be
added for editors matters as much as it does.

### E2e — decisions taken here and NOT acted on

Recorded because a decision taken and not written down gets made again,
differently. This is the narration_format lesson.

1. **The site's pickup UI is DEFERRED until after the web auth migration, not
   dropped.** The database half is deliberately surface-neutral: no column, gate
   or function assumes a phone, so the site needs no schema work when it comes.
2. **`dmn_admin_key` will be RETIRED ENTIRELY at the end of that migration, not
   kept as a fallback.** A shared secret that still works reads as `service_role`
   regardless of role, so it bypasses every boundary E1 and E2 build. A fallback
   that bypasses the thing it falls back from is not a fallback.
3. **The text columns here are STAGED, not shortcuts.** E3 hangs the email on
   `send_chapter_pickups`; E4 and E5 add OneDrive filing and audio; E6 turns
   `assigned_to` into a real reference. `assigned_to` is text today because the
   18 co-narrators exist as names and not as users, and a uuid referencing a
   table with no rows for them is a migration later.

### Not verified

The Android UI compiles and its logic is unit-tested (305 tests, 0 failures), but
**no part of it has been exercised on a device**. Sign-in needs a password that
was deliberately not shared, so the editor's form, the narrator picker, the
per-chapter Send and the admin's resolve have not been seen working against the
real functions. The database side of every one of those is tested directly.

---

## Y — pinning the policy set and narrowing the financial grant (2026-08-29)

E2 ended by reporting an asymmetry: a direct write to `pfh_rate` as the editor
was not refused, it was RLS-filtered to zero rows. One layer, and a failure that
looked like success. This closes it, on those four columns only.

### Y1 — the policy set is pinned, and the guard was wrong first

`board_cards_policy_audit()` returns every RLS policy on the table with a flag
for any that admits a non-admin WRITE, and `npm run check-board-policies` pins
the SET as well: a new policy fails the check even if the audit thinks it is
safe, because a new write policy on this table is a decision somebody should have
to state out loud.

**The first version was broken, and how that was caught is the lesson.** It
matched the policy expression's FORMATTING, and flagged the correct "Role update"
policy — whose text carries an ` AS current_app_role)` that the planner inserts
between the call and the comparison. The MUTATION TEST PASSED: the bad policy was
flagged. Mutating alone would have shipped a guard that was permanently red on a
correct database, which teaches whoever sees it to ignore it. **The baseline run
is what caught it.** A guard must fire on the bad state AND stay quiet on the
good one; checking only one of those is half a test.

Rewritten to ask a semantic question — does the expression pin the app role to
admin, and name no other role — it is quiet today and fires on both realistic
widenings, each proved in a rolled-back transaction:

| mutation | flagged |
|---|---|
| a permissive editor UPDATE policy added | `Editor update (UPDATE)` |
| the existing `Role update` loosened to `true` | `Role update (UPDATE)` |

### Y2 — the phone DID edit those four, so the revoke was not free

Checked before changing anything, as asked. All four columns are declared as
editable fields in `CardFields.kt` (Money group, behind `canViewFinancials`), and
`save(column, raw)` builds a one-column patch straight to PostgREST. So the
revoke needed a reroute, and got one.

`set_card_financial(p_card_id, p_column, p_value)` is admin-gated and names the
four columns in STATIC assignments — `p_column` selects between them and never
becomes SQL. The UPDATE grant on those four is revoked from `authenticated`. The
other 24 columns keep the direct path deliberately: this is two layers where one
was not enough, not a refactor of every write in the app.

**THE CHANGE IN FAILURE MODE IS THE VERIFICATION:**

| attempt, as the editor | before | after |
|---|---|---|
| `update board_cards set pfh_rate` | `ACCEPTED, 0 rows` | `REFUSED [42501] permission denied` |
| `update board_cards set title` | `ACCEPTED, 0 rows` | `ACCEPTED, 0 rows` — unchanged, by design |

As the admin: all four write through the function, a non-financial column name is
refused by name, and the direct path to `pfh_rate` is now refused for him too —
which is exactly why the phone needed rerouting rather than just revoking.

### Y3 — the controls, because this touches the table every figure reads

Money reconciles across all 33 cards. rs_plus and card-payout branch checks
green. The grant guard passes. The policy check passes. `authenticated` retains
SELECT and 24 of 28 UPDATE columns — exactly the four removed and nothing else.
The only anon-executable functions remain the inert trigger functions, now eight
with `check_pickup_shape`.

305 Android tests, 0 failures.

---

## E3 + E4 — narrators, the pickup email, and filing to OneDrive (2026-08-30)

### E3a — narrators, seeded and counted independently

19 rows: the 18 distinct co-narrator names on unarchived cards, plus Dean. Z1
compared the seeded set against the source set in BOTH directions rather than
trusting the parse to agree with itself — nothing in the source is missing, and
the only extra is Dean. **No email address was invented**; every one is null
until Dean fills them in. No `profile_id` is set: that is the column E6 fills.

The parser handles both storage shapes, though worth recording: **all 31 rows are
JSON arrays today and none is bare text**, because J7 normalised them. The bare-
text branch is now defensive rather than exercised.

The TABLE is admin-only. An editor reads it through `narrators_for_editor()`,
which returns id, name and active and **omits email and notes from the return
type** — the same boundary shape as `board_for_editor()`.

### E3b — assigned_to became a real reference

**Row count before converting: 0.** Reported first, as asked, and that is what
made this free — in E6 it would have been a data migration.

### E3c/E3d/E4 — the sender

A Supabase Edge Function, not a Next.js route: the phone can call it today with
the user's JWT and the site will call the same function after the auth migration.

The order is the point, and it is written in that order — verify, gather, email,
THEN transition, then file. Two guarantees that fail in OPPOSITE directions:

- a failed EMAIL leaves everything DRAFT (nothing was delivered, so nothing is
  marked delivered);
- a failed MANIFEST leaves everything SENT with `manifest_path` null (the email
  is the delivery, the manifest is the record, and null is visible and
  retryable).

`send_chapter_pickups` gained an optional narrator filter, and it was REQUIRED
rather than convenient: a narrator with no email is skipped and reported, and
moving their pickups anyway would mark them sent with nobody told — the original
failure one level down.

### E4a/E4b — what Graph actually does, observed rather than assumed

Probed against the live API before the filer was written around either belief:

1. **Graph DOES create missing intermediate folders on upload** — a PUT three
   levels deep with no parents returned 201 and created them. So nothing
   pre-creates the tree.
2. **An unsanitised colon fails**, with
   `400 BadRequest "Resource not found for the segment 'root:'"` — an error that
   reads like a bad path rather than a bad character, which is exactly how an
   afternoon disappears.
3. App-only auth reaches the drive at `/users/Dean@DMNarration.com/drive`.

**Z6, for real:** `Heaven's Gate: Greed` filed to
`Pickups/Heaven's Gate- Greed/Veronica Moore/3 - pickups.txt`, then read back —
the file's CONTENTS carry the original title, colon intact; only the path segment
is sanitised. The mapping is fixed (forbidden characters to hyphen, collapse
whitespace, trim, strip trailing periods) and the result is RECORDED in
`board_cards.pickups_folder` on first use, because both inputs can move: the
sanitiser could be changed and the title itself can be edited, and either would
silently produce a second folder holding half the manifests.

### Its own token function

The filer does NOT reuse `graphToken()` in `src/lib/microsoft-graph.ts`. That one
is delegated auth — a stored refresh token, scope `Mail.Read offline_access`,
calling `/me/` — with no drive scope, and reusing it fails in a way that looks
like a bad path rather than a wrong credential. The filer is app-only
client_credentials, and app-only has no "me".

### Z8 — the environment is isolated

The only variables the new code reads are `PICKUPS_*` and the `SUPABASE_*` pair
Supabase injects. `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `MICROSOFT_*` appear
nowhere in it except in the comment saying they must not. `AZURE_*` is avoided by
name for the stated reason, and **`@azure/identity ^4.13.1` is confirmed to be a
real dependency**, so that hazard is not hypothetical.

`notify-payment.ts` is byte-identical — unchanged since an earlier commit — and
still compiles. **I did not RUN it**: `notifyPaymentReceived` sends a real
"Payment received — $X" email to Dean, and fabricating one in his inbox to prove
a module loads is not a trade worth making. Its rendering functions and its env
reads are intact and the build compiles it.

### Z9 — the guards

Money reconciles across all 33 cards. The grant guard passes. The policy guard
passes on a clean tree AND still fires on a widened policy — both halves, again.
No new function is anon-executable; no anon grant exists on `narrators` or
`pickups`; the four financial columns remain narrowed.

### NOT DONE — and precisely why

1. **The Edge Function is written but NOT DEPLOYED.** There is no
   `SUPABASE_ACCESS_TOKEN` and the CLI is not logged in, and logging in is
   interactive and Dean's to do.
2. **`PICKUPS_RESEND_API_KEY` and `PICKUPS_FROM_ADDRESS` are not set anywhere.**
   The three `PICKUPS_GRAPH_*` are; these two are not.
3. **So Z3, Z4, Z5 and Z7 could not be run.** They all need the deployed function,
   and Z3/Z5 additionally need a working Resend key to produce a successful send
   to fail *after*. Z4 in particular — the ordering guarantee, and the one Dean
   called most worth proving — is currently argued from the code's structure and
   NOT demonstrated. That is the largest untested claim in this stage and should
   be run first once the function is deployed.
4. **Nothing has been exercised on a device.**

---

## W1 — Supabase Auth on the website, alongside the shared secret (2026-08-30)

Additive. `dmn_admin_key` is untouched and still carries every request; the
Supabase session is new and grants admin on its own. **No database changes at
all** — nothing was sent to `apply_migration`, which is what V7 asks for.

### What was added

`@supabase/ssr`, three clients (browser, server, and an edge-safe middleware
refresher), and session helpers exposing: is there a user, what is their
`profiles.role`, and a user-scoped client. Plus an email/password form on
`/admin/login` beside the key form, with its own separate error state — one box
saying "that did not work" for two independent mechanisms is exactly how a broken
new path hides behind a working old one.

### The gate that was NOT in the plan, and how it surfaced

Signing in with an account landed on `/board`, and `/payments` then redirected.
The tell was the redirect URL: **no `?next=` parameter**, which the middleware
always sets — so it was not the middleware refusing. It was
`require-admin.ts`, the server-component gate, which knew only the cookie.
`/board` does not call it; `/payments` and `/settings` do.

Had the new path been checked on one route it would have looked finished. It was
fixed at `isAdminRequest()`, the single function backing `assertAdmin`,
`requireAdmin` and `isAdminOrInternal` — so teaching it once taught all three.

### Verified

| | |
|---|---|
| **New path alone** (session cookies, no key) | `/board` `/payments` `/settings` `/released` `/expenses` all **200** |
| **Old path alone** (key, no session) — V3 | `/board` `/payments` `/settings` all **200** |
| **Neither** — V5 | **307** to `/admin/login?next=…`, as before |
| **Editor session** — V2 | session real, `profiles.role` = `editor`, and **307** everywhere |
| **Public** — V4 | catalogue and both book pages 200, `/api/books` **32 items**, no financial keys, no format pills |
| **V7** | ACL unchanged, **0 migrations** |

**V6, in its strong form.** A throwaway account was signed in, its role read
`editor`, then `profiles` was changed to `admin` **without issuing a new token**
— and the same live session immediately read `admin`. A JWT claim could not do
that. This is why the role is read from `profiles` and never from a claim:
`current_app_role()` is literally `select role from profiles where id =
auth.uid()`, so profiles is the only source that can agree with what the database
will actually allow. She also saw exactly one row in `profiles` — her own.

Both throwaway accounts were deleted; only Dean and Marizete remain.

### Two things I got wrong on the way

1. **A silent no-op reported as success.** The login-form edit did not apply —
   wrong indentation in the anchor — and the script printed a hardcoded success
   line anyway. `tsc` passed because the file was still valid. Caught only when
   the browser could not find the email input. Every replacement in the redo
   asserts its anchor.
2. **The previous stage left `tsc` broken.** The Deno Edge Function was being
   typechecked by the project's TypeScript. I missed it because I grepped the
   compiler output for a filename instead of reading it. `supabase/functions` is
   now excluded, and `tsc` is clean.

### NOT DONE

**V1 and V2 with the real accounts.** Dean's and Marizete's passwords were not
shared, so both were proved with throwaway accounts carrying the same roles. That
tests the mechanism, not their specific credentials — signing in as himself once
is the remaining check, and it is a minute's work.

### The standing risk, named

While both paths are live, a broken Supabase path is invisible to any browser
holding the cookie. That is inherent to a migration nothing has to cut over for.
It is why the new path was proved with **no cookie present at all**, and it is
why `dmn_admin_key` is retired entirely at the end rather than kept as a
fallback: a shared secret that still works reads as `service_role` regardless of
role, and would bypass every boundary E1 and E2 built.

---

## R5 + R6 — the three-state login and the display name (2026-08-30)

Done ahead of the shared-secret login removal, because neither depends on it and
both reduce the risk of doing it.

### R5 — three states, not two

`/admin/login` is now a server component that reads the session BEFORE rendering:
no session gives the form, a session with the wrong role gives a page naming the
account and its role, and an admin is sent straight on to `?next=`.

The middle state stopped being cosmetic the moment the shared secret stopped
being a way in. An editor who signs in correctly and is bounced back to a login
form has been told, as far as she can tell, that her password is wrong — the
screen is identical either way.

The sign-out control is not decoration: without it a wrong-role session has no
exit, because the admin routes bounce her to this page, this page is not an admin
route so it does not bounce her back, and re-entering correct credentials signs
the same account in again. **Verified that it actually ends the session** — zero
session cookies with a value remain afterwards, and the page returns to the form.

### R6 — and the regression it caused

`display_name` was `''` for Marizete; set to "Marizete", with
`check (length(btrim(display_name)) > 0)` so NOT NULL stops meaning "not null but
possibly meaningless".

**That constraint immediately broke account creation.** `handle_new_user`
inserted `(id)` alone and let `display_name` fall to its default of `''`, so every
new signup failed with "Database error creating new user". Found by trying to
create one; it would otherwise have surfaced the next time Dean added somebody.

**That trigger is also how Marizete's row got a blank name.** It has always
created profiles with no name and relied on something later filling it in, and on
30 August nothing did. The trigger now seeds the name from the email's local part
and the column default is dropped — a default that violates its own constraint is
a trap for the next inserter. Fixing the trigger fixes the cause; the constraint
only stopped the symptom being storable.

### S7 — the audit found doors R1 alone would not close

`isAdminRequest()` is not the only cookie check. Three route handlers compare the
cookie themselves:

- `src/app/api/inquiries/route.ts` — twice, `cookie !== ADMIN_SECRET_KEY`
- `src/app/api/email-scan/route.ts` — `isValidAdminKey` on the cookie directly
- `src/app/api/debug-env/route.ts` — reads the cookie

Removing the check from `isAdminRequest()` would leave all three accepting the
old credential. They are logged here so the removal covers them.

---

## R1–R4 — the shared-secret LOGIN retired (2026-08-30)

Email and password is now the only way into a browser. **ADMIN_SECRET_KEY
remains** and is still required: it is the internal service-to-server bearer, and
removing it breaks the manuscript parse chain silently.

Done only after Dean confirmed the prerequisite — signed in incognito with no
`dmn_admin_key` cookie and reached /payments. Until that was confirmed the
removal was held, because while the cookie works it masks a broken session path,
and the failure mode of getting this wrong is Dean locked out of his own admin.

### S7 found three doors that R1 alone would have left open

`isAdminRequest()` was not the only cookie check. `api/inquiries` compared the
cookie itself, twice; `api/email-scan` had its own copy of the comparison; and
`api/debug-env` read the cookie directly. Removing the check from one function
would have left all three accepting a credential nothing else honoured. All now
ask the same question every admin surface asks.

`api/debug-env` also returned the Anthropic key's length and first ten
characters, directly contradicting its own comment — "checks env vars are present
without exposing values". Presence only now.

### Four things the verification caught that the plan did not

1. **The new constraint broke account creation.** `handle_new_user` inserted
   `(id)` alone and let `display_name` fall to its default of `''`, so every new
   signup failed with "Database error creating new user". That trigger is also
   how Marizete's row got blank in the first place. It now seeds the name from
   the email's local part, and the column default is dropped — a default that
   violates its own constraint is a trap for whoever inserts next.
2. **The stale-cookie clear never ran on a redirect.** `NextResponse.redirect()`
   builds a DIFFERENT response object, so the clear at the end of the middleware
   never touched it — and a redirect is exactly when a stale-cookie holder
   arrives. Found by looking for the `Set-Cookie` header rather than trusting
   that calling the helper once was enough.
3. **The admin UI's sign-out only cleared the cookie.** `useLogout` POSTed to
   `/admin/logout` and nothing else. Left alone it would have kept clearing a
   cookie nothing reads while the session that actually grants access survived —
   a button that looked like it worked. It signs out of Supabase now.
4. **`isValidAdminKey` was deleted, not left dead.** While it existed, adding a
   cookie check back was one import away.

### Verified

| | |
|---|---|
| **S1** admin session | `/board` `/payments` `/settings` `/released` `/expenses` `/api/inquiries` `/api/debug-env` all **200** |
| **S2** valid key, no session | all **307**; the API routes **401**; `/api/admin/login` **404**; `Set-Cookie: dmn_admin_key=; Max-Age=0` |
| **S3** parse chain | uploaded a manuscript end to end; log shows `/process` parsed and `/extract` completed, status `ready`, chapter row created |
| **S4** editor | no-access page naming her and her role, sign-out present, and **zero session cookies remain** afterwards |
| **S5** constraint | empty, whitespace and blank-insert all refused; a real name accepted |
| **S6** public | catalogue and both book pages 200, 32 items, no financial keys, no format pills |

S3 was run against **localhost**, not production. `baseUrl` falls back to
`https://www.dmnarration.com` when `NEXT_PUBLIC_SITE_URL` is empty — which it is
locally — so a naive local test would have fired the parse chain at the live
site. The variable was pointed at localhost for the test and restored after.

The probe manuscript and every throwaway account were deleted; profiles are back
to Dean and Marizete, and no chapters were orphaned.

### Still on ADMIN_SECRET_KEY, and correctly

- `require-admin.ts` — `isAdminOrInternal` and `internalAuthHeaders`, the bearer.
- `actions/resetStats.ts` — a server action that takes the secret as an argument.
  Not a cookie login and not reachable from the UI, so left alone and noted.

---

## T1–T4 — every new account was silently an editor (2026-08-30)

`public.profiles.role` had `DEFAULT 'editor'`, and `handle_new_user` inserted only
`id` and `display_name`. E1 had turned `'editor'` into a real grant covering the whole
board — the card detail, the narrators, the pickups. So every account that came into
existence was granted the board on creation.

**Nothing changed to cause this.** The default was written when `'editor'` was an
inert string. E1 gave the string meaning months later and never touched the line. That
is the whole shape of it: no diff, no migration and no review went anywhere near the
code that was responsible.

### T1 — the default now names a role no gate admits

Migration `new_accounts_default_to_no_access`:

- `profiles_role_check` widened to `admin | editor | pending`.
- `alter column role set default 'pending'`.
- `handle_new_user` now names the role **explicitly** as `'pending'`, so the trigger is
  correct even if the default is changed again. This is what made the guard's first
  version insufficient — see below.

`'pending'` over `'none'` because it says what the state *is*: an account waiting for
Dean to assign it, not an account that was denied.

### Verified by simulation, not by reading the default

In a rolled-back transaction, an `auth.users` row was inserted and the profile the
trigger produced was read back: `pending`. Then, as that user:

| called | result |
|---|---|
| `board_for_editor` | REFUSED: BOARD_ACCESS_NOT_ENABLED |
| `board_for_session` | REFUSED: BOARD_ACCESS_NOT_ENABLED |
| `card_detail_for_editor` | REFUSED: BOARD_ACCESS_NOT_ENABLED |
| `pickups_for_editor` | REFUSED: BOARD_ACCESS_NOT_ENABLED |
| `narrators_for_editor` | REFUSED: BOARD_ACCESS_NOT_ENABLED |
| `card_economics_for_session` | REFUSED: BOARD_ACCESS_NOT_ENABLED |
| `set_editing_progress` | REFUSED: BOARD_ACCESS_NOT_ENABLED |
| `create_pickup` | REFUSED: BOARD_ACCESS_NOT_ENABLED |
| `select * from board_cards` | ACCEPTED, **0 rows** |

The last line is the one to keep. RLS returns *nothing* rather than refusing, so a
direct read looks like an empty board. That is why the gates raise instead of
filtering, and why the refusals above are the actual evidence.

### T2 — public signup is DISABLED

`POST /auth/v1/signup` with the anon key returns `422 signup_disabled`, "Signups not
allowed for this instance". Asked empirically rather than read off the config, because
what matters is what the endpoint does.

This bounds the damage: nobody could self-register into the grant. Every account had to
be created by Dean. It does **not** make the bug theoretical — every account he *did*
create, for any purpose, became an editor, and the fix is unchanged.

### T3 — the guard, and the hole proving it exposed

`public.role_default_audit()`, run by `npm run check-new-account-role` and as a step in
`reconcile.yml`. The admitted set is **derived from the bodies** of
`assert_board_access` and `assert_editor_access` rather than hardcoded, so a third gate
that admits the default starts failing this without anyone remembering to update a list.

The first version checked the column default alone. Setting the default back to
`'editor'` in a rolled-back transaction made it go red — the mutation test passed. It
was still wrong, and the same run said so: the simulated signup came out `'pending'`
anyway, because `handle_new_user` now names the role and overrides the default. **A
guard that can go red while the system is safe can also stay green while it is not.**

Rewritten to check both producers, then mutated separately against each:

| scenario | default check | trigger check |
|---|---|---|
| live state | ok `pending` | ok, names no admitted role |
| default set back to `'editor'` | **FAIL** | ok |
| trigger inserts `'editor'`, default left `'pending'` | ok | **FAIL** |

Each mutation fires its own check and leaves the other green, so neither check is
carrying the other. Both mutations were rolled back; `handle_new_user` was confirmed
afterwards to be the real one and still attached to `auth.users`.

The script additionally fails if the derived admitted set comes back **empty** — with
no gates found, nothing can be "a role a gate admits" and every check below would pass
vacuously — and if the audit stops reporting either producer.

### T4 — the two existing accounts are unaffected

Dean `admin`, Marizete `editor`. Neither relied on the default, and neither moved.

### Residual gaps, stated

1. **The script's own FAIL branch is proven through the audit, not end to end.** The
   audit was mutated in a rolled-back transaction and returns `ok = false` for each
   producer; the script's remaining logic is a count. Running the script itself against
   a failing state would mean mutating production outside a transaction, which is not
   worth it for a branch this thin.
2. **`process.exit()` mangles the exit code on Windows.** After a `supabase-js` client
   exists, exit triggers `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and
   the code becomes 127 regardless. This affects **every** check script here, not just
   this one, and predates it. It fails safe — a pass also exits non-zero locally, so
   the error is a false alarm, never a false pass — and CI runs ubuntu, where it does
   not occur. Judge a local run by its output, not its exit code.

---

## U1–U3 — the header still had the shared-secret login (2026-08-30)

Five rapid clicks on the brand opened a modal that POSTed the shared secret to
`/api/admin/login`. The route was deleted in R1, so it was dead — the fetch 404s and
no cookie is set — but Dean hit it trying to sign in, which is cost enough.

### Why S7 missed it

S7 grepped for `ADMIN_SECRET_KEY`, `ADMIN_COOKIE_NAME` and `isValidAdminKey`.
`Header.tsx` contains none of them. It was a **client that knew only the address**:
the string `"/api/admin/login"`.

**A search for a mechanism's identifiers does not find the callers that know only its
URL.** Identifiers find the implementation and everything that imports it. Callers that
address a route by string literal are invisible to that search, and they are exactly the
things left behind when a route is deleted — because deleting the route is what makes
them harmless enough to stop erroring loudly.

### U1 — removed

State, refs, `handleSecretAdminTrigger`, `submitAdminKey`, the `onClick` on the brand
and the modal. `useRef` and `useRouter` became unused and went with them; the brand is
an ordinary `<Link href="/">` again. 89 lines out, 9 in (the replacement is a comment
saying why it must not come back).

### U2 — kept

`HomeClient.tsx:964`, the invisible link to `/admin/login`. That addresses the login
**page**, which is now email and password. A hidden way to reach the sign-in form is
not part of the old mechanism.

### U3 — S7 re-run, by ROUTE PATH as well as identifier

| searched | live hits | purpose |
|---|---|---|
| `/api/admin/login` | none in code | route deleted in R1; the last caller was this header |
| `isValidAdminKey` | none | deleted in R1 |
| `/admin/login` | `middleware.ts` ×2, `require-admin.ts`, `useLogout.ts`, `SignOutButton.tsx`, `HomeClient.tsx` | all point at the **new** page — redirect targets and entry points |
| `ADMIN_COOKIE_NAME` | `admin-auth.ts` (def), `middleware.ts` ×3 | only to **clear** a stale cookie |
| `dmn_admin_key` | `admin/logout/route.ts`, four comments | clearing a pre-migration cookie, and history |
| `ADMIN_SECRET_KEY` | `require-admin.ts` ×2, `resetStats.ts`, `debug-env` | the internal bearer, correctly retained |

### What the corrected sweep FOUND — three broken callers

`check-first-render.ts`, `check-payments-costed.ts` and `import-payments.ts` all
authenticate by sending `cookie: dmn_admin_key=$ADMIN_SECRET_KEY`. **That credential is
accepted by nothing.** The four routes they call — `/api/studio-settings`, `/api/board`,
`/api/payments/parse-document`, `/api/payments/bulk` — gate on `requireAdmin` /
`isAdminRequest`, which are session-only since R1; `isAdminOrInternal`'s bearer is a
header, not a cookie, and these routes do not use it anyway.

They fail LOUDLY (both checks `process.exit(1)` on a non-200), so nothing has been
silently passing. But two standing guards cannot currently run. Fixing them needs a real
Supabase session, which means a service account and a decision about its credentials —
**not made here.** Neither is in `reconcile.yml`, so CI is unaffected.

### Verified on the live site

Deploy confirmed by scanning the shipped chunks for `"Enter admin key"` — **with a
control**, because "not found" is also what a scan that reached the wrong file returns.
The first attempt reported 0 hits across 1 chunk and was worthless: `dmnarration.com`
redirects to `www.`, and it had scanned a 15-byte redirect body. Following the redirect
found 14 chunks, the control string `"Narrated Works"` in the header chunk, and the
modal string beside it — pre-deploy. Post-deploy: control still 1, modal 0.

Then Playwright against production:

- Five rapid clicks on the brand: no modal, no password input, **no request to
  `/api/admin/login`**, still on the public site. Screenshot taken.
- Control for that check: the clicks provably landed (the brand is a link and the main
  frame navigated). Without it, "nothing happened" is indistinguishable from "the clicks
  missed".
- `/admin/login` serves 200 with an email input, a password input and Sign in, and does
  **not** carry the old `Enter admin key` placeholder.
- Public site otherwise unchanged: all five nav links present, `/narrated-works`,
  `/demos`, `/merch` all 200, no uncaught page errors.

Dean signing in with his own credentials was confirmed by him earlier and is unchanged
by this — nothing here touches the login page.

---

## U4 — the three broken callers, fixed per script (2026-08-30)

All three authenticated with `cookie: dmn_admin_key=$ADMIN_SECRET_KEY`, dead since R1.
Deliberately NOT one fix for all three — the criterion was **does it need HTTP at all?**

### What each actually verifies

| script | verifies | needs HTTP? |
|---|---|---|
| `check-first-render` | admin PAGES render server-side in the loading pass (`useEffect` does not run in SSR, so SSR *is* frame one) | **yes** — a rendering fact, not a data fact |
| `check-payments-costed` | the ROUTE serves settings in the shape the client reads, and that rate produces real figures | **yes** for the shape half — it exists *because* `check-settings-honesty` calls the loader directly and cannot see the route |
| `import-payments` | nothing; it is an operator tool that reuses the app's parse and insert endpoints | **yes** — the parser lives only in the route |

All three needed HTTP, so all three took the bearer. No machine account was created.

### The correction that matters: check-first-render was NOT failing loudly

U3 reported these fail loudly on a non-200. That was **wrong for check-first-render**, and
in the worst direction. Middleware answered its dead credential with a 307 to
`/admin/login`; `fetch` follows redirects by default; the login page renders fine and
returns 200. **The guard reported all 8 routes healthy while rendering the login page
eight times**, and had done so since R1.

Proven, not deduced: with a deliberately wrong `ADMIN_SECRET_KEY` the guard printed
`OK — all 8 routes render` and exited 0.

Hardened by `redirect: "manual"` (a redirect is a failure, not a detour) plus a check
that the body is not the login form — because if the gate ever renders the form instead
of redirecting, the status alone would not say so.

### The mechanism

One `matchesInternalBearer()` in `src/lib/internal-bearer.ts`, called by all three layers
that now accept it — middleware, the page gate, the route handlers. Three copies of an
auth comparison drifting apart is the failure this project keeps producing.

Widened, each named: pages via `assertAdmin` + middleware; `/api/studio-settings` **GET**
(PATCH untouched); `/api/board` **GET** (POST/PATCH/DELETE untouched);
`/api/payments/parse-document` (writes nothing); `/api/payments/bulk`.

**`/api/payments/bulk` is the one widening that WRITES**, and it is flagged in the route.
Anyone holding `ADMIN_SECRET_KEY` can now insert payments. The alternative is to delete
`import-payments` — the historical import it was written for has already been run — and
put that line back. Dean's call.

This does widen admin PAGE HTML to the secret. Taken deliberately over a standing admin
machine account whose password lives in CI: header-only so no browser attaches it, and
the same secret already authorises API routes serving the same data.

### Verified — both halves, per guard

**check-first-render**

| | result |
|---|---|
| clean tree | PASS, all 8 routes 200 |
| wrong secret | **FAIL**, all 8 report 307 (before hardening: passed) |
| `/released` made to throw | **FAIL**, `/released -> 500` and **only** that route |

**check-payments-costed**

| | result |
|---|---|
| clean tree | PASS — 9400 through the route, 33 cards, 25 payments, 22 costed |
| wrong secret | **FAIL** — `answered 401, not 200` (API route, no redirect to follow) |
| route wraps `{data}` not `{settings}` | **FAIL** — the shape contract |
| rate forced null through the route | **FAIL** — the assertion the outage would have failed |
| restored | PASS again, same figures |

**import-payments** is a tool, not a guard, and has no pass/fail to run — the historical
documents are not present and `--apply` was not run. Its auth was verified directly:

| request | status |
|---|---|
| `/api/board` GET, correct bearer | 200 |
| `/api/board` GET, wrong bearer | 401 |
| `/api/board` GET, **old cookie** | 401 — the dead credential stays dead |
| `/api/board` POST, correct bearer | 401 — writes still session-only |

### Noted, not changed

`/expenses` is in middleware's matcher but in none of its route predicates, so middleware
does not gate it; only `assertAdmin` in the page does. Not an exposure — the page gate
holds, and it returned 307 under the wrong-secret mutation — but it is one layer of
defence in depth rather than two, and unlike every sibling route.

---

## W2 — Marizete on the website (2026-08-30)

Additive. The existing admin routes were NOT converted to user-scoped reads — they
work, Dean is their only user, and changing 22 call sites delivers her nothing. W1c
built a user-scoped client and role helpers that nothing consumed; this consumes them.

### W2a — the rule everything else follows from

Every editor page calls the database with HER JWT, through `userScopedClient()`, never
`supabaseAdmin`. All of it is in `src/lib/editor-data.ts` so there is one place to check.

This is not stylistic. `assert_board_access` has a literal `service_role` early return,
so a page reading as service_role and filtering in React would enforce **nothing** while
looking identical on screen — and the first sign of it would be a financial figure in a
payload. The gates only see a caller when a caller is passed.

### What was built

| | |
|---|---|
| `/editor` | her board — `board_for_editor` |
| `/editor/card/[id]` | detail — `card_detail_for_editor`, plus her writes |
| `/pickups` | Dean's view — reads service_role, resolves through `resolve_pickup()` |
| `src/lib/route-access.ts` | who may enter which surface, one definition |
| `src/components/auth/NoAccessPanel.tsx` | R5's state 2, now shared rather than copied |

Her writes are the SAME functions the phone calls — `set_editing_progress`,
`set_editing_complete`, `create_pickup`, `update_own_draft_pickup`,
`delete_own_draft_pickup`, `send_chapter_pickups`. No web-only variants.

**No client-side financial filtering, deliberately.** `board_for_editor` does not select
those columns, so there is nothing to strip; stripping in React would turn a broken
boundary into a cosmetic one and delete the only evidence.

### Two things the build surfaced

**`card_detail_for_editor` does not return the editing columns.** No `chapters_edited`,
`chapters_total` or `editing_completed_at` — `board_for_editor` has them. Widening it
would mean DROP+CREATE (42P13 refuses adding a column to RETURNS TABLE), resetting its
ACL and comment, and the phone shares that definition. The page makes a second gated read
instead.

**The login page's state 3 had to stop meaning `role === "admin"`.** "Right role" is now
relative to the destination: Marizete heading for `/editor` is admitted, the same account
heading for `/payments` is not. Left alone, she would have signed in perfectly and landed
on "no access here yet" — the exact failure R5 was built to end, reintroduced by a page
that still looked correct. `LoginForm` also stopped defaulting to `/board`, which she
cannot open.

### Verified

Throwaway accounts throughout, created and deleted in each run; Marizete's password is
not known to this process and was not needed. The admin one is transient and exists only
because Y3 requires driving the site as an admin — it is not a standing machine account.

**Y1** — 33 cards to an editor, matching the 33 unarchived rows. No `pfh_rate`,
`payment_type`, `narrator_share_percent` or `royalty_split_percent` in the RPC payload or
in **any** of the 34 responses the browser received. Two controls: service_role sees
`pfh_rate` on the same table, and a real book title IS present in those bodies — without
the second, "no financial keys" would also be true of an empty string.

**Y2** — raised, edited while draft, sent; each landed. Then refused: *"That pickup is
not yours, or it has already been sent."* — and the row did not move. Delete refused too.

**Y3** — `resolve_pickup` refuses an editor (`BOARD_ACCESS_NOT_ENABLED`); the pickup
stayed `sent`. Dean resolved it from `/pickups` and `resolved_by` was set to him **by the
function**. Then the function was deliberately broken and the site's resolve **failed
too**, with the error shown rather than swallowed — so the page has no write path of its
own. Restored, and the restore was verified rather than assumed.

**Y4** — a `pending` account: every editor RPC refused, and in the browser it gets the
refusal panel with "nothing wrong with your password", not a login form, and zero cards.

**Y5** — `/board`, `/payments`, `/settings`, `/released`, `/expenses` all 200.

THE FIGURES MOVED, AND NOT BECAUSE OF THIS STAGE. In production is now **$12,134**
(was $13,431) and ready to invoice **$8,559** (was $7,262). Both differ by exactly
**$1,297**, in opposite directions, and the totals sum identically to $20,693 either way —
one card ("A Cowboy's Runaway", ~$1,297) moved between buckets. No money was created or
destroyed, and W2 touches no payments, economics, settings or invoicing file. The
reconciliation guard is green.

The first attempt to check this grepped the SSR body and found neither figure — and its
control also failed, which said the grep was reading the wrong thing: `/payments` is a
client component whose figures arrive after the settings do. Read from a rendered browser
instead.

**Y6** — `/narrated-works` 200 with no session; no financial key in any public payload.

**Y7** — `check-board-policies`, `check-new-account-role`, `check-function-grants` and
`check-card-economics` all green.

### Also

`/pickups` is in the sidebar — a page with no way to reach it is not delivered — and in
`check-first-render`, which now covers 9 routes.

### The harness bug worth recording

The first page-level run reported seven failures and the app was fine. `signIn` waited for
`networkidle`, which returns before the client-side `router.replace` lands, so every
assertion read the login page. **The control caught it**: "a real book title is in the
payload" failed, which meant the four "no financial keys" passes were vacuous — nothing
had rendered. Without that control the run would have reported four clean passes on an
empty page.

---

## /pickups in the admin shell, and the route list re-unified (2026-08-31)

### A — one list, two questions

`admin-routes.ts` was written to end a drift and middleware then drifted from it anyway,
by keeping a local `isNewAdminRoute` beside it. `/expenses` was in this file AND in
middleware's matcher, but missing from that local copy — so **middleware never gated
`/expenses`**, and the only thing in front of it was `assertAdmin` in the page. One layer
where every sibling had two.

It was provable from the redirect alone, and was measured before changing anything:
middleware sends `?next=`, `redirect("/admin/login")` in `assertAdmin` does not.

| | before | after |
|---|---|---|
| `/expenses` | `→ /admin/login` | `→ /admin/login?next=%2Fexpenses` |
| every other admin route | `?next=` | `?next=` |

The file now exports **two** predicates, because the Header and middleware were never
asking the same question:

- `isPrivateRoute` — admin routes **plus `/editor`**. Used by the Header to hide the
  marketing chrome.
- `requiresAdmin` — admin routes only, `/admin/login` excluded so the gate cannot
  redirect to itself.

`/editor` is what separates them: private, but gated in its own layout against
`roleAdmits`, which admits editor OR admin. Collapsing these into one predicate either
puts "Narrated Works · Demos · Merch" across Marizete's board or bounces her off it,
depending which way it collapses. Middleware's three local predicates are **deleted**,
not corrected — a second list that agrees today is still a second list, and this file is
the proof of that.

### B/C — the page

Wrapped in `AdminLayout`, with no `min-h-screen` or padding of its own (`AdminShell`
already supplies `flex-1 min-w-0 p-8`; a second one nested inside the first is how a page
ends up scrolling twice). Hardcoded `bg-[#06082E]` / `text-white/60` replaced with the
admin tokens.

The row was a truncated one-liner in 11px grey — the content telling him what to *do* was
the smallest thing on screen, and a long correction was cut mid-word. Now: chapter as a
real heading, the timestamp monospace and weighted because it is a coordinate he scrubs
to, and the correction as the centre of gravity — `said` struck through and muted,
`should be` full strength, wrapping and never truncated. Resolve is a filled primary
button; Dismiss is secondary. Open pickups group by book then chapter order. The closed
toggle says what it is — "2 resolved" — rather than "2 closed", which read as withholding.

### D — the write path is untouched

`resolve_pickup()` via his own session remains the only write. Verified by grep: **zero**
`update`/`insert`/`upsert`/`delete` calls in the route; the single match is the comment
warning against adding one. The service_role `from("pickups")` is the read W2f permits.

### Two bugs the verification caught, both from testing with realistic values

1. **Chapter ordering was untestable in my first run.** I seeded chapters as
   `PXTEST-<timestamp>-12`, so every value shared a leading number, fell through to the
   alphabetical tiebreak, and rendered 10, 12, 2 — which looked like a sort bug and was a
   *fixture* bug. Re-seeded with `12, 2, 10, "Chapter 7", 1a`: renders 1a, 2, 7, 10, 12.
2. **`Chapter Chapter 7`.** Chapter is free text. The heading prefixed "Chapter"
   unconditionally, so a chapter stored as "Chapter 7" doubled up. Now a leading digit is
   the signal that the label wants the word; anything else ("Prologue") reads as a name
   already.

### Verified

- `/pickups` — sidebar present, `.admin-root` present, no marketing header.
- `/editor` — an editor reaches it, no marketing header, **and her own header IS there**
  (the control: "no header" must not be "nothing rendered"). Cards present.
- `/expenses` — an editor lands on the login page at `?next=%2Fexpenses`, so the refusal
  now comes from middleware, and she is told she is signed in rather than shown a form.
- `/` and `/narrated-works` — 200, marketing header present.
- `check-first-render` green on all 9 routes, so the internal bearer still passes the
  rewritten middleware.

---

## The cast picker, the sender, and a revoke that was NOT done (2026-08-31)

### 1 — status stays in the grant. THE AUDIT SAID DON'T.

The instruction was to revoke `board_cards.status` from the 24-column UPDATE grant to
`authenticated`, **after** confirming every writer goes through service_role or an
admin-gated function. It does not, so it was not revoked.

| writer | client | breaks on revoke? |
|---|---|---|
| `/api/board` PATCH (Dean's web board) | `supabaseAdmin` | no — service_role ignores column grants |
| `/api/books`, ratings cron, prepper, settle-payment | `supabaseAdmin` | no |
| web browser client | *never touches board_cards* | no |
| **Android `BoardViewModel.moveTo` → `updateCard`** | **`authenticated`, direct table write** | **YES** |

`BoardViewModel.kt:297` builds `put("status", card.status)` and sends it straight at the
table. Revoking would break moving a card on Dean's phone, and the installed build would
stay broken until a new release reached it.

**And the exposure it would close is already closed.** Measured, not read off the policy:

| | result |
|---|---|
| editor updating `status` | **0 rows** — RLS `Role update` requires `current_app_role() = 'admin'` |
| admin updating `status` | 1 row — the grant is load-bearing for the phone |
| admin updating `pfh_rate` (control, not granted) | `permission denied for table board_cards` |

Note the shape of the editor result: **no error, zero rows**. The silent RLS refusal this
project keeps meeting — which is why the control matters, and why the third line is there
to prove the probe can see a refusal at all.

So the trade is: break the phone today to remove a permission RLS already denies. Per the
instruction's own condition, it was not taken. **To do it safely:** add an admin-gated
`set_card_status`, ship an Android release that calls it, confirm the fleet has it, then
revoke. That is Dean's call and needs a release, not a migration.

### 2 — `card_cast(p_card_id)`

DEFINER, `assert_editor_access`, returns `narrator_id, display_name, is_self` — Dean
first, then `co_narrator` in stored order. `co_narrator` is text holding JSON: 31 arrays
and 2 empty strings today, and nothing else.

**Every failure raises.** A cast quietly short by one is how a pickup reaches a narrator
who never read the chapter, and nothing on screen says anybody is missing.

| scenario | result |
|---|---|
| `No One to Hold Me` | 1 row — `Dean (self)` |
| `A Cowboy's Runaway` | 2 rows — `Dean (self), Ann Dahlia` |
| `How an Angel Dies: Wrath` | 7 rows |
| not JSON | RAISED |
| JSON object, not an array | RAISED |
| a name with no `narrators` row | RAISED |
| a blank name | RAISED |
| a duplicate name | RAISED |
| no such card | RAISED |
| CONTROL: restored to the real value | 2 rows |

`is_self` is anchored on the narrators row named `'Dean'` because `profile_id` is null on
all 19 rows. If that row is renamed the function RAISES rather than returning a cast with
no owner — the rename becomes visible instead of silent.

### 3 — the picker, by count and not by format

`narration_format` says how a book was produced; the cast says who is on it. Rendered by
cast size: **1** no control at all, just who it is in text; **2** two large named buttons
(27 of 33 books) with the **co-narrator preselected**, since a pickup is usually about the
other person's read; **3+** chips for that card's cast. Never the 19-name roster —
verified that a narrator who is not on the book does not appear.

### 4 — Send goes through the Edge Function, and two things that found

`supabase.functions.invoke("send-pickups", { cardId, chapter })`, with no fallback to the
RPC. The function calls `send_chapter_pickups` itself *after* Resend accepts; calling it
from the client skipped the sender entirely and marked pickups sent with nobody told.
Verified by watching the network: the edge function is called and
`/rest/v1/rpc/send_chapter_pickups` is not. No `.rpc("send_chapter_pickups")` remains in
`src/`.

**a. The function had no CORS, so the browser could never reach it.** It answered the
preflight with **405**, which surfaces as "Failed to send a request to the Edge Function"
— a symptom that names nothing. The function was healthy throughout and answered Node
calls correctly; only browsers were blocked, and only the website is a browser. Added
OPTIONS handling and CORS on **every** response (deployed v4, `verify_jwt` still true).
`*` is not a weakening here: this endpoint authenticates by Authorization header and never
by cookie, so being allowed to ask gains a hostile page nothing.

**b. THE PREDICTED CAUSE WAS NOT THE CAUSE.** The send was expected to fail on a missing
`PICKUPS_RESEND_API_KEY`. It does not: the function gets past that check, so **both
secrets are configured**. It returns **HTTP 200** with

```
{"moved":0,"emailed":[],"skipped":[{"narrator":"Ann Dahlia","reason":"no email address on file"}]}
```

**No narrator has an email address — 0 of 19.** That is the real blocker, and it is data,
not configuration.

That 200 also exposed a bug in this change: a correct, successful, empty send rendered as
silence. She would press Send, see nothing, and believe the narrator had been told — the
failure the function's own ordering exists to prevent, moved up a layer into the UI. The
client now reads `emailed`/`skipped`/`failed`: nothing emailed is an error
("Nothing was sent. Ann Dahlia — no email address on file"), and a partial send is its own
amber notice.

**For Dean:** filling in `narrators.email` is what makes the send work. Nothing else is
outstanding on this path.

---

## Closing the narrator data split (2026-08-31)

Two tables both meant "narrator". `co_narrators` backs Contacts and carries the emails;
`narrators` is what `pickups.assigned_narrator_id` points at. Nothing joined them but
`co_narrators.name = narrators.display_name` — a string match that worked on all 18
overlapping rows and had already failed twice: Rylee Kuberra exists only in Contacts,
Dean only in narrators.

### 1 — empty strings are not missing values

Four rows held `email = ''` (Ash Beverly, Bailey Turpin, E. Montoya, Meg Sylvan).
Contacts renders `''` and NULL identically as an em dash, so four narrators who could not
be emailed at all looked exactly like four whose address was simply not shown. That is why
the roster read as complete. Normalised to NULL, with
`CHECK (email IS NULL OR btrim(email) <> '')` on **both** tables.

**The writers shipped first, in their own commit (980a538).** Both paths submitted `''`
for a cleared field — the POST default and the PUT trim loop — so applying the constraint
first would have rejected every save that clears an email and broken the Contacts form on
what looks like a data fix. Only `email` is treated this way; nothing distinguishes absent
from blank for a bio.

Verified against LIVE PROD, which is also what proved the deploy had landed: a PUT
clearing the email returned **200** and stored **NULL**, and — the control — a direct `''`
write was **refused** by the constraint. Without that second line, "it saved" would also
be true of a constraint doing nothing.

### 2 — the join has a real key

`narrators.co_narrator_id` → `co_narrators(id)`, backfilled from the name match while it
still worked: **18 of 19**, Dean the only one unlinked, which is correct. `display_name`
stays — `card_cast` still resolves co-narrators by name and the phone renders it.

The email backfill now runs **through the FK**, via an AFTER UPDATE OF email trigger, and
the current state was re-derived through that mechanism rather than left as the output of
the one being retired. A rename in Contacts can no longer strand a narrator with a stale
address.

### 3 — `is_self` became `is_owner`, anchored on identity

`narrators.profile_id` is now set for Dean, and `card_cast` finds the owner by that id
instead of `display_name = 'Dean'`. A rename no longer changes who the owner is; unlinking
the profile still RAISES.

**And the flag was misnamed.** `card_cast` never reads `auth.uid()` — it cannot know who
is calling — so "is_self" invited the UI to render it in the second person, and the picker
did: **Marizete was shown "you" beside Dean's name.** Now `is_owner`, rendered as
"primary narrator" / "co-narrator", which is true for every viewer. It is deliberately NOT
viewer-aware.

Changing a `RETURNS TABLE` column forces DROP + CREATE, which discards the ACL and
re-grants EXECUTE to PUBLIC. Grants captured before and compared after —
`anon=false, authenticated=true, service_role=true, public=false`, identical `proacl`,
comment restored — and `check-function-grants` re-run rather than assuming.

### 4 — a guard, mutated until it fired

`narrator_sync_audit()` + `check-narrator-sync.ts`, in `reconcile.yml`. Dean and Rylee
Kuberra are reported as `known` rather than filtered out: a guard that quietly drops the
two rows it finds hardest will be equally quiet about the third.

| mutation | result |
|---|---|
| baseline | PASS — both known exceptions named |
| a second `narrators` row for a cast name | **could not be created** — `narrators_display_name_key` |
| a new one-sided Contacts record | **exit 1** — "the one-sided records changed" |
| a cast narrator's `co_narrator_id` set to NULL | **exit 1** — "is cast on a live book but has no co_narrators link" |
| the two tables' addresses made to disagree | **exit 1** — "email disagrees with the Contacts record" |
| restored | PASS, and the restore was verified rather than assumed |

The first mutation attempt failing is worth keeping: it proved nothing, and had it been
the only one, the FAIL branches would have shipped unexercised.

### Final state

19 / 19 rows, 18 overlapping, 18 linked by FK, 14 with addresses, 0 empty strings, 0
disagreements, 1 narrator linked to the owner profile, 0 guard failures.

### Noted, not changed

`CartDrawer` is mounted in the ROOT layout, so "Your Cart" is in the DOM of every admin
and editor page. Pre-existing and harmless, but it is why a whole-page pronoun sweep found
"your" on the editor card page; the check is scoped to the picker's own copy.

### The status grant stays

Recorded in the migration and on the column itself so it is not re-proposed. RLS
"Role update" already restricts every write on `board_cards` to
`current_app_role() = 'admin'` — an editor updating status gets **0 rows** — and the grant
is load-bearing for `BoardViewModel.kt:297`. Revoking closes nothing and breaks the phone
until a release ships.

---

## The pickup state machine, and public chrome off private pages (2026-08-31)

### A1 — `returned` exists

`draft → sent → returned → resolved`, with `dismissed` reachable from `sent` or
`returned`. The record used to jump from "asked" straight to "done", so there was no state
meaning *re-recorded, not yet checked* — which is the state the work is in for most of its
life. `mark_pickup_returned(p_id)` is admin-only and exists so the state is reachable now;
P2's token flow calls that same function rather than inventing a second way in.

### A2/A3 — `resolve_pickup` admits the editor, and the two outcomes have different sources

It gated on `assert_board_access` — admin only — which locked out the one person
verification belongs to. Now `assert_editor_access`. `CREATE OR REPLACE`, not DROP: the
signature is unchanged, so the ACL and comment survive (confirmed after:
`anon=false, authenticated=true, service_role=true`, comment intact).

`resolved` only from `returned`; `dismissed` from `sent` or `returned`. Distinct messages,
because "she has not sent it back yet" and "that is already closed" send someone looking
in different places.

**Every transition run against the live rows, in a rolled-back transaction.** The baseline
was captured first and is the evidence the rule took effect:

| | before | after |
|---|---|---|
| admin resolve from `sent` | **SUCCEEDED** | **REFUSED** — "the narrator has not sent it back" |

| scenario | result |
|---|---|
| editor resolve from `returned` (the intended path) | SUCCEEDED |
| editor resolves the same row again | REFUSED — "already closed (resolved)" |
| editor resolve from `sent` | REFUSED — "has not sent it back" |
| editor dismiss from `sent` | SUCCEEDED |
| admin dismiss from `sent` | SUCCEEDED |
| admin marks `sent` → `returned` | SUCCEEDED |
| ...and again | REFUSED — "not out with a narrator" |
| editor marks returned | REFUSED — admin-only |
| unknown role, anything | REFUSED — BOARD_ACCESS_NOT_ENABLED |

Production unchanged afterwards: 1 resolved, 3 sent.

### A4 — grouped by whose court the ball is in

Four groups; empty ones render nothing. His own sent rows get the primary action, and it
is **"Re-recorded"** (`mark_pickup_returned`) — not Resolve, which the state machine would
now refuse from `sent` anyway. Force-close is a quiet secondary on every open row.

Seeded one row in **each** state to prove the groups render — a page tested with only
`sent` rows cannot show that the other three exist. All four rendered; exactly one
"Re-recorded" button, on his row only.

### B — public chrome, and a padding class that was already dead

`PublicChrome` calls `usePathname` + `isPrivateRoute` — the same predicate Header uses,
imported, not restated — and mounts `CartProvider`, `Header` and `CartDrawer` only on
public routes. Header moved inside it because it calls `useCart()` above its own early
return, so it depended on the provider everywhere; that is what made the provider
removable at all.

**B2 audit:** `useCart` consumers are CartDrawer, Header and three `/merch` components.
None is reachable from an admin or editor route once Header is inside PublicChrome.

**B3 — and the padding was NOT visible, so it was not "moved".** Measured before touching
anything: on `/pickups` the body's computed `padding-top` was **0px** and `.admin-root`
sat at **top 0**, despite `pt-14 sm:pt-16` on `<body>`. The cause is
`globals.css` → `body { padding: 0 !important; }`, which has killed that utility on
**every** page since long before this change. Public pages measured the same — 0px padding,
a fixed 64px header, content starting at 0 — so they already clear the header their own way.

Moving the class into `PublicChrome`, as planned, would therefore have **switched on 64px
that has never applied** and pushed every public page down. The dead class was removed
instead, which is the change that leaves both sides rendering exactly as they do now.

### Verified

Private: `/pickups`, `/board`, `/editor` — no "Your Cart", no cart drawer node, no
marketing header, each with a control that the page rendered. Admin content still starts
at 0.

Public: `/`, `/narrated-works`, `/merch` all 200 with the marketing header; the cart button
opens the drawer and it reports its empty state; no uncaught page errors.

**NOT EXERCISED, and stated rather than glossed:** add-to-cart and checkout. The store has
**zero products** today — `/merch` renders "More Coming Soon" — so there is nothing to add.
The drawer opening is what proves the provider still works; a passing add-to-cart assertion
here would have been passing on absence.

### Recommended, not done: route groups

`(public)` and `(private)` with separate layouts is the real answer, and would keep the
cart out of private **bundles** rather than rendering nothing at runtime. This change stops
it executing; it does not stop it shipping. That is a move of every route directory and
belongs in its own change.

---

## P2 — the narrator's page: a tokenised link, no login (2026-08-31)

Ann has no account and is not getting one. The email already goes per
(card, chapter, narrator); the link is scoped to that same batch. She opens it, sees only
her pickups for that chapter of that book, and marks them re-recorded. Marizete then
verifies and closes. **No upload — that is P3.**

### The decision everything else rests on: anon gets nothing

`anon` holds EXECUTE on **none** of the three functions, and no privilege on
`pickup_links`. The token goes to a Next.js route handler holding the service key, and
only a shaped payload comes back. Granting anon a function that reads pickups would be a
permanent widening of the public role for one feature's convenience, and it would outlive
the feature. Confirmed by `check-function-grants`, not by reading the migration.

| | anon | authenticated | service_role |
|---|---|---|---|
| `issue_pickup_link` | false | false | true |
| `pickup_batch_by_token` | false | false | true |
| `mark_returned_by_token` | false | false | true |
| `pickup_links` (SELECT) | false | false | true |

`pickup_links` has RLS on with **zero policies** — deny-all except service_role, which is
exactly the reachability it should have.

### The token is never stored

Only its SHA-256. A database read — a backup, a support query, a leaked dump — must not
yield working links. `pgcrypto` lives in `extensions`, so every call is qualified
(`extensions.gen_random_bytes`, `extensions.digest`); unqualified, they resolve to nothing
under `search_path TO 'public'`.

Expiry is `NOT NULL` with a 90-day default and an explicit refusal on null — "we forgot to
set one" must not be able to produce a permanent unauthenticated door.

### Verified — and two of these are the ones that matter

| | result |
|---|---|
| token shape | 64 hex chars (32 bytes) |
| raw token in the table | no — only the hash |
| a valid token | exactly that batch, that chapter |
| another chapter's pickup, **through the HTTP route** | `moved: 0`, row still `sent` |
| another narrator's pickup, same batch | `moved: 0`, row still `sent` |
| a re-send | revokes the previous link; the old URL reads 0 rows |
| an expired token | 0 rows, and cannot write either |
| unknown / revoked / expired | **the same page, byte for byte** |

The cross-batch test goes through the **route**, not the client. A client-side filter would
pass this by never sending the id; this sends it and the database refuses it, which is the
only version of the test worth having.

"Unknown" and "revoked" were compared as normalised strings and are identical — the page
cannot confirm that a token is real.

### The page

`/p/[token]`, `robots: noindex, nofollow, nocache`. Added to `isPrivateRoute` (no
marketing chrome) and **not** to `requiresAdmin` — the second case those two predicates
were split for, and the one a merged predicate would break by bouncing Ann to a login she
can never pass. Confirmed both: no header, no cart, and a signed-in **admin** and
**editor** both reach it without a redirect.

Rate-limited per IP — 30 reads/min, 10 confirms/min — and fails **open** on a Redis
outage, because the token is still required and taking the narrator's page down over a
cache is the worse failure.

### The email carries the link (deployed v5)

`issue_pickup_link` is called per narrator just before the email. Proven against the
deployed function with a throwaway narrator: 0 links before, 1 after, and the response
body contains **no `/p/`, no hash and no 64-hex string at all**. The two `console.error`
calls in `pickup-link.ts` print `error.message` only.

### Marizete's verify control

`returned` was a dead end: she had `resolve_pickup` since P1 and no way to use it. A
returned pickup on her card page now shows **Verify & close** plus Dismiss. Verified:
exactly one button, on the returned row only; it resolved, `resolved_by` was set to **her**
by the function, and the `sent` row beside it was untouched.

### Housekeeping

The deployed-function test filed a real manifest into OneDrive. It was removed via Graph
afterwards — `Pickups/A Cowboy's Runaway/` now contains only `Ann Dahlia`.

### Not built, deliberately

The audio upload. P3, and it needs its own decisions.

---

## P3 — the narrator's upload (2026-08-31)

Built, tested, and **inert**: it refuses to issue a single upload URL until a private
bucket exists. That is the correct state, not an unfinished one.

### THE BLOCKER, found by checking rather than assuming

The instruction said to verify the R2 credentials before building on them. They work —
and every bucket they can reach is **public**.

| | result |
|---|---|
| credentials / `HeadBucket dmn-site-media` | reachable |
| signed GET | 200 |
| **GET with NO signature, via the public base URL** | **200 — world-readable** |
| `CreateBucket dmn-pickup-audio` | **AccessDenied** |
| buckets the token can reach | `dmn-site-media`, `narration-demos` — both public |

Unreleased audiobook audio, some of it on confidential books, cannot sit somewhere anyone
with the URL can download it. And the token cannot create a private bucket, so this could
not be solved from here.

**So the bucket is guarded, and the guard is the feature's off switch.**
`pickupsBucket()` refuses when `R2_PICKUPS_BUCKET_NAME` is unset **and** when it names a
known-public bucket — the second check being the one that matters, since "set it to the
media bucket" is exactly the shortcut a future reader would take. All three endpoints
return 503 today.

**What Dean needs to do:** create a private R2 bucket, add an API token scoped to it, set
`R2_PICKUPS_BUCKET_NAME`. Nothing else changes. If R2 is the wrong home, Supabase Storage
would also work and its private buckets are creatable with the service key already here —
but that is a design change and was not made unilaterally.

### The shape

browser → **R2** → OneDrive, never browser → OneDrive. A presigned Graph URL in a browser
is write access to Dean's drive; a presigned R2 PUT is one object in a bucket he controls.

- **The server names the file, always.** `pickups/{link_id}/{uuid}.{ext}`, extension from a
  content-type allowlist, never from the filename. There is no sanitisation to get wrong
  because no user input reaches the key.
- **Signing a content-type does not enforce the bytes.** The file is read back after upload
  and its magic bytes sniffed; a mismatch is **deleted from R2 and never recorded**, so the
  sweep can only ever see files that were checked.
- **Filing is out of band**, on a 10-minute cron. Ann's upload landing in R2 is the
  delivery. This is the same asymmetry as send-pickups steps 4 and 5: a failed file move
  leaves the upload recorded and retryable, never rolled back, because telling her it
  failed would make her send it twice.
- **Never overwrite.** `@microsoft.graph.conflictBehavior=rename`, and the name Graph
  actually used is what gets recorded — the requested path would be a lie after a rename.
- **Uploads attach to the batch**, not to individual pickups.

### Verified

**The rules** (pure, in their own module precisely so they are testable): wav/flac/mp3/m4a
sniff correctly; a zip and an exe sniff as nothing; **a zip signed as `audio/wav` is
rejected**, and so is a flac signed as wav — a mismatch, not merely an unknown. Traversal,
backslash traversal, a colon, a dot-run, an empty name and a 300-character name all reduce
to something inert, and the R2 key contains nothing from any of them.

**The signing endpoint refuses, server-side**: a 6th file (400), a non-audio type (400),
over 200 MB (400), a **revoked** token (403), an unknown token (403) — with a valid request
signing successfully as the control. A `../../../etc/passwd.wav` filename still produces a
plain `pickups/{uuid}/{uuid}.wav` key.

**anon holds nothing**: all six new functions refused, `pickup_uploads` unreadable, RLS on
with zero policies — with service_role succeeding as the control.

**The cron records failure rather than dropping the row**: forced to fail, the row still
exists, `attempts` went 0 → 1, `last_error` is populated and `filed_at` is still null.

### NOT VERIFIED, and it is the happy path

Blocked on the private bucket, so no object could be written:

1. a valid wav end to end into OneDrive
2. the sniff rejecting a **real** uploaded file (the function is proven on real container
   bytes; the upload → read-back → delete path is not)
3. the no-overwrite suffix, verified by fetching both takes
4. the cron's **success** branch — only its failure branch has been exercised

A filing path only ever exercised on the failure side has no evidence it succeeds, and I am
not going to imply otherwise. These run the day the bucket exists.

### Not built, deliberately

Antivirus and content moderation. Out of scope, and a half-built version is worse than an
honest absence.

---

## /pickups as a book → chapter tree (2026-08-31)

Supersedes P1's A4 four-group layout. **The guarantee is kept** — exactly one primary
action, on Dean's own sent rows, everything else read-only with a quiet force-close. What
went is the structure around it: `/pickups` is in `requiresAdmin` so Marizete never opens
it, which left three of the four headings existing only to say "not you".

- **"Needs you"** pinned flat at the top, never behind a disclosure, keeping P1's
  **"Re-recorded"** primary (`mark_pickup_returned` — Resolve would be refused from `sent`).
  Those rows come out of the tree entirely, so the counts below cannot double-count them.
- **The tree**: book → chapter → rows. Books with open work first, then most recent
  activity. Chapters reuse the existing numeric-first helper.
- **Closed rows live in their own chapter**, visually demoted, behind one global toggle.
  With it off, a chapter of only history does not render and neither does a book of only
  such chapters.
- **Expansion** is a TRI-STATE in localStorage, not a set of collapsed ids. A set can only
  record "collapse this", so a book that defaults to shut — nothing but closed history —
  could never be opened: removing it from the set returns it to the default, which is shut.
  Every storage access is wrapped; a private window must not take the page down.

### The fixture bug, again, and caught by the test

The first run reported the chapter sort broken. It was not. I had named the seeded chapters
`TREE-1788198774604-2` and `TREE-1788198774604-10`, so **every chapter shared a leading
number** — the numeric key collided and everything fell to the alphabetical tiebreak,
putting `-10` before `-2` and `Prologue` first. The same mistake as the earlier chapter
sort, in a prompt that warned about exactly it.

Re-seeded with realistic labels — `2`, `10`, `Prologue` — and the tag moved to the note:
renders `Chapter 2 | Chapter 10 | Prologue`. A timestamp in a fixture value is not neutral
when the thing under test parses that value.

### Verified

Two books, a `Prologue` beside numbered chapters, a book of nothing but closed pickups, a
chapter holding both open and closed rows, one row for Dean and one for Ann: "Needs you"
renders with **exactly one** "Re-recorded" button and no Resolve anywhere; numeric before
non-numeric; the closed-only book and the closed-only chapter both vanish with the toggle
off and appear with it on, still folded; a closed-by-default book opens on click and stays
open across a refresh. Seeds removed, table back to its four live rows.

---

## P3 revised — direct to OneDrive, with a quarantine (2026-08-31)

Dean chose direct-to-OneDrive. The R2 path is **deleted**, not left inert: dead code behind
a clever guard invites someone to satisfy the guard.

### The correction, accepted

The original objection — a browser-held Graph URL is write access to the drive — was
overstated. `createUploadSession` returns a URL bound to ONE destination path, short-lived
and write-only: the same shape as a presigned PUT. The one property genuinely lost is that
the magic-byte check no longer precedes arrival, and `Pickups/_incoming/` is what pays for
it.

### THE R2 FINDING, RECORDED WHERE IT WILL BE READ

On the `pickup_uploads` table comment, because "why not just use R2, we already have it" is
the obvious future question and the answer must not be re-derived by experiment:

> Both buckets the site's token can reach (`dmn-site-media`, `narration-demos`) answer an
> **unsigned GET with 200** — they are world-readable — and that token **cannot create a
> private one** (AccessDenied on CreateBucket). Unreleased audiobook audio, some of it on
> confidential titles, must not be publicly downloadable.

### Two phases, both inside the drive

1. **Quarantine.** The session's destination is `Pickups/_incoming/{link_id}/{uuid}.{ext}`,
   server-chosen always. The filename never influences the path; it survives as
   `original_name`, sanitised.
2. **Verify, then move.** The first bytes are range-read back through Graph and sniffed. On
   a pass the item is **moved** — a Graph PATCH on `parentReference` and `name`, not a
   download-and-reupload. On a fail the quarantine item is deleted and the row records why.

A sniff failure is terminal and has its own `rejected_at`/`rejected_reason` rather than
being faked by exhausting `attempts` — "this is not audio" and "Graph was down eight times"
need different answers from whoever reads the table.

**No overwrite:** the destination name is checked and suffixed. **Orphan sweep:** the cron
deletes `_incoming` items with no live row, older than three hours, and tidies empty link
folders. Debris stays in a visibly-named folder rather than an invisible one.

Everything already verified is unchanged and still passing: the sniff rules, the six
filename attacks, the 200 MB and 5-file caps, the type allowlist — all enforced at session
creation, so a refused request never gets a URL.

### The four tests that could not run, now run

| | result |
|---|---|
| **(a)** a real wav uploads, verifies, moves | landed at `Pickups/A Cowboy's Runaway/Ann Dahlia/{chapter} - Chapter take one.wav`, confirmed by stat; quarantine empty afterwards |
| **(b)** a zip renamed `.wav`, uploaded for real | **accepted at the signature, rejected on read-back** — "is not an audio file we recognise", quarantine item deleted, row carries `rejected_reason` |
| **(c)** the same name twice | `… Chapter take one.wav` and `… Chapter take one (2).wav`, **both** still present, 16044 vs 32044 bytes |
| **(d)** the cron's SUCCESS branch | `filed: 1, failed: 0` |

(b) is the one that matters: the sniff was already proven on container bytes, but never on
the read-back path, and that path is the entire justification for the quarantine folder.

The **failure** branch is kept alongside: a row whose quarantined file is gone is not
dropped — `attempts` incremented, rejection recorded, `filed_at` still null.

### Pickups/ left clean, verified by listing

Not inferred from delete status codes: `Pickups/A Cowboy's Runaway/Ann Dahlia/` held 2
items before the run (`14 - pickups.txt`, `18 - pickups.txt`) and holds exactly those 2
after. `_incoming` ends with 0 folders and 0 files.

---

## Telling Marizete a chapter came back (2026-08-31)

Two signals: an email, and a count on the pages she opens anyway.

### 1 — one email per BATCH

Fired from a successful `mark_returned_by_token`, which is already the per-batch
boundary — not reconstructed from rows afterwards. Three pickups returning produce one
email naming three.

### 2 — the recipient is derived from the role

`editor_notification_recipients()` joins every `profiles` row with role `editor` to
`auth.users` for the address. A literal address would mean a second editor silently gets
nothing and a departed one keeps receiving. Zero recipients is a **logged skip** — not a
crash, and not a silent success.

### 3 — state first, then email, which is the OPPOSITE of the send path

`send-pickups` emails first and flips to `sent` only on acceptance, so `sent` can never
claim an email that did not go. Here it is reversed on purpose: **Ann's re-record actually
happened**, and the state must record it whether or not the notification lands. Emailing
first would risk telling Marizete to check something that is not marked, and a failed send
would mean discarding a fact about the world to keep a message tidy.

The two orderings look inconsistent and someone will eventually "fix" one to match the
other, so the reasoning is in a comment **at the call site**: there the email IS the
delivery; here the state is, and the email is a convenience on top.

### 5 — the count that survives a missed email

`/editor` carries a banner — "5 re-recorded pickups waiting for you to check" — and each
card tile a filled **"N to check"** badge, deliberately louder than the open-pickup count
because this is work waiting on *her*. The card page surfaces those pickups **above
everything else**, with Verify & close on each.

### Verified

| | result |
|---|---|
| a three-pickup batch | one call, `moved: 3`, summary says 3 and names book/chapter/narrator |
| the count before it | 0 returned — so the 3 is a change, not a coincidence |
| a **second** editor added | picked up automatically, 1 → 2, address present |
| that editor **demoted** | drops back to 1 — the departed-editor case |
| **Resend made to fail for real** | confirm still 200, `moved: 2`, both rows **returned**, failure logged, nothing leaked to Ann |
| `/editor`, mailbox untouched | banner names 5, tile badge present |
| the card page | "re-recorded, waiting on you" renders **above** the forms |

The Resend failure was forced with a deliberately invalid `PICKUPS_RESEND_API_KEY` rather
than stubbed, so no test mail could reach a real editor and the asymmetry was exercised
against a genuine failure. A happy-path-only run cannot show that the rows survive.

The first run put the waiting section below "Raise a pickup" — above the chapter list, but
not above the rest. Moved, and the order is now asserted in the source as well as on screen.
