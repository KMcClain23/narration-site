"use client";

import { useState } from "react";
import { studioRates, studioUnavailableReason, useStudioSettings } from "@/components/admin/useStudioSettings";
import { FileText } from "lucide-react";
import {
  agreedFee,
  finishedHours,
  invoiceAmount,
  isOffTheTop,
  narratorShare,
  projectGrossFee,
  type MoneyCard,
  type PaymentRow,
} from "@/lib/payments";
import { parseCoNarrators } from "@/components/admin/board-card-utils";
import { grossUpForCard } from "@/lib/business-identity";
import { type InvoiceData } from "./InvoicePDF";
import { InvoiceEditor } from "./InvoiceEditor";

type AuthorRow = { name: string; email?: string | null; location?: string | null };

/** What the editor last had open, as stored against the payment. */
type SavedDraft = {
  data?: Partial<InvoiceData>;
  hours?: string;
  billingWhole?: boolean;
};

/** "Ann Dahlia", "Ann Dahlia and Edward Baker", "A, B and C". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Bills this narrator's share, plus any editing they are fronting.
 *
 * Not the whole project fee: on a duet each narrator invoices the author for
 * their own half, so billing the gross here would double-charge the author
 * once the co-narrator's invoice arrives. Editing is the exception — one
 * narrator collects the whole fee so they can pay the editor, and it appears
 * as its own line rather than being folded into the narration figure.
 */
