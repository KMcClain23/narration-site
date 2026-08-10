"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { parseLocalDate } from "@/components/admin/board-card-utils";
import {
  cardExpected,
  clientOf,
  computeByClient,
  computeTotals,
  formatMoney,
  isCardExpectedActual,
  PAYOUT_KIND_LABEL,
  projectState,
  PROJECT_STATE_LABEL,
  type MoneyCard,
  type PaymentRow,
  type ProjectState,
} from "@/lib/payments";
import { PaymentFormModal } from "./PaymentFormModal";
import { InvoiceButton } from "./InvoiceButton";
import { ImportDropZone } from "./ImportDropZone";
import { RoyaltyLedger } from "./RoyaltyLedger";

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
 * A colour per state, carried by a left edge and the count pill.
 *
 * Complete class strings, never assembled at runtime — Tailwind's scanner only
 * sees literals (same reason URGENCY_PILL is written out longhand).
 *
 * The palette encodes urgency rather than decorating: amber is money someone
 * owes you, teal is work you could bill today, green is settled, and the two
 * groups that need no decision stay grey so they recede.
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
  awaiting: "Money you're owed — invoiced work, or royalties earned but not yet paid out.",
  ready: "Delivered work with no invoice raised yet.",
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
  const { card, rows, amount, isEstimate } = project;
  const primary = rows[0];

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
          <span className={`${adminType.monoNum} ${isEstimate ? "text-text-dim" : "text-text-primary"}`}>
            {amount != null ? `${isEstimate ? "~" : ""}${formatMoney(amount)}` : "—"}
          </span>

          {primary ? (
            <>
              <InvoiceButton payment={primary} card={card} rows={rows} />
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
        {/* Suppressed at zero: the back-catalogue group has no rates on file,
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
        const expected = cardExpected(card, rows);

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
          isEstimate: state === "paid" || state === "awaiting" ? false : !isCardExpectedActual(rows),
        };
      })
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  }, [cards, rowsByCard]);

  const grouped = useMemo(() => {
    const m = new Map<ProjectState, Project[]>();
    for (const s of GROUP_ORDER) m.set(s, []);
    for (const p of projects) m.get(p.state)!.push(p);
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
        <Stat
          label="Pipeline (est.)"
          value={`~${formatMoney(totals.expected)}`}
          hint={estimatedShare < totals.expected ? `${formatMoney(totals.expected - estimatedShare)} from invoices` : undefined}
        />
        {/* Owed and paid are separate figures. A narrator usually can't pay
            the editor until the client has paid them, so folding the two
            together claims money has left the account when it hasn't. */}
        {totals.payoutsOwed > 0 && (
          <Stat
            label="You owe others"
            value={formatMoney(totals.payoutsOwed)}
            hint={totals.owedTo
              .map(o => `${PAYOUT_KIND_LABEL[o.kind]}${o.name ? ` · ${o.name}` : ""} ${formatMoney(o.amount)}`)
              .join(" · ")}
          />
        )}
        {totals.payoutsPaid > 0 && (
          <Stat label="Paid out" value={formatMoney(totals.payoutsPaid)} />
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
