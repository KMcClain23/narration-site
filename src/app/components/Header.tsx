"use client";

import { useState } from "react";
import { FaTiktok, FaInstagram, FaDiscord } from "react-icons/fa";
import { HiMenu, HiX } from "react-icons/hi"; // Hamburger and Close icons

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);

  const navLinks = [
    { name: "Demos", href: "/#demos" },
    { name: "Narrated Works", href: "/narrated-works" },
    { name: "About", href: "/#about" },
    { name: "Contact", href: "/#contact" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo / Name */}
        <a href="/" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-sm font-semibold text-white">
            DM
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Dean Miller</p>
            <p className="text-xs text-white/60">Narrator</p>
          </div>
        </a>

        {/* Right Section: Desktop Nav + Socials + Hamburger */}
        <div className="flex items-center gap-6">
          {/* Desktop Nav Links (Hidden on small screens) */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
            {navLinks.map((link) => (
              <a key={link.name} className="hover:text-white transition" href={link.href}>
                {link.name}
              </a>
            ))}
          </nav>

          {/* Social Icons (Visible on all screens) */}
          <div className="flex items-center gap-4 text-xl">
            <a href="https://www.tiktok.com/@deanmillernarration" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-[#D4AF37] transition" aria-label="TikTok">
              <FaTiktok />
            </a>
            <a href="https://www.instagram.com/deanmillernarrator" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-[#D4AF37] transition" aria-label="Instagram">
              <FaInstagram />
            </a>
            <a href="https://discord.com/users/edgetoruin" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-[#D4AF37] transition" aria-label="Discord">
              <FaDiscord />
            </a>
          </div>

          {/* Hamburger Button (Mobile only) */}
          <button 
            className="md:hidden text-2xl text-white/80 hover:text-white"
            onClick={toggleMenu}
            aria-label="Toggle Menu"
          >
            {isOpen ? <HiX /> : <HiMenu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown (Animated visibility) */}
      <div className={`${isOpen ? "block" : "hidden"} md:hidden bg-black/90 border-t border-white/10`}>
        <nav className="flex flex-col p-6 gap-4">
          {navLinks.map((link) => (
            <a 
              key={link.name} 
              className="text-white/80 hover:text-white text-lg font-medium" 
              href={link.href}
              onClick={() => setIsOpen(false)} // Close menu on click
            >
              {link.name}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}