// Matching and planning for imported payment rows. Pure functions, no imports:
// shared by the drop-zone UI and by scripts/import-payments.ts, which runs
// outside Next and can't resolve the "@/" alias or "server-only".

export type ParsedRow = {
  kind: "fee" | "royalty";
  client_name: string;
  title: string;
  period: string;
  amount: number;
  amount_kind: "received" | "invoiced";
  date: string;
  due_on: string;
  invoice_number: string;
  method: string;
  status: "success" | "declined" | "refunded" | "pending" | "unknown";
  rate_pfh: number;
  hours: number;
  confidence: "high" | "medium" | "low";
  notes: string;
};

export type MatchCard = { id: string; title: string; author: string | null };

export type PlanRow = {
  row: ParsedRow;
  /** Chosen project. Null when nothing matched or the match was ambiguous. */
  cardId: string | null;
  include: boolean;
  /** Why this row is excluded or unmatched — shown to the reviewer. */
  reason?: string;
  /** Candidates when an author has more than one project. */
  candidates: MatchCard[];
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Statement titles carry retail decoration the board's title doesn't:
 * "The Circle: Rituals & Ruins (Unabridged)" is the board's "The Circle".
 */
function normTitle(s: string): string {
  return norm(s)
    .replace(/\((unabridged|abridged|dramatized|audiobook)\)/g, "")
    .replace(/[:–-].*$/, "") // drop subtitle after a colon or dash
    .replace(/[^\w\s'&]/g, "")
    .trim();
}

/**
 * A statement can credit several authors for one book — ACX reports
 * "Lillian Monroe, Kayla Gerdes" where the board records a single author.
 */
function authorNames(s: string): string[] {
  return norm(s)
    .split(/[,;&]|\band\b/)
    .map(x => x.trim())
    .filter(Boolean);
}

/**
 * True when two author strings plausibly name the same person.
 *
 * Exact match, or every word of the shorter name appears in the longer one —
 * "Lillian Minx Monroe" on the board vs "Lillian Monroe" on the statement,
 * which is the same author with a pen-name middle word.
 */
function sameAuthor(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const wa = a.split(" ").filter(w => w.length > 1);
  const wb = b.split(" ").filter(w => w.length > 1);
  if (wa.length === 0 || wb.length === 0) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short.length >= 2 && short.every(w => long.includes(w));
}

/**
 * Builds an import plan. Never silently resolves an ambiguity: a row that
 * could belong to two projects arrives unassigned and excluded, for the
 * reviewer to settle. Guessing here would misattribute income.
 */
export function planImport(rows: ParsedRow[], cards: MatchCard[]): PlanRow[] {
  return rows.map(row => {
    // Declined and refunded rows are surfaced by the parser on purpose — a
    // retried charge appears twice in the source, and seeing both is how you
    // avoid counting it twice — but they are never money received.
    if (row.status === "declined" || row.status === "refunded") {
      return { row, cardId: null, include: false, reason: `${row.status} transaction`, candidates: [] };
    }
    if (!row.amount) {
      return { row, cardId: null, include: false, reason: "no amount", candidates: [] };
    }

    // Title first: it identifies the book directly, whereas an author can have
    // several projects and is reported inconsistently across statements.
    let matches: MatchCard[] = [];
    if (row.title) {
      const t = normTitle(row.title);
      matches = cards.filter(c => normTitle(c.title) === t);
      if (matches.length === 0) {
        // The board's title is often the statement title without its subtitle.
        matches = cards.filter(c => {
          const ct = normTitle(c.title);
          return ct.length > 3 && (t.startsWith(ct) || ct.startsWith(t));
        });
      }
    }

    // Fall back to the author, allowing multi-author credits and pen-name
    // variants on either side.
    if (matches.length === 0 && row.client_name) {
      const names = authorNames(row.client_name);
      matches = cards.filter(c => c.author && names.some(n => sameAuthor(norm(c.author!), n)));
    }

    if (matches.length === 1) {
      return { row, cardId: matches[0].id, include: true, candidates: matches };
    }
    if (matches.length === 0) {
      return {
        row,
        cardId: null,
        include: false,
        reason: row.client_name ? `No project for "${row.client_name}"` : "No client name found",
        candidates: [],
      };
    }
    return {
      row,
      cardId: null,
      include: false,
      reason: `${matches.length} projects for "${row.client_name}" — pick one`,
      candidates: matches,
    };
  });
}

/** Shapes a reviewed plan row into the body /api/payments/bulk expects. */
export function toBulkPayload(p: PlanRow) {
  const { row } = p;

  // A royalty statement reports what was EARNED in a period. The distributor
  // pays later — on ACX, only once the accrued balance clears a threshold —
  // so an imported royalty is owed, not collected, until a disbursement is
  // recorded against it. Marking it received on import would claim money that
  // has not arrived.
  if (row.kind === "royalty") {
    // Imported as earned-only, never as received — regardless of how the
    // parser read amount_kind. A royalty statement reports earnings; the
    // disbursement is a separate event that happens later and covers several
    // periods at once. Trusting amount_kind here marked every ACX statement
    // paid on import, which claimed money that had not arrived.
    return {
      card_id: p.cardId,
      kind: "royalty" as const,
      period: row.period,
      label: "",
      amount_expected: row.amount,
      amount_received: 0,
      received_on: "",
      invoiced_on: "",
      due_on: "",
      invoice_number: "",
      method: row.method,
      notes: row.notes,
    };
  }

  const received = row.amount_kind === "received";
  return {
    card_id: p.cardId,
    kind: row.kind,
    period: row.period,
    // Royalty rows returned above, so this is always a fee.
    label: row.invoice_number ? `Invoice ${row.invoice_number}` : "",
    amount_received: received ? row.amount : 0,
    amount_expected: received ? null : row.amount,
    received_on: received ? row.date : "",
    invoiced_on: received ? "" : row.date,
    due_on: row.due_on,
    invoice_number: row.invoice_number,
    method: row.method,
    notes: row.notes,
  };
}
