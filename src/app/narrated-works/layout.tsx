import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Narrated Works | Dean Miller Audiobook Portfolio",
  description:
    "Browse the audiobook portfolio of Dean Miller. Featuring narrated works in dark romance, romantasy, and thriller genres available on Audible and Amazon.",
  alternates: {
    canonical: "https://dmnarration.com/narrated-works",
  },
  openGraph: {
    title: "Narrated Works | Dean Miller Audiobook Portfolio",
    description:
      "Listen to the latest audiobook projects narrated by Dean Miller, specializing in character-driven fiction.",
    url: "https://dmnarration.com/narrated-works",
    type: "website",
  },
};

export default function NarratedWorksLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}