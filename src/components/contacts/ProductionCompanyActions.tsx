"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PersonForm, type Person } from "@/components/admin/PersonForm";

export function ProductionCompanyActions({ person }: { person: Person }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  const markContactedToday = async () => {
    setMarking(true);
    try {
      // Matches the old ContactsClient's markContacted() exactly — sets
      // status to "contacted" alongside today's date, not just the date.
      const today = new Date().toISOString().split("T")[0];
      await fetch("/api/production-companies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: person.id, status: "contacted", date_contacted: today }),
      });
      router.refresh();
    } finally {
      setMarking(false);
    }
  };

  return (
    <>
      <div className="flex shrink-0 gap-2">
        {person.status !== "contacted" && person.status !== "replied" && (
          <button
            type="button"
            onClick={markContactedToday}
            disabled={marking}
            className="rounded-full bg-accent-amber px-4 py-2 text-sm font-bold text-background transition hover:brightness-110 disabled:opacity-50"
          >
            {marking ? "Marking…" : "Mark Contacted Today"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-surface-border px-4 py-2 text-sm font-medium text-text-body transition-colors hover:border-accent-amber-dim hover:text-text-primary"
        >
          Edit Company
        </button>
      </div>

      {open && (
        <div
          // Form modal — unlike a confirmation dialog, an accidental outside
          // click here would silently discard whatever the user just typed.
          // Cancel button or Escape only.
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-4"
        >
          <div className="w-full max-w-lg">
            <PersonForm
              type="production-company"
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
