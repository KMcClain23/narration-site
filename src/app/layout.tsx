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
  // Title expanded to ~58 chars to hit the "Optimal" 50-60 range
  title: "Dean Miller Narrator | Professional Audiobook Voice Artist", 
  
  // Description expanded to ~155 chars to hit the "Optimal" 110-160 range
  description: "Professional audiobook narrator specializing in character-driven stories for Dark Romance, Romantasy, and Drama. Broadcast-ready audio focused on emotional truth.", 

  openGraph: {
    title: "Dean Miller Narrator | Professional Audiobook Voice Artist",
    description: "Character-driven narration for Dark Romance, Romantasy, and Drama. Explore demos and request availability for your next audiobook project.",
    url: "https://narration-site.vercel.app/",
    siteName: "Dean Miller Narrator",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Dean Miller Narrator - Audiobook Voice Artist",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dean Miller Narrator | Audiobook Voice Artist",
    description: "Professional narration specializing in Dark Romance, Romantasy, and Drama.",
  },
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
        {children}
      </body>
    </html>
  );
}