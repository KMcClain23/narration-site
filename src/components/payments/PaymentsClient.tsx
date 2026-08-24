"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { parseLocalDate } from "@/components/admin/board-card-utils";
import {
  cardExpected,
  cardInvoiceTotal,
  clientOf,
  editingCost,
  computeByClient,
  computeTotals,
  formatMoney,
  isCardExpectedActual,
  projectState,
  PROJECT_STATE_LABEL,
  type MoneyCard,
  type PaymentRow,
  type ProjectState,
} from "@/lib/payments";
import { PaymentFormModal } from "./PaymentFormModal";
import { InvoiceButton } from "./InvoiceButton";
import { MarkPaidButton } from "./MarkPaidButton";
import { ImportDropZone } from "./ImportDropZone";
import { RoyaltyLedger } from "./RoyaltyLedger";
import { PayoutsPanel } from "./PayoutsPanel";

// Order is the order of attention: money you're owed, then work you could
// bill, then everything that needs no decision today.
const GROUP_ORDER: ProjectState[] = ["awaiting", "ready", "production", "paid", "untracked"];

// Groups that answer "what should I do next" stay open; the rest are counts
// until asked for. Previously every project was rendered at full weight, so
// 16 in-production titles — none of them actionable — dominated the page.
const OPEN_BY_DEFAULT: Record<ProjectState, boolean> = {
  awaiting: true,
  ready: true,
  production: false,
  paid: false,
  untracked: false,
};

/**
 * A color per state, carried by a left edge and the count pill.
 *
 * Complete class strings, never assembled at runtime — Tailwind's scanner only
 * sees literals (same reason URGENCY_PILL is written out longhand).
 *
 * The palette encodes urgency rather than decorating: amber is money someone
 * owes you, teal is work you could bill today, green is settled, and the two
 * groups that need no decision stay gray so they recede.
 */
const GROUP_ACCENT: Record<ProjectState, { edge: string; pill: string }> = {
  awaiting: {
    edge: "border-l-accent-amber",
    pill: "bg-accent-amber/15 text-accent-amber-bright",
  },
  ready: {
    edge: "border-l-status-prepping",
    pill: "bg-status-prepping/15 text-status-prepping",
  },
  production: {
    edge: "border-l-text-dim",
    pill: "bg-pill-neutral-bg text-pill-neutral-text",
  },
  paid: {
    edge: "border-l-capacity-light",
    pill: "bg-capacity-light/15 text-capacity-light",
  },
  untracked: {
    edge: "border-l-surface-border",
    pill: "bg-pill-neutral-bg text-pill-neutral-text",
  },
};

const GROUP_HINT: Record<ProjectState, string> = {
  awaiting: "Invoiced work you are still waiting to be paid for. Royalties live in the statements below.",
  ready: "Billable now — delivered, or canceled with a fee still due.",
  production: "Still recording or prepping — nothing to bill until delivery.",
  paid: "Settled.",
  untracked:
    "Already on sale with nothing recorded yet. Still tracked and still countable — add a payment on any row to backfill what you were paid.",
};

type Project = {
  card: MoneyCard;
  rows: PaymentRow[];
  state: ProjectState;
  amount: number | null;
  isEstimate: boolean;
  /** Editing fronted on this project, already inside `amount`. */
  editing: number;
};

