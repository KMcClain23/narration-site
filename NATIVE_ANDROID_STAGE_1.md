# Native Android — Stage 1

**Project:** `dmn-admin-android` — native Android client for the dmnarration.com admin backend
**Author:** Dean Miller
**Prepared:** 25 August 2026 · rev. 4 (Stage 0 closed; discovery findings folded in)

This document is the prompt for Claude Code.

**Stage 0 — the backend migration — is complete and verified.** Its section below is a
record of the state you are building against, not work to do. Everything from
"Stage 1 — Android app" onward is the task.

Broader sequencing, and the future stages this one deliberately does not touch, are in
`PROJECT_ROADMAP.md`.

---

## Context Claude Code needs

The web admin lives at `D:\Developer\narration-site` and must be checked out alongside
this Android project. Read it — do not guess at it.

There are **no design documents, planning notes, or CLAUDE.md** in that repository. The
entire record of how the admin was built lives in **code comments**, and they are
unusually good: they explain *why* a decision was made and frequently name the bug that
forced it. Treat them as the specification.

Read these files before writing anything:

| File | Why |
|---|---|
| `src/components/admin/board-card-utils.ts` | Every derived-value rule. The single most important file. |
| `src/components/board/board-filters.ts` | Bucketing, sorting, date-filter semantics |
| `src/components/admin/BoardCardContent.tsx` | Exact card face and its conditional rows |
| `src/components/board/mobile/MobileBoardList.tsx` | Current mobile board structure |
| `src/app/api/board-v2/cards/route.ts` | The exact query the board runs |
| `src/app/globals.css` (the `@theme` block) | Colour tokens |
| `src/lib/design-tokens.ts` | Type scale |
| `src/lib/studio-settings.ts` | The five tunable numbers and their defaults |
| `src/middleware.ts`, `src/lib/admin-auth.ts` | The auth model being replaced |

---

## A planned second user

Dean intends to give his **editor** access at some future point: read-only visibility of
project status, deadlines, and recording progress — and explicitly **not** financial
detail (`pfh_rate`, `payment_type`, estimated earnings), **not** studio settings, and
**no write access to anything**.

That user does not exist yet and no editor-facing code is built in Stage 1. But the
access model is designed for it now, because retrofitting roles into RLS policies and a
repository layer later means rewriting both. The rule throughout:

> **Policies check a role from day one. Adding the editor later is adding a value to a
> list, not restructuring the security model.**

---

# Stage 0 — complete ✅

Verified 25 August 2026. **Do not re-run it, and do not re-plan it.** This section
records the state Stage 1 is built against.

The SQL and the verification script live in the repo — `supabase/stage-0-android-auth.sql`
and `supabase/stage-0-verify.md`. Read them if you need the reasoning; do not execute
them.

## What exists now

- **`public.profiles`** — one row per auth user: `id` (FK to `auth.users`, cascade
  delete), `role` (`'admin'` | `'editor'`, **defaults to `'editor'`**), `display_name`,
  `created_at`.
- **`public.current_app_role()`** — `security definer`, `stable`, returns the caller's
  role. Every policy calls it as `(select public.current_app_role())`.
- **`on_auth_user_created`** — trigger on `auth.users` creating a profile row on signup.
  Proven to fire, not merely to exist.
- **Policies:** `profiles` → own row `SELECT` only, with **no** INSERT/UPDATE/DELETE
  policy at all. `board_cards` and `site_settings` → `SELECT` where role
  `in ('admin')`.
- **Grants:** `INSERT/UPDATE/DELETE/TRUNCATE` revoked from `anon` and `authenticated` on
  `board_cards` and `site_settings`. Read-only is enforced at the privilege level, not
  only by policy.
- **Public signup is disabled.**
- **One user:** `dean@dmnarration.com`, `role = 'admin'`,
  uid `e5ee2039-f736-485e-8979-65067a668de0`.

## The data you are building against

Confirmed directly against the live database:

| status | visible on board | archived |
|---|---|---|
| contracted | 9 | 0 |
| prepping | 1 | 0 |
| recording | **3** | 1 |
| editing | 7 | 0 |
| recast | excluded | — |
| released | excluded (12) | — |

**20 rows** satisfy `status in ('contracted','prepping','recording','editing')
and archived_at is null`. 34 rows exist in `board_cards` in total.

Note the archived recording card. It is why the board shows 20 and not 21, and it is a
useful accidental test case — a card that passes the status filter and must still be
excluded.

