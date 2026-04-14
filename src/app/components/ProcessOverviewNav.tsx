"use client";

import { useActiveWelcomeSection } from "./useActiveWelcomeSection";

const processSteps = [
  {
    label: "Manuscript & notes received",
    href: "#manuscript-notes",
    id: "manuscript-notes",
  },
  {
    label: "Manuscript prep",
    href: "#manuscript-notes",
    id: "manuscript-notes",
  },
  {
    label: 'Production sample ("First 15")',
    href: "#production-sample",
    id: "production-sample",
  },
  {
    label: "Full narration and recording",
    href: "#recording-process",
    id: "recording-process",
  },
  {
    label: "Proofing, editing, mastering",
    href: "#delivery-review",
    id: "delivery-review",
  },
  {
    label: "Delivery and review",
    href: "#delivery-review",
    id: "delivery-review",
  },
  {
    label: "Final corrections",
    href: "#delivery-review",
    id: "delivery-review",
  },
  {
    label: "Payment and release",
    href: "#payment",
    id: "payment",
  },
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
              aria-current={active ? "location" : undefined}
              className={[
                "group inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814]",
                active
                  ? [
                      "border-[#D4AF37]/65",
                      "bg-[#D4AF37]/12",
                      "text-white",
                      "shadow-[0_0_0_1px_rgba(212,175,55,0.12),0_0_18px_rgba(212,175,55,0.12)]",
                    ].join(" ")
                  : [
                      "border-white/15",
                      "bg-white/[0.03]",
                      "text-white/85",
                      "hover:border-[#D4AF37]/50",
                      "hover:bg-[#D4AF37]/10",
                      "hover:text-white",
                    ].join(" "),
              ].join(" ")}
            >
              <span
                className={[
                  "h-2 w-2 shrink-0 rounded-full transition-all duration-200",
                  active
                    ? "bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.55)]"
                    : "bg-white/20 group-hover:bg-white/45",
                ].join(" ")}
              />
              <span>{item.label}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}