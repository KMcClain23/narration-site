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
  // Audit Fix: Optimal character length for search engines
  title: "Dean Miller | Professional Audiobook Narrator", 
  description: "Professional audiobook narrator delivering character-driven, emotionally grounded performances for fiction. Broadcast quality audio and fast turnaround.",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png", // Audit Fix: Clears "No Apple touch icon specified" warning
  },
  alternates: {
    // Audit Fix: Prevents duplicate content issues
    canonical: "/", 
  },
  openGraph: {
    title: "Dean Miller | Professional Audiobook Narrator",
    description: "Explore audiobook narration demos and request availability. Emotionally immersive, character driven performance.",
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
    title: "Dean Miller | Professional Audiobook Narrator",
    description: "Explore audiobook narration demos. Broadcast quality, emotionally immersive performance.",
    images: ["/opengraph-image.png"],
  },
};

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Dean Miller",
  jobTitle: "Audiobook Narrator",
  url: "https://dmnarration.com/",
  description: "Professional audiobook narrator delivering character driven, emotionally immersive performances across fiction genres.",
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
    "https://www.audible.com/search?searchNarrator=Dean+Miller",
    "https://www.tiktok.com/@deanmillernarration",
  ],
};

const businessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Dean Miller Narration",
  image: "https://dmnarration.com/opengraph-image.png",
  "@id": "https://dmnarration.com",
  url: "https://dmnarration.com",
  address: {
    "@type": "PostalAddress",
    "addressLocality": "Cornelius",
    "addressRegion": "OR",
    "addressCountry": "US"
  },
  geo: {
    "@type": "GeoCoordinates",
    "latitude": 45.5187,
    "longitude": -123.0593
  },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday"
    ],
    "opens": "09:00",
    "closes": "17:00"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`scroll-smooth scroll-pt-24 ${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen bg-[#050814] text-white antialiased">
        <a href="#top" className="skip-link">
          Skip to content
        </a>

        <Header />

        {/* Person Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
        
        {/* Local Business Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(businessJsonLd) }}
        />

        {children}
      </body>
    </html>
  );
}