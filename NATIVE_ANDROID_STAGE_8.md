<!-- STAGE8-TOKEN: curlew-3670-payments-read -->

# Native Android — Stage 8: Payments and Expenses

Token: curlew-3670-payments-read

READ-ONLY. No writes to payments or expenses from the phone in this stage.

Invoicing and settling are multi-step money flows and Stage 7 has only just made
their web versions refuse rather than guess. Porting a write path to money before
that has been exercised in anger is a bigger surface than this stage should open.
Dean's stated value was "what am I owed", which is a read. If he wants to invoice
from the phone, that is a later stage with its own argument.

CHECKPOINT after 8B.1. Otherwise one report at the end.

---

# 8A — Migration, and the first step is a revoke

## 8A.1 — Close the ceiling BEFORE opening the door

Verified 27 August 2026:

  payments  RLS on, 1 policy (service_role only), 0 policies for authenticated
  expenses  RLS on, 1 policy (service_role only), 0 policies for authenticated

  authenticated holds on BOTH tables:
    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

Nothing is exposed today — RLS denies with no policy present. But this stage adds a
policy for authenticated to those exact tables, and the grants are already there. A
`for all` policy, which is the shortcut everyone reaches for, would make DELETE and
TRUNCATE live on Dean's financial records the moment it was written. Not as a bug
anyone would notice: as a silent widening of what a mistake elsewhere could do.

board_cards does not have this problem because Stage 0 made its grants the ceiling
and RLS the role check. Payments and expenses have no ceiling.

So, first, and in its own commit:

  revoke all on public.payments, public.expenses from authenticated;
  grant select on public.payments, public.expenses to authenticated;

Then verify by reading the privilege list back — authenticated holds SELECT and
nothing else on either table. Quote it.

Do this BEFORE adding any policy. If the revoke is done afterwards there is a window,
however brief, where both are true at once.

## 8A.2 — Select-only policies

  create policy "Role read" on public.payments
    for select to authenticated
    using ((select public.current_app_role()) = 'admin');

Same for expenses. Mirror board_cards exactly.

FOR SELECT, never FOR ALL. Even with the ceiling closed, `for all` states an intent
this stage does not have, and the next person to widen a grant would find a policy
already agreeing with them.

## 8A.3 — Two functions

  payments_for_session()   expenses_for_session()

Same shape as released_for_session: plpgsql, stable, SECURITY INVOKER, set
search_path, assert_board_access() first, explicit column list, execute to
authenticated only, anon and public absent from the ACL.

Lean column lists. Specifically EXCLUDE, unless 8B.1 shows a reason:

  stripe_payment_link, paypal_payment_link, stripe_payment_link_id,
  paypal_invoice_id, payment_links_closed_at, invoice_draft

Those are actionable financial URLs and stored invoice documents. A read-only screen
does not need them, and a narrower return type is less for F3 to narrow later. Two
rows carry a pay link and three carry a draft; none of that has to reach the phone to
answer "what have I been paid".

---

# 8B — Payments

## 8B.1 — RECONNAISSANCE, then stop. Do not build first.

The payments table records money that has MOVED. It does not hold what is owed.

  24 rows: 17 fee, 7 royalty
  every one has amount_received set
  invoiced-and-unpaid: 0
  amount_expected null on 16 of the 17 fees

Yet the web reports His For Christmas as ready to invoice, and its comment says the
partial project fee still has to be billed. So "owed" is COMPUTED — projectState,
cardInvoiceTotal, and the payments.ts family — from the card's word count and the
finished-hour rate, against what has been received.

A screen that reads only this table would say nothing is outstanding. It would be
wrong, and confidently, and in Dean's favour in a way he would not notice until a
client didn't pay.

So, before building anything:

  1. Read how the web computes what is owed. projectState, cardInvoiceTotal,
     paymentNarratorShare, and whatever else the trail reaches. W1 predicted five
     sites in payments.ts and the rate threaded through seventeen — expect the same
     shape.
  2. Report what porting that computation to Kotlin actually requires. Function
     count, not an impression.
  3. Say whether it is tractable in this stage.

Then STOP and report. The fork is real and I am not guessing at it:

  If tractable — the screen answers "what am I owed" and "what have I been paid",
  and it is worth the stage.

  If not — the screen answers "what have I been paid" only, and says PLAINLY that it
  does not compute what is outstanding. An honest smaller screen beats a bigger one
  that quietly reports zero.

