import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "./components/Header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dmnarration.com"),

  title:
    "Hire Dean Miller | Professional Audiobook Narrator | Character Driven Performance",

  description:
    "Professional audiobook narrator delivering emotionally grounded, character driven performances across fiction genres. Broadcast quality audio, fast turnaround, and collaborative production.",

  openGraph: {
    title:
      "Hire Dean Miller | Professional Audiobook Narrator | Character Driven Performance",
    description:
      "Explore audiobook narration demos and request availability. Emotionally immersive, character driven performance with broadcast quality audio.",
    url: "https://dmnarration.com/",
    siteName: "Dean Miller Narration",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Dean Miller Narration - Professional Audiobook Narrator",
      },
    ],
    locale: "en_US",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title:
      "Hire Dean Miller | Professional Audiobook Narrator | Character Driven Performance",
    description:
      "Explore audiobook narration demos and request availability. Broadcast quality, emotionally immersive performance.",
    images: ["/opengraph-image.png"],
  },
};

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Dean Miller",
  jobTitle: "Audiobook Narrator",
  url: "https://dmnarration.com/",
  description:
    "Professional audiobook narrator delivering character driven, emotionally immersive performances across fiction genres.",
  knowsAbout: [
    "Audiobook narration",
    "Character driven storytelling",
    "Emotional dialogue performance",
    "Multi character voice acting",
    "Romance audiobooks",
    "Romantasy audiobooks",
    "Drama audiobooks",
    "Thriller audiobooks",
  ],
  sameAs: [
    "https://www.acx.com/narrator?p=A3DYAXR7JFPXPE",
    "https://www.audible.com/search?searchNarrator=Dean+Miller&ref_pageloadid=not_applicable&pf_rd_p=f6da0b63-439d-48a7-a859-b187b7c50705&pf_rd_r=N83F413HQWM3VFWET5VH&plink=jqnppclGL9EcQpHn&pageLoadId=mT2OfOyyKZ9uncuC&creativeId=16015ba4-2e2d-4ae3-93c5-e937781a25cd&ref=a_pd_Santa-_pin_narrator_2",
    "https://www.tiktok.com/@deanmillernarration",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth scroll-pt-24">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Header />

        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />

        {children}
      </body>
    </html>
  );
}
