import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Narrated Works | Dean Miller Audiobook Narrator",
  description:
    "Browse Dean Miller's complete audiobook portfolio — dark romance, romantasy, thriller and more. Available on Audible and ACX.",
  openGraph: {
    title: "Narrated Works | Dean Miller Audiobook Narrator",
    description:
      "Browse Dean Miller's complete audiobook portfolio — dark romance, romantasy, thriller and more.",
    url: "https://www.dmnarration.com/narrated-works",
    siteName: "Dean Miller Narration",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Narrated Works | Dean Miller Audiobook Narrator",
    description: "Browse Dean Miller's complete audiobook portfolio.",
    images: ["/opengraph-image.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