## What Stage 0 proved, and why it matters to Stage 1

Every check ran against the **REST API with a real JWT**, not the SQL editor — the editor
connects as a role that bypasses RLS and would have passed a completely broken
configuration.

Two results shape Stage 1 directly:

1. **The role is read fresh from `profiles` on every query, not baked into the JWT.**
   Demoting the user to `'editor'` caused an already-issued token to immediately return
   zero rows, with no re-authentication. A permission change takes effect on the next
   request. The app must therefore never cache the role beyond a session, and must
   tolerate its own queries starting to return nothing.

2. **Read-only is structural.** Any write the app attempts will fail with
   `permission denied`, not a silent no-op. Stage 1 attempts none; if you find yourself
   handling a write error, you have written something that does not belong in this stage.

## The editor path — design only, do not build

Recorded so Stage 1's shape stays compatible with it. No editor code, SQL, or UI is
written now.

**Column-level grants do not solve this.** Postgres column privileges are granted to
*database* roles, and both admin and editor are the same database role
(`authenticated`) — they are distinguished only by a row in `profiles`. A
`grant select (…)` cannot tell them apart.

**The mechanism is a `security_invoker` view.** Postgres 15+ (this project is on 17.6)
supports views that evaluate RLS as the *calling* user rather than the view's owner, so a
view can expose a narrowed column set while still being governed by policy:

```sql
-- SKETCH ONLY — do not create in Stage 1.
create view public.board_cards_editor with (security_invoker = true) as
  select id, title, author, co_narrator, status, deadline, first15_due,
         first_15_complete, word_count, narration_format,
         narrator_share_percent, recording_dates, words_recorded, created_at,
         -- Confidential covers stay behind even for a trusted second user;
         -- the flag exists precisely because some of these must not circulate.
         case when is_confidential then null else cover_url end as cover_url
    from public.board_cards;
```

`pfh_rate`, `payment_type`, `is_confidential`, `author_email`, `notes`, `author_notes`
and the archive columns are simply absent — not nulled, absent. The editor's client
cannot request what the view does not define.

`board_cards`'s own policy then widens to `in ('admin', 'editor')` so the view can read
through it, and the editor's *table* access is prevented by PostgREST exposure rather
than by policy. Whether to instead keep two policies — one per role — is a decision for
that stage; both work, and the sketch above is not a commitment.

**What Stage 1 must do to stay compatible:** the repository names its source table in
**one constant**, resolved by role, and selects an **explicit column list** rather than
`*`. Both are already required below. That is the entire hook — nothing else in the
Android app needs to anticipate this.

**Not solved by any of the above:** the editor cannot use the *web* admin, which reads
through service-role and has no concept of users at all. Giving the editor web access is
a separate project, and the Android app is likely to be their only surface for a while.

---

# Stage 1 — Android app

## Scope

**In:** project scaffolding, design-system port, Supabase Auth sign-in with persisted
session, **role loaded into app state**, the Board screen as a two-tab pager, and a
read-only card detail sheet.

**Out, deliberately:** all mutations. No First-15 toggle write, no archive, no status
change, no create, no edit. The First-15 checkbox renders as a **non-interactive
indicator** this stage. Also out: any editor-role UI or query — the architecture supports
it, nothing implements it.

The reason writes are excluded: every write in the web admin carries side effects that
currently live in the API routes — `released_at` stamping, `status_change_log` rows, the
PUT field allowlist. Going direct to Postgres bypasses all of it. Reads are safe to do
directly; writes need those rules ported deliberately, which is Stage 2's whole job. Do
not add a mutation "while you're in there."

## 1.1 — Project setup

- Package: `com.dmnarration.admin`
- `minSdk` 26, target and compile against the current stable SDK
- Kotlin, Jetpack Compose, single-activity, Gradle version catalog (`libs.versions.toml`)
- Dark theme only, forced — no light scheme, no dynamic colour (see 1.3)

**On versions:** do not invent version numbers. Resolve the current stable release of
each dependency, pin it explicitly in the version catalog, and confirm the build
succeeds. If a Maven coordinate has moved, use the current one and note the change.

Dependencies:

- Compose BOM, Material 3, Navigation Compose, `androidx.lifecycle` ViewModel
- **supabase-kt** — `auth-kt` and `postgrest-kt` modules, plus a Ktor engine (OkHttp)
- Hilt for DI
- Coil for cover images
- `kotlinx-datetime`
- `androidx.datastore` + `androidx.security:security-crypto` for the session
- `androidx.compose.material3:material3` pull-to-refresh

