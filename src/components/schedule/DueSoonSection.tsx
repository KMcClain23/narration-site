import { adminType } from "@/lib/design-tokens";
import { daysUntil, parseLocalDate } from "@/components/admin/board-card-utils";
import { DueSoonRow, type DueSoonCard } from "./DueSoonRow";

// Urgency-focused sections answer "what needs MY attention" — once a book
// moves to editing, the remaining deadline is the editor's responsibility,
// not the narrator's, so editing/released/audition cards are excluded here
// even though they still count toward the Monthly Schedule's planning view.
const ATTENTION_STATUSES = new Set(["contracted", "prepping", "recording"]);

function compareByDeadline(a: DueSoonCard, b: DueSoonCard): number {
  return parseLocalDate(a.deadline).getTime() - parseLocalDate(b.deadline).getTime();
}

function DueSoonList({ title, cards, emptyLabel }: { title: string; cards: DueSoonCard[]; emptyLabel: string }) {
  return (
    <div>
      <p className={adminType.title}>{title}</p>
      <div className="mt-3">
        {cards.length === 0 ? (
          <p className={adminType.small}>{emptyLabel}</p>
        ) : (
          cards.map(c => <DueSoonRow key={c.id} card={c} />)
        )}
      </div>
    </div>
  );
}

export function DueSoonSection({ cards }: { cards: DueSoonCard[] }) {
  const dated = cards.filter(c => c.deadline && ATTENTION_STATUSES.has(c.status));

  const overdue = dated.filter(c => daysUntil(c.deadline) < 0).sort(compareByDeadline);
  const overdueIds = new Set(overdue.map(c => c.id));

  const dueThisWeek = dated
    .filter(c => !overdueIds.has(c.id) && daysUntil(c.deadline) <= 7)
    .sort(compareByDeadline);
  const dueThisWeekIds = new Set(dueThisWeek.map(c => c.id));

  const dueThisMonth = dated
    .filter(c => !overdueIds.has(c.id) && !dueThisWeekIds.has(c.id) && daysUntil(c.deadline) <= 30)
    .sort(compareByDeadline);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <DueSoonList title="Overdue" cards={overdue} emptyLabel="Nothing overdue" />
      <DueSoonList title="Due this week" cards={dueThisWeek} emptyLabel="Nothing due this week" />
      <DueSoonList title="Due this month" cards={dueThisMonth} emptyLabel="Nothing due this month" />
    </div>
  );
}