function fmtDate(s: string | null): string {
  if (!s) return "";
  return parseLocalDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Stat({
  label,
  value,
  hint,
  primary,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  primary?: boolean;
  tone?: "amber" | "red";
}) {
  const color =
    tone === "red" ? "text-alert-red" : tone === "amber" ? "text-accent-amber-bright" : "text-text-primary";
  return (
    <div>
      <p className={adminType.label}>{label}</p>
      <p className={`${primary ? "text-2xl font-bold" : "text-lg font-semibold"} tabular-nums ${color} mt-0.5`}>
        {value}
      </p>
      {hint && <p className={adminType.small}>{hint}</p>}
    </div>
  );
}

function ProjectRow({
  project,
  onAddPayment,
  onEditPayment,
}: {
  project: Project;
  onAddPayment: () => void;
  onEditPayment: (p: PaymentRow) => void;
}) {
  const { card, rows, amount, isEstimate, state, editing } = project;
  const primary = rows[0];

  // Settled work has nothing left to bill. Most of it was never invoiced at
  // all — a distributor pays without one — so offering the action there is
  // worse than noise: opening the editor reserves the next number in the
  // sequence, spending one on a document nobody asked for. Where an invoice
  // genuinely was raised, reproducing it is still useful at tax time.
  const wasInvoiced = Boolean(primary?.invoice_number || primary?.invoiced_on);

  /**
   * Royalties have nobody to invoice.
   *
   * A distributor reports what it owes and pays it on its own schedule; there
   * is no client on the other end to send a document to. Offering the action
   * anyway is worse than useless — opening the editor reserves the next
   * invoice number, so a curious click spends one on a document that can never
   * be sent to anyone.
   */
  const isRoyaltyOnly = Boolean(primary) && rows.every(r => r.kind === "royalty");
  const showInvoice =
    Boolean(primary) && !isRoyaltyOnly && (state !== "paid" || wasInvoiced);

  return (
    <div className="border-b border-divider px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className={`${adminType.bodyMd} truncate`}>{card.title}</p>
          <p className={adminType.small}>
            {clientOf(card)} · {card.status}
            {primary?.due_on ? ` · due ${fmtDate(primary.due_on)}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {/* The figure is what gets invoiced. Where it includes editing the
              narrator is fronting, the split is spelled out beneath, so the
              amount they keep is never something they have to work out. */}
          <span className="text-right">
            <span
              className={`${adminType.monoNum} block ${isEstimate ? "text-text-dim" : "text-text-primary"}`}
            >
              {amount != null ? `${isEstimate ? "~" : ""}${formatMoney(amount)}` : "—"}
            </span>
            {amount != null && editing > 0.005 && state !== "paid" && (
              <span className={`${adminType.small} block`}>
                {formatMoney(amount - editing)} you · {formatMoney(editing)} editing
              </span>
            )}
          </span>

          {primary ? (
            <>
              {/* Awaiting means the invoice has gone out, so the thing to do
                  next is record the money, not reissue the document. */}
              {state === "awaiting" && primary.kind !== "royalty" && (
                <MarkPaidButton payment={primary} card={card} rows={rows} />
              )}
              {showInvoice && (
                <InvoiceButton
                  payment={primary}
                  card={card}
                  rows={rows}
                  // "Invoice copy" wherever one was actually raised, not only on
                  // settled work: an awaiting row has already been sent, so the
                  // action is reproducing it rather than creating one.
                  label={wasInvoiced ? "Invoice copy" : "Invoice"}
                />
              )}
              <button
                type="button"
                onClick={() => onEditPayment(primary)}
                className="text-[13px] text-text-muted hover:text-text-primary"
              >
                Edit
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onAddPayment}
              className="flex items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-[13px] text-text-body hover:border-accent-amber hover:text-text-primary"
            >
              <Plus size={14} /> Payment
            </button>
          )}
        </div>
      </div>

      {/* Only projects that genuinely pay in instalments get the extra lines —
          a single-payment project would just repeat the row above. */}
      {rows.length > 1 && (
        <div className="mt-2 space-y-1 border-l border-surface-border pl-3">
          {rows.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => onEditPayment(r)}
              className="flex w-full items-center justify-between gap-3 text-left hover:opacity-80"
            >
              {/* A royalty row is identified by its period, not a milestone
                  label — "Payment · due —" told you nothing about which
                  statement it came from. */}
              <span className={adminType.small}>
                {r.kind === "royalty" ? r.period || "Royalties" : r.label || "Payment"}
                {r.kind === "royalty"
                  ? Number(r.amount_received) > 0
                    ? " · paid"
                    : " · awaiting payout"
                  : r.due_on
                    ? ` · due ${fmtDate(r.due_on)}`
                    : ""}
              </span>
              <span className={adminType.monoNum}>
                {r.amount_expected != null ? formatMoney(Number(r.amount_expected)) : "—"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Group({
  state,
  projects,
  total,
  onAddPayment,
  onEditPayment,
}: {
  state: ProjectState;
  projects: Project[];
  total: number;
  onAddPayment: (cardId: string) => void;
  onEditPayment: (cardId: string, p: PaymentRow) => void;
}) {
  const [open, setOpen] = useState(OPEN_BY_DEFAULT[state]);
  if (projects.length === 0) return null;

  return (
    <section
      className={`mt-3 overflow-hidden rounded-xl border border-surface-border border-l-[3px] ${GROUP_ACCENT[state].edge}`}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 bg-surface px-4 py-3 text-left hover:bg-surface-raised"
      >
        {open ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
        <span className={adminType.title}>{PROJECT_STATE_LABEL[state]}</span>
        <span className={`${adminType.monoNum} rounded-full px-2 py-0.5 ${GROUP_ACCENT[state].pill}`}>
          {projects.length}
        </span>
        {/* Suppressed at zero: the back-catalog group has no rates on file,
            and "$0" beside 11 titles reads as "these were worth nothing"
            rather than "nothing is recorded". */}
        <span className="ml-auto flex items-center gap-3">
          <span className={adminType.monoNum}>{total > 0 ? formatMoney(total) : "—"}</span>
        </span>
      </button>

      {open && (
        <>
          <p className={`${adminType.small} border-t border-surface-border px-4 py-2`}>{GROUP_HINT[state]}</p>
          <div>
            {projects.map(p => (
              <ProjectRow
                key={p.card.id}
                project={p}
                onAddPayment={() => onAddPayment(p.card.id)}
                onEditPayment={row => onEditPayment(p.card.id, row)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function PaymentsClient({ cards, payments }: { cards: MoneyCard[]; payments: PaymentRow[] }) {
  // Rendered straight from the server payload, never mirrored into local
  // state. A local copy went stale two ways: the payment returned by POST is
  // serialized before its payouts are created, so an added editor fee showed
  // no change at all; and state seeded from props once never picked up a
  // router.refresh(). Every mutation below re-reads instead.
  const [editing, setEditing] = useState<{ cardId: string; payment: PaymentRow | null } | null>(null);
  const [showClients, setShowClients] = useState(false);
  // Imports insert rows server-side; refresh rather than trying to splice
  // them into local state from the bulk response.
  const router = useRouter();

  const cardsById = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  const rowsByCard = useMemo(() => {
    const m = new Map<string, PaymentRow[]>();
    for (const p of payments) {
      const list = m.get(p.card_id);
      if (list) list.push(p);
      else m.set(p.card_id, [p]);
    }
    return m;
  }, [payments]);

  const totals = useMemo(() => computeTotals(cards, rowsByCard), [cards, rowsByCard]);
  const byClient = useMemo(() => computeByClient(cards, rowsByCard), [cards, rowsByCard]);

  const projects = useMemo<Project[]>(() => {
    return cards
      .map(card => {
        const rows = rowsByCard.get(card.id) ?? [];
        const state = projectState(card, rows);
        const received = rows.reduce((s, r) => s + (Number(r.amount_received) || 0), 0);
        // What will be billed, not the narrator's pre-deduction share — see
        // cardInvoiceTotal(). The row sits under "Ready to invoice", so the
        // number on it has to be the one that goes on the invoice.
        const expected = cardInvoiceTotal(card, rows);
        const editing = editingCost(rows);

        // cardExpected() excludes royalty rows on purpose — royalties are not
        // a forecast — so a project owed only royalties computed to $0 while
        // the header correctly showed money owed. Added back explicitly.
        const royaltyOwed = rows
          .filter(r => r.kind === "royalty")
          .reduce(
            (s, r) => s + Math.max(0, (Number(r.amount_expected) || 0) - (Number(r.amount_received) || 0)),
            0,
          );
        const feeReceived = rows
          .filter(r => r.kind !== "royalty")
          .reduce((s, r) => s + (Number(r.amount_received) || 0), 0);

        // The number that matters differs by column: what landed for settled
        // work, what's still owed for invoiced work, the expected value for
        // everything else. One shared "expected" figure would have shown
        // Whiskey & Lies at its $1,548 estimate under a "Paid" heading, when
        // what actually arrived was $1,500.
        const amount =
          state === "paid" ? received
          : state === "awaiting" ? Math.max(0, (expected ?? 0) - feeReceived) + royaltyOwed
          : expected;

        return {
          card,
          rows,
          state,
          amount,
          editing,
          isEstimate: state === "paid" || state === "awaiting" ? false : !isCardExpectedActual(rows),
        };
      })
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  }, [cards, rowsByCard]);

  const grouped = useMemo(() => {
    const m = new Map<ProjectState, Project[]>();
    for (const s of GROUP_ORDER) m.set(s, []);
    for (const p of projects) {
      /**
       * Royalty-only work belongs to the statements ledger, not up here.
       *
       * Both sections were listing the same two books and disagreeing about
       * them: this one as a single project total with an Edit link, the ledger
       * as individual statements with periods, a distributor, and a Mark paid
       * button. The ledger is the better answer to every question either of
       * them was asked — which month, how much, has it landed — so this stops
       * competing with it.
       */
      if (p.state === "awaiting" && p.rows.length > 0 && p.rows.every(r => r.kind === "royalty")) {
        continue;
      }
      m.get(p.state)!.push(p);
    }
    return m;
  }, [projects]);

  const estimatedShare = useMemo(() => {
    const actual = cards
      .filter(c => isCardExpectedActual(rowsByCard.get(c.id) ?? []))
      .reduce((s, c) => s + (cardExpected(c, rowsByCard.get(c.id) ?? []) ?? 0), 0);
    return totals.expected - actual;
  }, [cards, rowsByCard, totals.expected]);

  function handleSaved() {
    setEditing(null);
    router.refresh();
  }

  function handleDeleted() {
    setEditing(null);
    router.refresh();
  }

  const owed = totals.outstanding;

  return (
    <div className="mx-auto max-w-[1000px]">
      <h1 className={adminType.titleLg}>Payments</h1>

      {/* One compact strip rather than four large tiles. Three of the four
          were restating the same single payment, and the only actionable
          number — what you're owed — was the one reading $0. */}
      <section className="mt-5 flex flex-wrap items-start gap-x-10 gap-y-4 rounded-xl border border-surface-border bg-surface px-5 py-4">
        <Stat
          label="Owed to you"
          value={formatMoney(owed)}
          primary
          tone={totals.overdue > 0 ? "red" : owed > 0 ? "amber" : undefined}
          hint={totals.overdue > 0 ? `${formatMoney(totals.overdue)} overdue` : owed === 0 ? "Nothing outstanding" : undefined}
        />
        <Stat label="Collected" value={formatMoney(totals.received)} />
        {/* Marked as an estimate in the label, not just a footnote — the
            figure is derived from word counts, not from anything agreed. */}
        {/* Net of editing, not gross. The estimate applies the narrator split
            but knows nothing about production costs, so the gross figure reads
            as a bank balance when part of it is already an editor's. */}
        <Stat
          label="Pipeline (est.)"
          value={`~${formatMoney(totals.expectedNet)}`}
          hint={
            totals.expected - totals.expectedNet > 0.005
              ? `${formatMoney(totals.expected)} before editing`
              : estimatedShare < totals.expected
                ? `${formatMoney(totals.expected - estimatedShare)} from invoices`
                : undefined
          }
        />
        {/* The bottom line of the pipeline beside it: every tracked project at
            its best available figure, less everything that goes to someone
            else. Pipeline is gross, and gross overstates what you keep. */}
        {totals.payoutsTotal > 0.005 && (
          <Stat
            label="Net (projected)"
            value={`~${formatMoney(totals.projectedNet)}`}
            // Spelled out because this sits beside Pipeline and can exceed it:
            // Pipeline is the estimate, while gross takes actual receipts where
            // a job paid above its estimate. Without the working shown, a net
            // larger than the pipeline it follows just looks wrong.
            // Quotes the burden, not the check total: the figure above
            // subtracts your share of the off-the-top costs, and a hint that
            // cites $1,916 against a $958 deduction won't reconcile by eye.
            hint={`~${formatMoney(totals.projectedGross)} gross · ${formatMoney(
              totals.projectedGross - totals.projectedNet,
            )} your share of costs`}
          />
        )}
        {/* Owed and paid are separate figures. A narrator usually can't pay
            the editor until the client has paid them, so folding the two
            together claims money has left the account when it hasn't. */}
        {totals.payoutsOwedNow > 0.005 && (
          <Stat
            label="You owe others"
            value={formatMoney(totals.payoutsOwedNow)}
            hint={
              totals.payoutsUpcoming > 0.005
                ? `${formatMoney(totals.payoutsUpcoming)} more after release`
                : undefined
            }
          />
        )}
        {totals.royaltiesEarned > 0 && (
          <Stat
            label="Royalties"
            value={formatMoney(totals.royaltiesEarned)}
            hint={
              totals.royaltiesOwed > 0.01
                ? `${formatMoney(totals.royaltiesOwed)} not yet paid out`
                : "all paid out"
            }
          />
        )}
      </section>

      <PayoutsPanel totals={totals} />

      <ImportDropZone cards={cards} onImported={() => router.refresh()} />
      {GROUP_ORDER.map(state => {
        const list = grouped.get(state) ?? [];
        return (
          <Group
            key={state}
            state={state}
            projects={list}
            total={list.reduce((s, p) => s + (p.amount ?? 0), 0)}
            onAddPayment={cardId => setEditing({ cardId, payment: null })}
            onEditPayment={(cardId, row) => setEditing({ cardId, payment: row })}
          />
        );
      })}

      {/* Everything above is a state a project is IN and may need acting on.
          These two are lenses over the same money — kept below a divider and
          without an accent edge so they read as reference, not as two more
          things demanding attention. */}
      <p className={`${adminType.label} mt-10 border-t border-divider pt-5`}>Reference</p>

      <section className="mt-3 mb-4 overflow-hidden rounded-xl border border-surface-border">
        <button
          type="button"
          onClick={() => setShowClients(o => !o)}
          className="flex w-full items-center gap-3 bg-surface px-4 py-3 text-left hover:bg-surface-raised"
        >
          {showClients ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
          <span className={adminType.title}>By client</span>
          <span className={`${adminType.monoNum} rounded-full bg-pill-neutral-bg px-2 py-0.5 text-pill-neutral-text`}>
            {byClient.length}
          </span>
        </button>

        {showClients && (
          <div className="admin-scrollbar overflow-x-auto border-t border-surface-border">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-divider">
                  {["Client", "Projects", "Expected", "Received", "Avg PFH"].map(h => (
                    <th key={h} className={`${adminType.label} px-4 py-2.5`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byClient.map(c => (
                  <tr key={c.client} className="border-b border-divider last:border-0">
                    <td className={`${adminType.bodyMd} px-4 py-2.5`}>{c.client}</td>
                    <td className={`${adminType.monoNum} px-4 py-2.5`}>{c.projects}</td>
                    <td className={`${adminType.monoNum} px-4 py-2.5`}>{formatMoney(c.expected)}</td>
                    <td className={`${adminType.monoNum} px-4 py-2.5`}>{formatMoney(c.received)}</td>
                    <td className={`${adminType.monoNum} px-4 py-2.5`}>{c.avgPfh != null ? formatMoney(c.avgPfh) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Last on the page, below the project work and the client analytics.
          Royalty statements arrive monthly, pay out in cents, and rarely
          need a decision — they belong on the record, not in the way. */}
      <RoyaltyLedger cards={cards} payments={payments} onChanged={() => router.refresh()} />

      {editing && (
        <PaymentFormModal
          cardId={editing.cardId}
          cardTitle={cardsById.get(editing.cardId)?.title ?? ""}
          card={cardsById.get(editing.cardId)}
          payment={editing.payment}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
