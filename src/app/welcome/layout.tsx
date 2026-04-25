import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Working Together | Dean Miller Narration",
  description:
    "Everything you need to know about working with Dean Miller: manuscript prep, character approvals, the First 15 review, delivery, and payment — from inquiry to final master.",
  alternates: {
    canonical: "https://www.dmnarration.com/welcome",
  },
  openGraph: {
    title: "Working Together | Dean Miller Narration",
    description:
      "A clear guide to Dean Miller's audiobook narration process — from manuscript handoff through final delivery.",
    url: "https://www.dmnarration.com/welcome",
    type: "website",
  },
};

export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
