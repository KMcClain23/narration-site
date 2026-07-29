import { adminType } from "@/lib/design-tokens";

// Reusable subgroup label + rule, used for every subgroup on the board
// (Pipeline's This Week/This Month/Later, In Production's Prepping/
// Recording/Editing). Caller renders whatever comes below (cards or an
// empty-state hint) — this only owns the label + line + the 12px gap
// before that content.
export function SubgroupDivider({ label }: { label: string }) {
  return (
    <div className="mb-3">
      <p className={adminType.label}>{label}</p>
      <div className="mt-1.5 h-px bg-divider" />
    </div>
  );
}