export function buildInvoice(
  payment: PaymentRow,
  card: MoneyCard,
  rows: PaymentRow[],
  author: AuthorRow | null,
  invoiceNumber: string,
  /** From Settings. Required here for the same reason it is everywhere else. */
  /** Null when it could not be read; this function throws rather than guessing. */
  wordsPerFinishedHour: number | null,
  /**
   * Real finished hours, once they are known.
   *
   * Everything else here derives from word count ÷ the finished-hour divisor in
   * Settings, which is an estimate
   * made before recording and routinely out by a tenth of an hour or more. Once
   * the file is delivered the true runtime is a fact, and it should drive the
   * invoice rather than the guess that preceded it. Passing it recomputes the
   * fee and the editing from the rates, instead of scaling whatever figure was
   * stored.
   */
  hoursOverride?: number,
): InvoiceData & { wholeProject: { lines: InvoiceData["lines"]; notes: string } | null } {
  // Refuses in its own right rather than trusting its caller to have checked.
  // This function produces the document a client is billed from, and the fee,
  // the agreed total and the whole-project figure all divide by this rate;
  // there is no partial invoice worth emitting. The Invoice button is already
  // disabled when the rate is missing, so reaching this line is a bug — and a
  // thrown error is how a bug should arrive, rather than as a plausible number
  // on a document someone pays.
  if (wordsPerFinishedHour == null) {
    throw new Error(
      "The words-per-finished-hour setting could not be read, so this invoice cannot be built.",
    );
  }

  const share = narratorShare(card);
  const measured = hoursOverride != null && hoursOverride > 0;
  const hrs = measured
    ? hoursOverride
    : (finishedHours(card.word_count, wordsPerFinishedHour) ?? 0);
  const recast = card.status === "recast";

  // A measured runtime only rebuilds the fee where there is a rate to rebuild
  // it from. Without one the stored figure is still the best information
  // available, and inventing a number from an hours field would be worse.
  const amount =
    measured && card.pfh_rate
      ? hrs * card.pfh_rate * share
      : (invoiceAmount(payment, card, rows, wordsPerFinishedHour) ?? 0);

  // Not billed by the finished hour — those hours were never delivered — so
  // quoting "6.6 finished hours × $250/PFH" beside a half payment would invite
  // exactly the query you don't want on this invoice. State the basis instead:
  // what share of the agreed fee this is.
  const agreed = agreedFee(card, wordsPerFinishedHour);
  // Only when both figures are denominated the same way. amount_gross is the
  // whole client-side fee while agreedFee() is the narrator's share, so on a
  // split project the percentage would be wrong — and wrong on a document
  // going to the author.
  const pct =
    recast && agreed && agreed > 0 && payment.amount_gross == null
      ? Math.round((amount / agreed) * 100)
      : null;

  const detail = recast
    ? pct != null
      ? `Partial project fee — ${pct}% of the agreed fee`
      : "Partial project fee"
    : hrs > 0 && card.pfh_rate
      ? `${hrs.toFixed(1)} finished hours × $${card.pfh_rate}/PFH`
      : "";

  // "Recast" stays internal to the tracker. The author is being billed for a
  // share of the agreed fee, and the reason the project ended is not something
  // the invoice line has to relitigate.
  const description = payment.label
    ? `Audiobook narration — ${card.title} (${payment.label})`
    : `Audiobook narration — ${card.title}`;

  /**
   * Editing is billed on its own line, at the full editor fee.
   *
   * The author's budget already covers it — a $300/PFH ten-hour book is $3,000,
   * of which $500 is editing and $2,500 is split between two narrators. The
   * narrator of record collects their $1,250 plus the whole $500 so they can
   * pay the editor, and bills $1,750; the co-narrator bills their $1,250
   * separately. Rolling both into one number would leave the author unable to
   * see what they are paying for, and the two narrator invoices would not
   * visibly reconcile against the budget they agreed.
   *
   * `amount` is the narrator's share *before* the deduction, so their half of
   * the editing comes off it — the same split payoutBurden() applies — and the
   * full fee is then added back as its own line.
   */
  // Only this payment's own payouts. Editing is recorded against the row that
  // fronts it, so reading every row would put the whole project's editing onto
  // each instalment invoice — the same fault that made the webhook record a
  // project total against a single payment.
  const editing = (payment.payouts ?? []).filter(
    p => isOffTheTop(p.kind) && Number(p.amount) > 0,
  );

  // The editor bills by the finished hour too, so a corrected runtime moves
  // their fee as well — leaving it at the figure computed from the old estimate
  // would quietly change who absorbs the difference.
  const editingTotal = editing.reduce(
    (s, p) => s + (measured && p.rate_pfh ? hrs * Number(p.rate_pfh) : Number(p.amount)),
    0,
  );
  const lines: InvoiceData["lines"] = [
    { description, detail, amount: amount - editingTotal * share },
  ];

  if (editingTotal > 0.005) {
    const rate = editing.find(p => p.rate_pfh)?.rate_pfh;
    lines.push({
      description: `Editing — ${card.title}`,
      detail: rate && hrs > 0 ? `${hrs.toFixed(1)} finished hours × $${rate}/PFH` : "",
      amount: editingTotal,
    });
  }

  /**
   * On split work, say so on the document.
   *
   * Each narrator bills the author for their own half, so this invoice is
   * deliberately less than the budget the author agreed. Without a line saying
   * why, the arithmetic looks wrong from their side — and the editing charge
   * looks like it might arrive twice, once from each narrator.
   *
   * A default, not a lock: the notes field stays editable before sending.
   */
  const others = parseCoNarrators(card.co_narrator);
  const split = narratorShare(card) < 1;
  const notes = split
    ? [
        others.length
          ? `This invoice covers my share of the narration. ${listNames(others)} ${
              others.length === 1 ? "invoices" : "invoice"
            } separately for theirs.`
          : "This invoice covers my share of the narration. The other narrator(s) on this title invoice separately for theirs.",
        editingTotal > 0.005
          ? "Editing covers the full title and is billed here only — it will not appear on their invoice."
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  /**
   * The same invoice billed for the whole project instead of one share.
   *
   * Both shapes happen. Usually each narrator bills the author for their own
   * half; sometimes one collects everything and pays the others on. The
   * difference is only ever visible on the invoice, so it is offered there
   * rather than being settled once as a global rule.
   *
   * The editing line is identical either way — it is the same editor being
   * paid the same fee. Only the narration line changes: the whole distributable
   * fee rather than this narrator's share of it.
   */
  const grossBase =
    measured && card.pfh_rate
      ? hrs * card.pfh_rate
      : payment.amount_gross != null
        ? Number(payment.amount_gross)
        : (projectGrossFee(card, wordsPerFinishedHour) ?? (share > 0 ? amount / share : amount));

  // Null on solo work: there is no whole project to bill differently when one
  // narrator is the whole project, and an option that changes nothing is worse
  // than no option.
  // "both" reads better than "all" for the two-narrator case, which is most of
  // them, and is simply wrong past it.
  const narratorWord = others.length > 1 ? "all narrators" : "both narrators";

  // One line, not two. Itemising editing here would read as a charge added on
  // top of the narration rather than as part of what the whole project costs —
  // the opposite of what separating it achieves on a single-share invoice.
  const wholeDetail = [
    hrs > 0 && card.pfh_rate ? `${hrs.toFixed(1)} finished hours × $${card.pfh_rate}/PFH` : "",
    `full narration for ${narratorWord}${editingTotal > 0.005 ? ", including editing and mastering" : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const wholeProject = !split
    ? null
    : {
    lines: [{ description, detail: wholeDetail, amount: grossBase }],
    // Nobody else is invoicing, so the note that says otherwise would be wrong.
    notes: `This invoice covers the full narration for this title, including ${
      others.length ? listNames(others) : "all narrators"
    }.`,
  };

  return {
    invoiceNumber,
    invoiceDate: payment.invoiced_on || new Date().toISOString().split("T")[0],
    dueDate: payment.due_on || "",
    billToName: author?.name || card.author || "",
    billToEmail: author?.email || "",
    billToLocation: author?.location || "",
    bookTitle: card.title,
    lines,
    // Only counts against the invoice when the invoice is for the narrator's
    // own share. On a gross invoice the narrator's receipt is a fraction of
    // the billed total, so showing it as paid would understate the balance.
    amountPaid: payment.amount_gross == null ? Number(payment.amount_received) || 0 : 0,
    method: payment.method,
    notes,
    wholeProject,
    ...(payment.paypal_payment_link ? { paypalLink: payment.paypal_payment_link } : {}),
    // Carried through so reopening an invoice shows the link it already has
    // rather than offering to raise a second one for the same money.
    ...(payment.stripe_payment_link
      ? {
          cardLink: payment.stripe_payment_link,
          ...(() => {
            const due = Math.max(0, amount - (payment.amount_gross == null ? Number(payment.amount_received) || 0 : 0));
            const { total, fee } = grossUpForCard(due);
            return { cardTotal: total, cardFee: fee };
          })(),
        }
      : {}),
  };
}

export function InvoiceButton({
  payment,
  card,
  rows,
  className,
  label = "Invoice",
}: {
  payment: PaymentRow;
  card: MoneyCard;
  rows: PaymentRow[];
  className?: string;
  /** "Invoice copy" on settled work, where the document already exists. */
  label?: string;
}) {
  const studioState = useStudioSettings();
  /*
   * REFUSE, in the only form a component has.
   *
   * `settle-payment.ts` throws, because it is a server path with a caller to
   * catch it. Throwing here would be a white screen, not a refusal — so the
   * action is withheld and says why. An invoice is a document a client is
   * billed from; producing one at a rate nobody could read is the single worst
   * outcome available on this page.
   */
  const finishedRate = studioRates(studioState).wordsPerFinishedHour;
  const blockedReason = finishedRate == null ? studioUnavailableReason(studioState) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReturnType<typeof buildInvoice> | null>(null);
  const [coNarratorEmails, setCoNarratorEmails] = useState<string[]>([]);
  // Kept so recompute() can rebuild the invoice without refetching the author.
  const [author, setAuthor] = useState<AuthorRow | null>(null);
  const [savedDraft, setSavedDraft] = useState<SavedDraft | null>(null);

  async function handleOpen() {
    setBusy(true);
    setError(null);
    try {
      // Reserve a number only if this payment doesn't already carry one —
      // reopening the editor must not consume a fresh number, or the sequence
      // gains holes every time an invoice is looked at.
      let invoiceNumber = payment.invoice_number;
      if (!invoiceNumber) {
        const res = await fetch("/api/payments/next-invoice-number");
        if (res.ok) invoiceNumber = (await res.json()).invoice_number;
      }

      let resolved: AuthorRow | null = null;
      if (card.author) {
        const res = await fetch("/api/authors");
        if (res.ok) {
          const json = await res.json();
          const key = card.author.trim().toLowerCase();
          resolved =
            (json.authors ?? []).find((a: AuthorRow) => a.name?.trim().toLowerCase() === key) ?? null;
        }
      }

      // Addresses for whoever else narrated it, so a whole-project invoice can
      // copy them in. Names live on the card; addresses live on the roster, and
      // not every entry has one — those are simply left out rather than guessed.
      const names = parseCoNarrators(card.co_narrator);
      let coNarratorEmails: string[] = [];
      if (names.length) {
        const res = await fetch("/api/co-narrators");
        if (res.ok) {
          const json = await res.json();
          const roster: { name?: string; email?: string | null }[] = json.co_narrators ?? [];
          const wanted = new Set(names.map(n => n.trim().toLowerCase()));
          coNarratorEmails = roster
            .filter(c => c.name && wanted.has(c.name.trim().toLowerCase()) && c.email)
            .map(c => c.email as string);
        }
      }
      setCoNarratorEmails(coNarratorEmails);
      setAuthor(resolved);

      // Re-checked here as well as on the button: `handleOpen` is async and the
      // state could in principle change between the click and this line.
      if (finishedRate == null) {
        setError("The finished-hour rate could not be read, so no invoice can be built.");
        return;
      }
      const generated = buildInvoice(payment, card, rows, resolved, invoiceNumber, finishedRate);

      // A saved draft wins over the freshly generated one, because it holds
      // decisions: a corrected runtime, a reworded note, an adjusted figure.
      // The payment links are the exception — those are taken from the payment
      // every time, so a saved copy cannot resurrect a link since voided.
      let saved: SavedDraft | null = null;
      try {
        const res = await fetch(`/api/payments/invoice-draft?payment_id=${payment.id}`);
        if (res.ok) saved = (await res.json()).draft ?? null;
      } catch {
        // No saved draft reachable; the generated one is a fine starting point.
      }

      setSavedDraft(saved);
      setDraft(
        saved?.data
          ? {
              ...generated,
              ...saved.data,
              cardLink: generated.cardLink,
              cardTotal: generated.cardTotal,
              cardFee: generated.cardFee,
              paypalLink: generated.paypalLink,
            }
          : generated,
      );
    } catch {
      setError("Could not prepare the invoice.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Write back what the finished invoice established.
   *
   * Persisted on download or send rather than on open: a number that was looked
   * at and abandoned shouldn't be claimed.
   *
   * The dates matter as much as the number. Without invoiced_on the project
   * stays under "Ready to invoice" after it has been invoiced, and without
   * due_on nothing can ever go overdue — the invoice said 31 August and the
   * app had no idea.
   */
  async function handleIssued(next: { invoiceNumber: string; invoicedOn?: string; dueOn?: string }) {
    const body: Record<string, unknown> = { id: payment.id };

    // Only fills a blank — an existing number is never overwritten, even if it
    // was edited by hand for this one document.
    if (!payment.invoice_number && next.invoiceNumber) body.invoice_number = next.invoiceNumber;
    if (next.invoicedOn && !payment.invoiced_on) body.invoiced_on = next.invoicedOn;
    if (next.dueOn) body.due_on = next.dueOn;

    if (Object.keys(body).length === 1) return;

    await fetch("/api/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={handleOpen}
          disabled={busy || blockedReason != null}
          title={blockedReason ?? undefined}
          className={
            className ??
            "flex items-center gap-1 text-[13px] text-text-muted hover:text-text-primary disabled:opacity-50"
          }
        >
          <FileText size={14} /> {busy ? "Opening…" : label}
        </button>
        {/* Said out loud beside the button, not left to a disabled state.
            A greyed-out Invoice control reads as "already invoiced" or "not
            ready yet" — both ordinary, both wrong. Two states rendering
            identically is this project's standing bug, and a tooltip nobody
            hovers is not a distinction. */}
        {blockedReason && (
          <span className="text-[13px] text-alert-red">{blockedReason} No invoice can be built.</span>
        )}
        {error && <span className="text-[13px] text-alert-red">{error}</span>}
      </span>

      {draft && (
        <InvoiceEditor
          initial={draft}
          onClose={() => setDraft(null)}
          onIssued={handleIssued}
          paymentId={payment.id}
          wholeProject={draft.wholeProject ?? undefined}
          coNarratorEmails={coNarratorEmails}
          isPartial={card.status === "recast"}
          initialHours={finishedHours(card.word_count, finishedRate) ?? undefined}
          savedHours={savedDraft?.hours}
          savedBillingWhole={savedDraft?.billingWhole}
          canRecompute={Boolean(card.pfh_rate)}
          // Rebuilds both shapes from a corrected runtime. The editor holds the
          // hours; everything needed to turn them back into lines lives here.
          recompute={hours => {
            const next = buildInvoice(payment, card, rows, author, draft?.invoiceNumber ?? "", finishedRate, hours);
            return { share: { lines: next.lines, notes: next.notes }, wholeProject: next.wholeProject };
          }}
        />
      )}
    </>
  );
}