Supabase URL and anon key go in `local.properties` → `BuildConfig`, never committed.
The anon key is safe to ship; it is public by design and useless without a session now
that RLS is in place.

## 1.2 — Architecture

```
data/       SupabaseClient provider, ProfileRepository, BoardRepository,
            StudioSettingsRepository, DTOs
domain/     BoardCard, UserRole, Capabilities, the ported pure functions,
            StudioSettings
ui/theme/   Color.kt, Type.kt, Theme.kt
ui/auth/    SignInScreen + ViewModel
ui/board/   BoardScreen, BoardViewModel, BoardCard composable, CardDetailSheet
```

UDF throughout: ViewModel exposes a single `StateFlow<UiState>`, composables are stateless
and take state plus lambdas. Repositories return `Result<T>`, never throw into the UI.

### Role and capabilities

```kotlin
enum class UserRole { ADMIN, EDITOR, UNKNOWN }
```

`UNKNOWN` is not a placeholder — it is the value when the profile row is missing,
unreadable, or holds a string this build does not recognise. **It must fail closed:**
`UNKNOWN` grants nothing and the UI shows an error, never a board.

**Composables must not branch on `UserRole`.** They branch on capabilities, derived once:

```kotlin
data class Capabilities(
    val canViewFinancials: Boolean,   // pfh_rate, payment_type, estimated earnings
    val canViewStudioSettings: Boolean,
    val canViewConfidentialCovers: Boolean,
    val canEdit: Boolean,             // false for everyone in Stage 1
) {
    companion object {
        fun of(role: UserRole) = when (role) {
            UserRole.ADMIN   -> Capabilities(true, true, true, canEdit = false)
            UserRole.EDITOR  -> Capabilities(false, false, false, canEdit = false)
            UserRole.UNKNOWN -> Capabilities(false, false, false, canEdit = false)
        }
    }
}
```

This matters more than it may seem. `if (role == ADMIN)` scattered through composables is
how a fourth role, or a change to what an editor may see, turns into a hunt through the
UI layer for every check — and how one gets missed. With capabilities there is exactly
one place where a role's meaning is defined, and the card composable simply does not know
roles exist. `canEdit` is present and hard-`false` for all roles so that Stage 2 wires
into an existing seam rather than introducing one.

`Capabilities` is carried in `BoardUiState`, not read from a singleton, so it is trivially
testable — a Compose preview or unit test constructs an editor state directly without any
auth in play. **Write at least one preview or test that renders a card with
`canViewFinancials = false`**, verifying the financial rows vanish and the card stays the
right height. That is the proof the seam actually works, and it costs almost nothing now.

### Repository shape

The board repository must resolve **two** things from role, and nothing else in the app
should know about either:

```kotlin
private fun sourceFor(role: UserRole) = when (role) {
    UserRole.ADMIN  -> "board_cards"
    UserRole.EDITOR -> "board_cards_editor"   // does not exist yet; unreachable in Stage 1
    UserRole.UNKNOWN -> error("no source for unknown role")
}

private fun columnsFor(role: UserRole): String = /* explicit list, never "*" */
```

Never `select("*")`. The explicit column list is what keeps a future schema addition from
silently leaking into a client that should not see it, and it is what makes the eventual
view a drop-in.

## 1.3 — Design system

Port exactly. These are the values from the `@theme` block in `globals.css`.

```kotlin
val Background        = Color(0xFF0F1420)
val Surface           = Color(0xFF1E2536)
val SurfaceRaised     = Color(0xFF232B3F)
val SurfaceBorder     = Color(0xFF2A3145)
val Divider           = Color(0xFF232A3D)

val TextPrimary       = Color(0xFFE8EBF2)
val TextBody          = Color(0xFFC4C9D6)
val TextMuted         = Color(0xFF8B93A7)
val TextDim           = Color(0xFF5F6478)
val TextFaint         = Color(0xFF6B6F7D)

val AccentAmber       = Color(0xFFC9A55A)
val AccentAmberDim    = Color(0xFF7A5A2E)
val AccentAmberBright = Color(0xFFD4A34E)

val AlertRed          = Color(0xFFC85A5A)
val CapacityLight     = Color(0xFF6A9C6E)
val StatusPrepping    = Color(0xFF4A9EAE)

val PillNeutralBg     = Color(0xFF4A5265)
val PillNeutralText   = Color(0xFFC4C9D6)
```

