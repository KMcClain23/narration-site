# Stage 0 — Verification

Run every check. Report the actual output of each, not just pass/fail.

---

## Why these are not SQL editor queries

**The Supabase SQL editor connects as a superuser role that bypasses RLS entirely.**
Running `select count(*) from board_cards` there returns all 34 rows whether your
policies work, fail open, or do not exist. Every test below would pass against a
completely broken configuration.

So these run against the **REST API with a real JWT** — the exact path the Android app
will use. That surface cannot lie about RLS, because it is the surface RLS governs.

Two checks (C1, C2) do use the SQL editor, and both say so.

---

## Setup

PowerShell. **Use `curl.exe`, not `curl`** — PowerShell aliases the bare name to
`Invoke-WebRequest`, which does not accept these flags and will fail confusingly.

```powershell
$SB   = "https://rtosqtzrwdbexvttbziv.supabase.co"
$ANON = "<NEXT_PUBLIC_SUPABASE_ANON_KEY from D:\Developer\narration-site\.env.local>"
$MAIL = "<the admin email you created in PART B>"
$PASS = "<that user's password>"
```

The anon key is public by design — it is already in your deployed web bundle. It is
useless on its own now that RLS is in place, which is part of what these checks prove.

---

## A — Sign in and role

### A1 · Get an access token

```powershell
$r = curl.exe -s -X POST "$SB/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" -d "{\"email\":\"$MAIL\",\"password\":\"$PASS\"}" | ConvertFrom-Json
$TOKEN = $r.access_token
$UID   = $r.user.id
$TOKEN.Length; $UID
```

**Expect:** a length over 500 and a uuid.
**If `$TOKEN` is empty:** the user does not exist, is unconfirmed, or the password is
wrong. Do not continue.

### A2 · The profile row exists and says admin

```powershell
curl.exe -s "$SB/rest/v1/profiles?select=id,role,display_name" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

**Expect:** exactly one object, `"role":"admin"`.

- `[]` → the A2 trigger did not fire, or PART C did not run
- `"role":"editor"` → PART C did not run, or the email did not match
- More than one row → the "Read own profile" policy is wrong

---

## B — Access

### B1 · The board, as admin

```powershell
curl.exe -s "$SB/rest/v1/board_cards?select=id,status&status=in.(contracted,prepping,recording,editing)&archived_at=is.null" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" | ConvertFrom-Json | Measure-Object | Select-Object Count
```

**Expect: 20.** Live breakdown, confirmed directly against the database:
9 contracted, 1 prepping, 7 editing, and 4 recording — **of which one is archived**, so
3 recording rows are visible and the total is 20. (`recast` × 1 and `released` × 12 are
correctly excluded; 34 rows exist in total.)

`0` here with a valid token means `current_app_role()` is returning null — check A2 first.

**Any count other than 20 is a failure, including a count that looks plausible.**
Rather than trusting PowerShell's parsing, get the number from PostgREST itself:

```powershell
curl.exe -s -D - -o NUL "$SB/rest/v1/board_cards?select=id&status=in.(contracted,prepping,recording,editing)&archived_at=is.null" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Prefer: count=exact" -H "Range: 0-0" | Select-String content-range
```

**Expect:** `content-range: 0-0/20`. The number after the slash is the true row count the
API is willing to return you, independent of how the shell renders the body. If that says
20 but the earlier command said something else, the problem is in the test. If it says
anything other than 20, the problem is in the policy or the URL — compare yours against
the one above character by character, since a dropped `archived_at=is.null` or a mistyped
status changes the answer silently.

### B2 · Studio settings, as admin

```powershell
curl.exe -s "$SB/rest/v1/site_settings?select=key" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

**Expect:** several rows including the `studio_*` keys.

### B3 · Anonymous sees nothing

```powershell
curl.exe -s "$SB/rest/v1/board_cards?select=id" -H "apikey: $ANON"
```

**Expect: `[]`** — an empty array, not an error. SELECT is still granted at the privilege
level; RLS is what returns nothing. An error here means the A5 revokes went too far.

### B4 · Signup is closed

```powershell
curl.exe -s -X POST "$SB/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" -d "{\"email\":\"throwaway-$(Get-Random)@example.com\",\"password\":\"Xq9!vPz2mK4w\"}"
```

**Expect:** an error — typically `"Signups not allowed for this instance"`.

**If this returns a user object, stop.** Signup is open, PART B1 did not take effect, and
anyone on the internet can create an account. Nothing else on this list matters until it
is fixed.

---

## C — Privilege escalation must fail

### C1 · Cannot promote self via the API

```powershell
curl.exe -s -X PATCH "$SB/rest/v1/profiles?id=eq.$UID" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Prefer: return=representation" -d "{\"role\":\"admin\"}"
```

**Expect:** a `permission denied for table profiles` error (from the A1 revoke).

An empty `[]` would also mean the write did not land, but is a weaker result — it would
indicate the grant is still present and only the missing policy is stopping it. Report
which one you see.

### C2 · Cannot insert a profile

```powershell
curl.exe -s -X POST "$SB/rest/v1/profiles" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"id\":\"$UID\",\"role\":\"admin\"}"
```

