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

      const offset = 120;
      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      // If the user is near the very bottom, force the last section active.
      // This prevents short final sections from never taking over.
      if (scrollY + viewportHeight >= documentHeight - 40) {
        setActiveId(sections[sections.length - 1].id);
        return;
      }

      const sectionsWithDistance = sections.map((section) => {
        const rect = section.getBoundingClientRect();
        return {
          id: section.id,
          top: rect.top,
          distance: Math.abs(rect.top - offset),
        };
      });

      // Prefer sections that have reached or passed the offset line.
      const passedSections = sectionsWithDistance.filter(
        (section) => section.top <= offset
      );

      if (passedSections.length > 0) {
        const closestPassed = passedSections.reduce((closest, section) =>
          section.top > closest.top ? section : closest
        );

        setActiveId(closestPassed.id);
        return;
      }

      // Fallback for top-of-page behavior
      const closestOverall = sectionsWithDistance.reduce((closest, section) =>
        section.distance < closest.distance ? section : closest
      );

      setActiveId(closestOverall.id);
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