Map onto a `darkColorScheme`: `background` = Background, `surface` = Surface,
`surfaceContainerHigh` = SurfaceRaised, `outline` = SurfaceBorder,
`outlineVariant` = Divider, `onBackground`/`onSurface` = TextPrimary,
`onSurfaceVariant` = TextMuted, `primary` = AccentAmber, `onPrimary` = Background,
`error` = AlertRed.

Anything without a Material slot (the three amber variants, CapacityLight,
StatusPrepping, the pill colours, TextDim/TextFaint) goes in a custom
`LocalDmnColors` CompositionLocal. Do not force them into Material slots where they
do not belong.

**Typeface: Manrope.** Bundle the variable font in `res/font` rather than using
downloadable fonts — the app should render correctly on first launch offline. Type scale
from `design-tokens.ts`:

| Role | Spec |
|---|---|
| Page title | Manrope Bold 24sp, tight line height |
| Card title | Manrope Bold 18sp |
| Body | Manrope Regular 14sp, TextBody |
| Body emphasis | Manrope Medium 14sp |
| Secondary | Manrope Regular 13sp, TextMuted |
| Section label | Manrope Medium 11sp, uppercase, 0.08em tracking, TextFaint |
| Numerals | Manrope Medium 13sp, **tabular figures**, TextDim |

The tabular-figures setting is not cosmetic — dates and counts sit in columns and jitter
without it.

**Motion.** The web uses 200ms `cubic-bezier(0, 0, 0.2, 1)` for entrances and an
asymmetric 200ms-out / 150ms-in for sheets. Use the Material 3 motion scheme, which is
close to this by default, and honour `Settings.Global.ANIMATOR_DURATION_SCALE` — the web
app has a real reduced-motion path and the Android app should not regress on that.

## 1.4 — Auth and role loading

Sign-in screen: email + password, Supabase Auth (`signInWith(Email)`).

- Session persisted via supabase-kt's session manager backed by **encrypted** DataStore
- Auto-refresh on
- **Immediately after a session is established, fetch the profile row**
  (`profiles` filtered to the current user) and map `role` to `UserRole`. An unrecognised
  string maps to `UNKNOWN`, not to a default.
- Role is held in a `SessionRepository` as part of the authenticated state, re-fetched on
  every cold start rather than cached across launches — a role change must take effect on
  next launch without reinstalling
- **Distinguish "no usable profile" from "could not reach the server."** These are
  opposite situations, and only one of them is about permissions:
  - **Readable but unusable** — no row, or a role string this build does not recognise →
    **sign out.** Permissions are knowable and the answer disqualifies the session.
  - **Request did not complete** — offline, timeout, transport error → **keep the
    session** and show a blocked state with *Try again*. A request that never left the
    device says nothing about permissions.

  The rule is **fail closed on access, not on authentication**: deny the data, do not
  destroy the credential. An earlier revision of this document said "a profile fetch
  failure signs out with an error", which mandated a bug — opening the app with no signal
  logged the user out and demanded their password.

- **Sign-out must clear local credentials even when its network call fails.** Revocation
  is best-effort; the local session is not. An offline sign-out that appears to succeed
  while leaving the session on disk is the same mistake in the other direction.

- **Bound the launch.** `awaitInitialised()` retries internally and can spin for 15–30s
  offline before resolving. Cap it (~10s) and route the timeout to the same blocked state
  as above. Label the launch spinner — "Restoring session…" — rather than showing a bare
  one; a spinner that says nothing is indistinguishable from a hang even when it is
  working.
- Launch decides: valid session **and** a known role → Board; otherwise → Sign In
- Sign-out available from the top app bar overflow
- Inline, specific errors — distinguish bad credentials from no network from no profile

Do not build a signup screen. Signup is disabled server-side and there will only ever be
a small, hand-created set of users.

*Optional, if it lands cleanly:* biometric re-unlock via `androidx.biometric` gating an
already-valid session. If it adds friction, defer it — it is not what Stage 1 is for.

## 1.5 — The Board

The web board is one long scroll with two sections. **On Android it becomes a two-tab
pager** — `PrimaryTabRow` over `HorizontalPager`:

| Tab | Contents |
|---|---|
| **Pipeline** | Sections *This Week* / *This Month* / *Later* |
| **In Production** | Sections *Prepping* / *Recording* / *Editing* |

Show a count badge on each tab.

