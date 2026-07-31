"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PersonForm, type Person } from "@/components/admin/PersonForm";

export function CoNarratorProfileEditButton({ person }: { person: Person }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    const confirmed = confirm(
      `Delete ${person.name}? This permanently removes their profile. Any board_cards referencing them will keep the name as a bare string.`
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/co-narrators", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: person.id }),
      });
      if (!res.ok) throw new Error();
      router.push("/contacts/co-narrators");
      router.refresh();
    } catch {
      setDeleting(false);
      alert("Failed to delete. Please try again.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-surface-border px-4 py-2 text-sm font-medium text-text-body transition-colors hover:border-accent-amber-dim hover:text-text-primary"
      >
        Edit
      </button>

      {open && (
        <div
          // Form modal — unlike a confirmation dialog, an accidental outside
          // click here would silently discard whatever the user just typed.
          // Cancel button or Escape only.
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-4"
        >
          <div className="w-full max-w-lg">
            <PersonForm
              type="co-narrator"
              mode="contacts"
              person={person}
              onCancel={() => setOpen(false)}
              onSaved={() => {
                setOpen(false);
                router.refresh();
              }}
            />
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs font-medium text-text-faint transition-colors hover:text-alert-red disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete co-narrator"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
