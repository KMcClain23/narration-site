"use client";

import { useEffect, useMemo, useState } from "react";
import { welcomeNavItems } from "./welcomeNavItems";

export function useActiveWelcomeSection() {
  const [activeId, setActiveId] = useState<string>("welcome");

  const sectionIds = useMemo(
    () => welcomeNavItems.map((item) => item.id),
    []
  );

  useEffect(() => {
    const updateActiveSection = () => {
      const sections = sectionIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => Boolean(el));

      if (sections.length === 0) return;

      // Keep this aligned with your sticky header and scroll-mt-24.
      const offset = 120;

      // Find all sections that have crossed the offset line.
      const pastSections = sections.filter(
        (section) => section.getBoundingClientRect().top <= offset
      );

      if (pastSections.length > 0) {
        // Pick the closest one to the offset line from above.
        const current = pastSections.reduce((closest, section) => {
          return section.getBoundingClientRect().top >
            closest.getBoundingClientRect().top
            ? section
            : closest;
        });

        setActiveId(current.id);
        return;
      }

      setActiveId(sections[0].id);
    };

    updateActiveSection();

    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    window.addEventListener("hashchange", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
      window.removeEventListener("hashchange", updateActiveSection);
    };
  }, [sectionIds]);

  return activeId;
}