Note the consequence: the mobile web's Pipeline / In Production filter chips exist only
because both sections share one scroll. **The tabs replace them — do not port those
chips.** The *Due this week* / *Due this month* chips remain, as a `FilterChip` row under
the tab bar, and still toggle off when re-tapped.

Screen structure:

- `TopAppBar` — "Board", a Released (n) action, overflow with Sign out
- Filter chip row
- `PullToRefreshBox` over the pager
- `LazyColumn` per tab, `stickyHeader` for section labels, `key = card.id`
- Loading: shimmer placeholders shaped like cards, not a centred spinner. A spinner is
  what the web does because it was cheap; this app is meant to feel better than that.
- Empty section: "— no books —", TextFaint, 13sp
- Empty board: "No active projects", centred
- Error: inline banner in AlertRed at 10% over a 30% border, matching the web

The query mirrors `/api/board-v2/cards` exactly, through the role-resolved source and
column list from 1.2:

```kotlin
postgrest[sourceFor(role)]
    .select(Columns.raw(columnsFor(role))) {
        filter {
            isIn("status", listOf("contracted", "prepping", "recording", "editing"))
            exact("archived_at", null)
        }
    }
```

Sorting and bucketing happen client-side, exactly as on the web (see 1.7).

Studio settings are fetched only when `canViewStudioSettings` — an editor session must
never issue that query, since RLS would reject it and produce a spurious error. Fall back
to `DEFAULT_STUDIO_SETTINGS` when they are not fetched.

Fetch on screen open and on pull-to-refresh. No realtime, no polling, no cache — online
only, as decided.

## 1.6 — The card

Match `BoardCardContent.tsx` row for row. Fixed height (the web uses 176dp) with a
96×144dp cover on the left at a 2:3 ratio, rounded, Background-coloured placeholder when
`cover_url` is empty or null. Covers load from R2 via Coil.

Rows, top to bottom:

1. **Title** (Bold 18sp, single line, ellipsized) + format pill when
   `narration_format` is set and is not `"solo"` — PillNeutralBg, 11sp, capitalised
2. **Author** — 14sp Medium, **AccentAmber**, ellipsized
3. **Co-narrators** — `"with A, B"` at 13sp TextMuted; **renders as blank but keeps its
   height** when solo
4. **Dates row**, min height 22dp:
   - Deadline pill with a calendar icon, `"MMM d"`, coloured by urgency:
     ≤7 days → AlertRed, ≤30 → AccentAmberBright, else TextBody — each at 15% opacity
     background
   - First-15: checkbox icon + `"15:"` + date. Urgency differs from the deadline rule —
     *negative* days → red, ≤7 → yellow, else default. When complete: TextMuted and
     **struck through**. Non-interactive this stage.
5. **Word count** — `"123,456 words"`. The `" · ~$1,234"` earnings suffix appends only
   when **`canViewFinancials`** and `estimatedEarnings` is non-null. Blank but
   height-preserving when unset. Without the capability the row still shows the word
   count — words are production information, not financial.
6. **Booth load** — `"4.2 hrs at the mic"`, or `"left"` instead of `"at the mic"` once
   any progress exists, then `" · 37% done"` when progress > 0.5%, then either
   `" · no recording days left"` in AlertRed or `" · 2.1 hrs/day"` — the latter in
   AccentAmberBright when at or above `heavyDayHours`, TextMuted otherwise.
   `"Recording complete"` in CapacityLight when under 0.005 hours remain.
   **Blank when `stillAtMic(status)` is false.** This row is production progress, not
   money — it stays visible without `canViewFinancials`.

The height-preserving blank rows are load-bearing. They keep every card the same height
down the list, and dropping them makes the column ragged. **This applies to the
capability-gated rows too** — hiding earnings must not change a card's height, or an
editor's board would be laid out differently from an admin's for no reason the user can
see.

`is_confidential` → a small lock icon, AccentAmberDim, top-right corner, shown only when
the field is present in the result set.

Tap opens the detail sheet. Long-press and swipe do nothing this stage — no action menu,
no swipe-to-archive, since both are mutations.

## 1.7 — Domain logic to port

Port these from `board-card-utils.ts` and `board-filters.ts` as **pure Kotlin functions
with unit tests**. Do not re-derive them from the rendered output; read the source, and
read the comments, which explain the edge cases.

