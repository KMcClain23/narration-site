"use client";

import { useActiveWelcomeSection } from "./useActiveWelcomeSection";

const processSteps = [
  { label: "Manuscript & notes received", href: "#manuscript-notes", id: "manuscript-notes" },
  { label: "Manuscript prep", href: "#manuscript-notes", id: "manuscript-notes" },
  { label: 'Production sample ("First 15")', href: "#production-sample", id: "production-sample" },
  { label: "Full narration and recording", href: "#recording-process", id: "recording-process" },
  { label: "Proofing, editing, mastering", href: "#delivery-review", id: "delivery-review" },
  { label: "Delivery and review", href: "#delivery-review", id: "delivery-review" },
  { label: "Final corrections", href: "#delivery-review", id: "delivery-review" },
  { label: "Payment and release", href: "#payment", id: "payment" },
];

export default function ProcessOverviewNav() {
  const activeId = useActiveWelcomeSection();

  return (
    <ul className="flex flex-wrap gap-2">
      {processSteps.map((item, index) => {
        const active = item.id === activeId;

        return (
          <li key={`${item.href}-${item.label}-${index}`}>
            <a
              href={item.href}
              className={[
                "inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-all duration-200",
                active
                  ? "border-[#D4AF37]/60 bg-[#D4AF37]/12 text-white"
                  : "border-white/15 bg-white/[0.03] text-white/85 hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/10 hover:text-white",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814]",
              ].join(" ")}
              aria-current={active ? "location" : undefined}
            >
              {item.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}