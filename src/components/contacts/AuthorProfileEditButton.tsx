"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PersonForm, type Person } from "@/components/admin/PersonForm";

export function AuthorProfileEditButton({ person }: { person: Person }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
              type="author"
              mode="contacts"
              person={person}
              onCancel={() => setOpen(false)}
              onSaved={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