One correction to this list: **`first15Urgency` is not in `board-card-utils.ts`.** It is a
private function inside `BoardCardContent.tsx` (line 34). Same logic — `< 0` red, `<= 7`
yellow, else default — but note that it differs from `completionUrgency` in exactly that
first branch: an overdue First-15 goes red, whereas an overdue *deadline* is already red
via the `<= 7` case. Port it as a peer of `completionUrgency` regardless of where it
currently lives.

```kotlin
fun daysUntil(date: LocalDate): Int
fun completionUrgency(days: Int): Urgency          // <=7 RED, <=30 YELLOW, else DEFAULT
fun first15Urgency(days: Int): Urgency             // <0 RED, <=7 YELLOW, else DEFAULT
fun narratorShareOf(format: String?, percent: Int?): Double?
fun estimatedEarnings(wordCount: Int?, pfhRate: Double?, paymentType: String?,
                      format: String?, percent: Int?): Double?
fun narrationPlan(input: NarrationInput): NarrationPlan?
fun stillAtMic(status: String?): Boolean
fun parseCoNarrators(raw: String?): List<String>
fun pipelineBucketFor(card: BoardCard): PipelineBucket
fun compareCards(a: BoardCard, b: BoardCard): Int
fun passesDateFilter(card: BoardCard, filter: DateFilter?): Boolean
```

These stay **pure and role-unaware.** Capability gating happens at the call site, not
inside them — a function that silently returns null based on ambient permissions is
untestable and surprising. `BoardCard` models the financial fields as nullable so that a
row from a narrowed source deserialises cleanly with them absent.

Rules that are easy to get wrong and must be preserved:

- **Dates.** `deadline` and `first15_due` are Postgres `date` columns — no timezone.
  Parse them as `kotlinx.datetime.LocalDate`. Never convert through `Instant`. The web
  code has a long comment about exactly this: `new Date("YYYY-MM-DD")` reads as UTC
  midnight and displays a day early west of Greenwich. `created_at` is a `timestamptz`
  and *is* an instant — different type, handled differently.
- **Multicast returns null.** `narratorShareOf` gives 1.0 for solo/unset, 0.5 for
  `duet`/`dual`, and `null` for `multicast` — genuinely unknown, not 100%. An explicit
  `narrator_share_percent` (1–99, DB-enforced) overrides the default for *any* format,
  including multicast. Callers hide the line when the result is null.
- **`estimatedEarnings` only applies to `pfh` and `rs_plus`** payment types. Anything
  else → null.
- **Two different word rates, and neither default is live.** *Finished* hour = money;
  *narration* hour = time. The defaults are 9,400 and 9,200, but the stored values are:

  ```
  studio_words_per_narration_hour = 5000    ← TIME
  studio_words_per_finished_hour  = 9400    ← MONEY
  ```

  Confirm both against `site_settings` before relying on them; the finished-hour value
  was changed from 9,200 to 9,400 on 25 August 2026 and the narration value is the one
  that will hurt if assumed.

  **Both must come from `site_settings`. Neither may be hard-coded except as a fallback.**
  Recording speed especially: falling back to the 9,200 default against a real 5,000
  under-reports every booth figure by roughly 46% — and does it silently, with no error
  and numbers that look entirely plausible.

  `estimatedEarnings` therefore takes `wordsPerFinishedHour` as a **required** parameter,
  exactly as `narrationPlan` takes `wordsPerHour`. Read the comment at
  `board-card-utils.ts:158` for why that is required rather than optional-with-default:
  three surfaces forgot to pass the last one. Do not add a Kotlin default value.

  **Do not hard-code 9,400, even though the web does.** Discovery found the web reads the
  finished-hour setting nowhere — five files hold their own copy of 9,400. Rather than
  rewire the web (which would have changed invoice totals), the stored setting was
  changed to 9,400 to match. Android reads it; the web keeps its copies; the numbers
  agree.

  They agree **by value, not by wiring**. If the finished-hour setting is ever changed
  again, Android will follow it and the web will not, and the two will disagree
  silently. That is a known, accepted state, recorded in `PROJECT_ROADMAP.md` under
  Web Fix W1. Reading from the setting is what keeps Android on the correct side of it.
- **`passesDateFilter` excludes `editing`.** Only `contracted`, `prepping`, `recording`
  can match the due-soon chips — once a book is in editing the deadline belongs to the
  editor.
- **Sort:** deadline ascending, undated last (treat as `+∞`), ties broken by newest
  `created_at` first.