Recommending the second is not a failure. Reporting it as tractable when it is not is.

## 8B.2 — Whatever is built inherits Stage 7's refuse rule

If the owed figure is computed, it needs wordsPerFinishedHour, which Stage 7 just made
nullable and refusable on the web.

An unreadable rate means the phone CANNOT SAY what is owed. It must say so — not show
zero, not fall back, not omit the line silently. Zero outstanding and unknown
outstanding are the two states this whole project exists to keep apart, and here they
differ by money Dean is owed.

Money already received is a stored fact and needs no rate. It renders regardless.
That split is the same one Stage 7 drew, and Android drew before it: gate the figure,
not the screen.

## 8B.3 — The card query

EXCLUDES archived, INCLUDES recast.

His For Christmas is status recast, unarchived, and carries a live partial fee. The
web says so in its own words: archiving a recast card would hide the one invoice you
still need to raise. Drop recast from the filter and it disappears along with the
money.

Carried from Stage 6's 6D and the reason it was deferred to here.

---

# 8C — Expenses

21 rows. Straightforward read: incurred_on, vendor, description, amount, label,
schedule_c, method, notes.

Two things:

receipt_url almost certainly points at R2 and will need F1's signed URLs to be
openable. Do NOT build a receipt viewer. Show that a receipt exists; leave opening it
to F1. If it turns out the URLs are already public, say so — that is a finding worth
having either way.

schedule_c is a tax category. Render it as stored; do not interpret, group or total
by it. A tax figure the app invented is worse than no tax figure.

---

# 8D — Capabilities finally does something

Payments and Expenses are financial end to end. There is no per-column gating to
design, because there is no non-financial content on either screen.

That makes this the first surface where Capabilities.of(role) hides a WHOLE TAB
rather than a field — the architecture Dean asked for in the first conversation and
which has been carried since Stage 0 without ever gating anything.

Build it that way now: the tabs are absent for a non-admin, not disabled, not empty.
And no role == in ui/, as always.

The server already refuses independently. This is the second layer, not the first.

---

# Definition of done

0.  Token curlew-3670-payments-read confirmed; one Stage 8 file, no stale copies.

**Migration**

1.  authenticated holds SELECT and nothing else on payments and expenses. Quote the
    full privilege list for both, before and after.
2.  The revoke is its own commit, landed before any policy. Quote both hashes.
3.  Both policies are FOR SELECT. Quote the policy definitions.
4.  payments_for_session and expenses_for_session: prosecdef = false, ACL quoted with
    anon and public absent, editor raises with the SQLSTATE, admin returns 24 and 21.
5.  The excluded columns appear in neither function's return type. Quote both.

**Payments**

6.  8B.1's reconnaissance report: how the web computes owed, the function count, and
    the tractability call.
7.  Whatever was built renders money received correctly. Quote one row against the
    database.
8.  With the finished rate broken by SQL, the owed figure is ABSENT and says so —
    never zero. Restore, read back, quote both states. Skip only if 8B.1 concluded
    owed is out of scope, and say so.
9.  His For Christmas appears. Name it in the output.

**Expenses**

10. 21 rows render. Quote first and last by incurred_on.
11. Receipt presence shown; no receipt opened. State what receipt_url actually is.

**Capabilities**

12. Demote to a throwaway editor: both tabs ABSENT from the bottom bar, and the
    functions raise independently. Restore. Do not demote Dean's account.

**Hygiene**

13. No role == in ui/; no select("*"); all tests green; 0 release warnings.

---

# Work only Dean can do

- Nothing requires his account — use a throwaway user as in Stage 6.
- The 8B.1 fork, if the reconnaissance says the owed computation is a large port.
- Device confirmation, on a physical phone if he can. Everything to date has been the
  emulator, and this is the stage whose whole point is checking money away from a desk.

---

# Carried forward

- A grant is a ceiling; a policy is a role check. A table with no ceiling is one
  policy mistake from being wide open, and the mistake is invisible while RLS denies.
- Widening a type enumerates consumers, not producers; ?? absorbs the null it was
  widened to expose; and the compiler reports the first error on a path, not all of
  them. A second pass has to be at a different level.
- Present, absent, plausible. Plausible is worst, because it looks answered.
- A DoD item that names something the system does not have will not fail — it gets
  satisfied by the nearest real thing.
