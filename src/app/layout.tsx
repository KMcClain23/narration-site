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
  title: "Dean Miller Narrator",
  description: "Professional audiobook narrator specializing in character-driven stories.",
  // These additions ensure your opengraph-image.png is used correctly
  openGraph: {
    title: "Dean Miller Narrator",
    description: "Character-driven narration for Dark Romance, Romantasy, and Drama.",
    url: "https://narration-site.vercel.app/",
    siteName: "Dean Miller Narrator",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dean Miller Narrator",
    description: "Professional audiobook narrator specializing in character-driven stories.",
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