- **`today` must be derived in the device's local timezone**, never UTC.
  `Clock.System.todayIn(TimeZone.currentSystemDefault())`, not `TimeZone.UTC`. This is
  the same class of bug as the deadline-parsing one, on the other operand — and it hides
  better. Dean is UTC-7, so from 17:00 local until midnight the UTC date is already
  tomorrow: a UTC-derived `today` is correct for 17 hours a day and silently a day ahead
  for the other 7, shifting every urgency colour and bucket one step early each evening.
  Verify by checking a card at exactly the 30-day boundary during that window — it
  belongs in *This Month*; *Later* means UTC leaked in.

- **Overdue cards belong in *This Week*, not *Later*.** `pipelineBucketFor` tests
  `days <= 7`, which a negative number satisfies. This is correct and deliberate — an
  overdue book is the most urgent thing on the board, not the least — but it reads as a
  bug on the device if you are not expecting it. Do not "fix" it.

  **Later is not just the undated cards** — an earlier revision of this document said so
  and was wrong. Anything past 30 days lands there too. Live Pipeline as of
  2026-08-25, all 9 `contracted`:

  | bucket | count | |
  |---|---|---|
  | This Week | 0 | nothing due within 7 days |
  | This Month | 1 | *Sweetening the Deal*, at exactly 30 |
  | Later | 8 | 5 dated (36, 56, 97, 97, 308 days) + 3 undated |

  Two consequences for on-device checks: **This Week will be empty**, and with no
  overdue card in live data the overdue-to-This-Week behaviour has no visible example —
  it is covered by unit test only. *Sweetening the Deal* at exactly 30 is a free live
  check of the inclusive `<= 30`; if it renders under *Later*, the boundary is off by
  one. That check is **only valid on 2026-08-25** — by tomorrow it is 29 days and tests
  nothing.
- **`words_recorded` is clamped** to `[0, shareWords]` before use. An over-reported
  figure would otherwise produce negative hours remaining.

## 1.8 — Data quirks that will bite

- **`co_narrator` is a `text` column, not an array.** Most rows hold a JSON-encoded
  array string; at least one live row is a bare non-JSON string. Parse defensively:
  try JSON, fall back to treating the raw value as a single name, and never crash.
- **`word_count` and `pfh_rate` are `NOT NULL DEFAULT 0`** in Postgres, but the
  TypeScript types call them nullable. In Kotlin, **treat 0 as absent** — a card showing
  "0 words" or "~$0" is a bug.
- **`recording_dates`** is a `"YYYY-MM-DD"` string array, possibly null or empty. When
  non-empty it *overrides* the weekday pattern for scheduling maths — a specific date
  knows about holidays that "Tuesdays" does not.
- **Statuses in the wild:** `audition, contracted, prepping, recording, editing,
  released, recast`. The board shows four of them. `recast` exists on one live row and
  must not appear.
- **Covers** come from a public R2 host (`pub-….r2.dev`) with no auth. Confidential
  covers are on it too — the URL alone is enough to fetch one. Add the host to the
  network config; flag rather than fix. Worth knowing that the editor view nulling
  `cover_url` for confidential titles hides them from the *app*, but anyone who has ever
  seen such a URL keeps access to it. Rotating that bucket to signed URLs is a separate
  piece of work and belongs on the list.

## 1.9 — Card detail sheet

A read-only `ModalBottomSheet`, partially expanded by default with a drag handle. Full
cover, title, author, co-narrators, status, both dates, word count, format, and the full
narration plan (total hours, hours remaining, percent done, recording days left, hours per
day).

Payment type, rate, and estimated earnings render **only when `canViewFinancials`** —
the same capability the card face uses. There should be no second definition of what
counts as financial.

No editing. An "Edit on web" affordance opening
`https://dmnarration.com/board?editCard={id}` in a Custom Tab is a reasonable escape
hatch for admin — that deep link already works. Gate it on `canEdit` being wired for
Stage 2, or on role being admin; do not show it to a session that cannot use it.

## 1.10 — Definition of done

**App**

1. App installs and runs on a Pixel 11 Pro XL
2. Sign-in succeeds; killing and reopening the app lands on the Board still signed in
3. Board shows **20 cards** — 9 contracted, 1 prepping, **3** recording, 7 editing.
   There are four `recording` rows; one is archived and must not appear. A board of 21 is
   a failing board, and it fails by showing the archived card.
4. Both tabs render, swipe between them, and their counts sum to 20 — Pipeline 9,
   In Production 11