**Expect:** a permission denied error.

### C3 · Cannot write to the board

```powershell
curl.exe -s -X PATCH "$SB/rest/v1/board_cards?id=eq.00000000-0000-0000-0000-000000000000" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"title\":\"nope\"}"
```

**Expect:** permission denied. Stage 1 is read-only and the grants should now enforce
that structurally, not just by absence of a policy.

---

## D — The role gate actually works ⚠️

**This is the security-critical test. It is the only one that can distinguish a working
role check from a policy wired to a function that always returns `'admin'` — or silently
returns null and is being saved by something else. Every other check on this list passes
against that broken configuration.**

Do not skip it. Do not substitute a code review for it.

### D1 · Demote to editor — **SQL editor**

```sql
update public.profiles
   set role = 'editor'
 where id = (select id from auth.users where email = 'REPLACE_WITH_ADMIN_EMAIL');

select u.email, p.role from public.profiles p join auth.users u on u.id = p.id;
```

**Expect:** `editor`.

### D2 · Re-run B1 and B2 with the *same* `$TOKEN`

Do not sign in again. The point is that the role is read fresh from `profiles` on every
query rather than baked into the JWT — a permission change must take effect immediately,
without re-authenticating.

```powershell
curl.exe -s "$SB/rest/v1/board_cards?select=id&status=in.(contracted,prepping,recording,editing)&archived_at=is.null" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
curl.exe -s "$SB/rest/v1/site_settings?select=key" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

**Expect: `[]` from both.**

If either still returns rows, the role check is not doing anything. Stop and report it —
this is the failure mode the whole test exists to catch.

Also confirm the profile row is still readable:

```powershell
curl.exe -s "$SB/rest/v1/profiles?select=role" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

**Expect:** one row, `"role":"editor"`. Own-profile access is not role-gated, and an
editor must be able to read their own role for the app to know what it may show.

### D3 · Restore admin — **SQL editor, do this immediately**

```sql
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where email = 'REPLACE_WITH_ADMIN_EMAIL');

select u.email, p.role from public.profiles p join auth.users u on u.id = p.id;
```

**Expect:** `admin`. Leaving this undone locks you out of the Android app in Stage 1 with
a symptom — an empty board and no error — that looks nothing like its cause.

### D4 · Confirm restoration through the API

```powershell
curl.exe -s "$SB/rest/v1/board_cards?select=id&status=in.(contracted,prepping,recording,editing)&archived_at=is.null" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" | ConvertFrom-Json | Measure-Object | Select-Object Count
```

**Expect: 20 again.** Stage 0 is not complete until this line reads 20.

---

## G — The trigger actually fires

Added after the first run, where the admin user was created with no profile row.

**Confirming the trigger exists is not confirming it fires.** That is the same distinction
test D exists to enforce — a mechanism that is present and a mechanism that works are
different claims, and only one of them is worth anything. `information_schema` will
happily show an enabled trigger whose function silently does nothing, whose owner lacks
rights, or which fires on a table nobody writes to.

This matters concretely: the next user created through the dashboard is the **editor**,
and if the trigger does not fire, they get no profile row, `current_app_role()` returns
null, and they see an empty app with no error explaining why.

Two minutes now, against a throwaway, rather than debugging it against a real person.

### G1 · Create a throwaway user

Dashboard → Authentication → Users → Add user.
Email `trigger-test@example.invalid`, any password, auto-confirm on.

`.invalid` is reserved by RFC 2606 and can never route to a real inbox.

### G2 · Confirm the profile appeared — SQL editor

```sql
select u.email, p.role, p.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
 where u.email = 'trigger-test@example.invalid';
```

**Expect:** one row, `role = 'editor'`.

This proves three things at once: the trigger fires on dashboard-created users, the
`'editor'` default is what a new account actually gets, and the security-definer function
has the rights it needs.

`role` null → the trigger did not fire. Do not create the editor until that is fixed;
report it instead.

### G3 · Delete the throwaway — SQL editor

```sql
delete from auth.users where email = 'trigger-test@example.invalid';

-- Confirm the cascade took the profile with it. Expect 0.
select count(*) from public.profiles p
  left join auth.users u on u.id = p.id
 where u.id is null;
```

`profiles.id` is `references auth.users(id) on delete cascade`, so removing the user
removes the profile. The second query also proves that cascade works — an orphaned
profile row would be a small liability later.

---

## Report template

```
A1 token          length ____   uid ____
A2 profile        rows ____   role ____
B1 board          count ____   (expect 20)
B2 settings       rows ____
B3 anon board     ____         (expect [])
B4 signup         ____         (expect rejected)
C1 self-promote   ____         (expect permission denied)
C2 profile insert ____         (expect permission denied)
C3 board write    ____         (expect permission denied)
D2 as editor      board ____ / settings ____   (expect [] / [])
D2 own profile    ____         (expect one row, editor)
D4 restored       count ____   (expect 20)
G2 trigger fired  role ____    (expect editor)
G3 orphans        count ____   (expect 0)
```

Any deviation: stop and report rather than working around it.
