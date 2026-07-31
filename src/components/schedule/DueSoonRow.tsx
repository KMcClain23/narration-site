import Image from "next/image";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { completionUrgency, daysUntil, parseLocalDate, URGENCY_PILL } from "@/components/admin/board-card-utils";

export type DueSoonCard = {
  id: string;
  title: string;
  author: string;
  cover_url: string | null;
  deadline: string;
  status: string;
};

function formatShortDate(s: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parseLocalDate(s));
}

export function DueSoonRow({ card }: { card: DueSoonCard }) {
  const urgencyKey = completionUrgency(daysUntil(card.deadline));

  return (
    <Link
      href="/board-v2"
      className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-raised"
    >
      <div className="relative h-[60px] w-10 shrink-0 overflow-hidden rounded bg-background">
        {card.cover_url && (
          <Image src={card.cover_url} alt={card.title} fill className="object-cover" sizes="40px" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className={`${adminType.bodyMd} truncate text-text-primary`}>{card.title}</p>
        <p className="truncate text-[13px] font-medium text-accent-amber">{card.author || " "}</p>
      </div>

      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[13px] font-medium ${URGENCY_PILL[urgencyKey]}`}
      >
        <Calendar size={12} />
        {formatShortDate(card.deadline)}
      </span>
    </Link>
  );
}
