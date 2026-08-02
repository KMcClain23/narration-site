import { PersonAvatar } from "@/components/PersonAvatar";
import { adminType } from "@/lib/design-tokens";
import type { Collaborator } from "./lib";

export function FrequentCollaborators({ collaborators }: { collaborators: Collaborator[] }) {
  if (collaborators.length === 0) {
    return <p className={adminType.small}>Not enough collaboration history yet.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {collaborators.map(c => (
        <div key={c.name} className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface p-3">
          <PersonAvatar name={c.name} photoUrl={c.photo_url} size={40} />
          <p className="flex-1 min-w-0 truncate text-sm text-text-body">{c.name}</p>
          <span className="shrink-0 text-sm font-bold text-text-primary">{c.count}</span>
        </div>
      ))}
    </div>
  );
}
