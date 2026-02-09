"use client";

import { FaTiktok, FaInstagram, FaDiscord } from "react-icons/fa";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo / Name – now links to homepage root */}
        <a href="/" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-sm font-semibold text-white">
            DM
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Dean Miller</p>
            <p className="text-xs text-white/60">Narrator</p>
          </div>
        </a>

        {/* Navigation + Social Icons */}
        <div className="flex items-center gap-6 md:gap-8">
          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
            <a className="hover:text-white transition" href="/#demos">
              Demos
            </a>
            <a className="hover:text-white transition" href="/narrated-works">
              Narrated Works
            </a>
            <a className="hover:text-white transition" href="/#about">
              About
            </a>
            <a className="hover:text-white transition" href="/#contact">
              Contact
            </a>
          </nav>

          {/* Social Icons */}
          <div className="flex items-center gap-5 text-xl md:text-2xl">
            {/* TikTok */}
            <a
              href="https://www.tiktok.com/@deanmillernarration"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-[#D4AF37] transition"
              aria-label="TikTok"
            >
              <FaTiktok />
            </a>

            {/* Instagram */}
            <a
              href="https://www.instagram.com/deanmillernarrator"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-[#D4AF37] transition"
              aria-label="Instagram"
            >
              <FaInstagram />
            </a>

            {/* Discord – profile link */}
            <a
              href="https://discord.com/users/edgetoruin" // ← replace with your actual ID
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-[#D4AF37] transition"
              aria-label="Discord"
            >
              <FaDiscord />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}