5. The **recast** card and all 12 released cards are absent
6. A card with no `deadline` sorts into *Later*
7. A `multicast` card shows no earnings figure and no booth-load line derived from a share
8. A card with `word_count = 0` shows a blank word-count row, not "0 words"
9. Every card in a section is exactly the same height
10. *Due this week* / *Due this month* filter correctly and no `editing` card ever matches
11. Pull-to-refresh works and shows the correct indicator
12. Airplane mode gives a clear error, not a crash or an infinite spinner

**Role architecture**

13. `UserRole.ADMIN` is loaded from `profiles` at sign-in and on every cold start, and is
    visible in `BoardUiState`
14. An **unusable** profile — no row, or an unrecognised role — signs out. A profile
    that could not be **fetched** (offline, timeout) keeps the session and offers
    *Try again*. Verify both: they are separate code paths, and the second is reachable
    only by failing, which is exactly why it goes unexamined. Cold-start with the network
    off and confirm you are still signed in afterwards.

    *Updated 27 August 2026 — what is now known, and it is worse than "untested".*
    Dean twice refused to let the credential-destruction guard stand in for this,
    saying the guard proves how many places can call `clearSession()`, not that the
    call works. That objection turned out to be understated. `deleteSession()` returns
    Unit by the SessionManager contract, and the implementation **swallowed its failure
    entirely — not even a log**. A store that refused the write produced a sign-out
    that reported success while the token stayed on disk. Nothing anywhere would have
    said so.

    Fixed: the manager records the failure, `signOutByUser()` returns a
    `SignOutOutcome`, the write uses `commit()` rather than `apply()` so there is an
    answer to record, and the user is told to clear app storage. Verified by asserting
    the cleared and failed outcomes render differently, and mutation-tested by
    silencing the message.

    **Still untested end to end**: the offline sign-out itself. Forcing it means
    destroying Dean's session on the device, and the fix above is verified at the
    decision rather than through the keystore. Do not upgrade this line without doing
    that.
15. An unrecognised role string maps to `UNKNOWN` and shows an error, never a board
16. A Compose preview or UI test renders a card with `canViewFinancials = false`: the
    earnings suffix is gone, the word count remains, the booth-load line remains, and the
    card height is **unchanged**
17. `grep` finds **no** `role ==` comparison anywhere in `ui/` — every branch goes
    through `Capabilities`
18. `grep` finds **no** `select("*")` in the data layer
19. **Live permission-change test.** Demote the user to `'editor'` in the SQL editor
    (`update public.profiles set role='editor' where …`), then — *without signing out* —
    pull to refresh. Stage 0 proved the role is read fresh per query rather than baked
    into the JWT, so the board should immediately return nothing. The app must show a
    clean empty or error state: **no crash, no stale cards, no infinite spinner.** Restore
    `'admin'` and confirm 20 rows return. This is the read-side rehearsal for the day the
    editor actually exists, and it costs two minutes.

**Hygiene**

20. Unit tests cover every function in 1.7, including: multicast → null, over-reported
    `words_recorded`, deadline in the past, no recording days before the deadline, and a
    bare-string `co_narrator`
21. No warnings in a release build; no secrets in version control

## Review checkpoints

Stop and report at each, before continuing:

- **After Stage 0** — all ten verification results from 0.6, especially the signup test
  (0.4) and the role-flip test (10)
- **After 1.3** — a screenshot of the theme applied to two or three sample cards
- **After 1.7** — the ported functions and their tests, before any of it is wired to UI
- **After 1.10** — the full app, plus the two `grep` results from 17 and 18, and the
  before/after row counts from the live permission-change test in 19

---

## What comes next

Recorded so Stage 1 does not accidentally start any of it.

**Stage 2 — writes.** `authenticated` `UPDATE` policies gated on
`(select public.current_app_role()) in ('admin')`, the First-15 toggle, status moves,
swipe-to-archive, the long-press action menu, optimistic updates with rollback. The real
design question is where the side effects the API routes currently own — `released_at`,
`status_change_log`, the field allowlist — live once two clients can write. Likely answer:
Postgres triggers or RPC functions, so both clients get them for free.

**Stage 3+ — the editor.** Create the user, the `board_cards_editor` view, widen the
policy, flip `Capabilities.of(EDITOR)` to its real values. If Stage 1 is built as
specified, the Android work is a repository constant and a role mapping — the UI should
need no changes at all. That claim is worth testing on the day, and item 16 above is what
makes it testable before then.
