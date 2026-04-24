import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Narrated Works | Dean Miller — Audiobook Narrator Portfolio",
  description:
    "Browse the full audiobook portfolio of Dean Miller: dark romance, romantasy, LGBTQ+ fiction, thriller, and drama. Available on Audible and Amazon.",
  alternates: {
    canonical: "https://www.dmnarration.com/narrated-works",
  },
  openGraph: {
    title: "Narrated Works | Dean Miller — Audiobook Narrator Portfolio",
    description:
      "Character-driven audiobook narration across dark romance, romantasy, thriller, and more. Listen on Audible and Amazon.",
    url: "https://www.dmnarration.com/narrated-works",
    type: "website",
  },
};

export default function NarratedWorksLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
