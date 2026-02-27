"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FaTiktok, FaInstagram, FaDiscord } from "react-icons/fa";
import { HiMenu, HiX } from "react-icons/hi";
import { usePathname } from "next/navigation";

const BOOKINGS_URL =
  "https://outlook.office.com/book/DeanMillerNarration1@deanmillernarrator.com/s/-Gzrs2xlgUy8MfSGaPUf1A2?ismsaljsauthenabled";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();

  const toggleMenu = () => setIsOpen((v) => !v);
  const closeMenu = () => setIsOpen(false);

  const navLinks = useMemo(
    () => [
      { name: "Demos", href: "/#demos" },
      { name: "Narrated Works", href: "/narrated-works" },
      { name: "About", href: "/#about" },
      { name: "Contact", href: "/#contact" },
    ],
    []
  );

  useEffect(() => {
    closeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleHashScroll = (href: string) => {
    closeMenu();

    const isHashLink = href.includes("#");
    const isHome = pathname === "/";

    if (isHashLink && isHome) {
      const hash = href.split("#")[1];
      if (!hash) return;

      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const isActive = (href: string) => {
    if (href.startsWith("/#")) return pathname === "/";
    return pathname === href;
  };

  const headerClass = isScrolled
    ? "bg-[#050814]/55 backdrop-blur-xl border-b border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
    : "bg-transparent border-b border-white/10";

  return (
    <header className={`sticky top-0 z-50 transition-all duration-200 ${headerClass}`}>
      <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 group" onClick={closeMenu}>
          <div className="h-9 w-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-sm font-semibold text-white transition group-hover:border-[#D4AF37]/50 group-hover:bg-[#D4AF37]/10">
            DM
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Dean Miller</p>
            <p className="text-xs text-white/60">Audiobook Narrator</p>
          </div>
        </Link>

        {/* Right */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => handleHashScroll(link.href)}
                  className={[
                    "relative px-1 py-2 transition",
                    "text-white/80 hover:text-white",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814] rounded",
                    active ? "text-white" : "",
                  ].join(" ")}
                  aria-current={active ? "page" : undefined}
                >
                  {link.name}
                  <span
                    className={[
                      "pointer-events-none absolute left-0 right-0 -bottom-[2px] h-[2px] rounded-full transition",
                      active ? "bg-[#D4AF37]/80" : "bg-transparent",
                    ].join(" ")}
                  />
                </a>
              );
            })}
          </nav>

          {/* Desktop CTA */}
          <a
            href={BOOKINGS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "hidden md:inline-flex items-center justify-center",
              "rounded-md border border-white/20",
              "px-4 py-2 text-sm font-semibold",
              "text-white/90 bg-white/0",
              "hover:border-[#D4AF37]/60 hover:bg-white/10 hover:text-white transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814]",
            ].join(" ")}
          >
            Request availability
          </a>

          {/* Social */}
          <div className="flex items-center gap-4 text-xl">
            <a
              href="https://www.tiktok.com/@deanmillernarration"
              target="_blank"
              rel="noopener noreferrer"
              className="md:hidden text-white/80 hover:text-[#D4AF37] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814] rounded"
              aria-label="TikTok"
            >
              <FaTiktok />
            </a>

            <div className="hidden md:flex items-center gap-4 text-xl">
              <a
                href="https://www.tiktok.com/@deanmillernarration"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 hover:text-[#D4AF37] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814] rounded"
                aria-label="TikTok"
              >
                <FaTiktok />
              </a>
              <a
                href="https://www.instagram.com/deanmillernarrator"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 hover:text-[#D4AF37] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814] rounded"
                aria-label="Instagram"
              >
                <FaInstagram />
              </a>
              <a
                href="https://discord.com/users/1425271466538045512"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 hover:text-[#D4AF37] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814] rounded"
                aria-label="Discord"
              >
                <FaDiscord />
              </a>
            </div>
          </div>

          {/* Hamburger */}
          <button
            className="md:hidden text-2xl text-white/80 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814] rounded"
            onClick={toggleMenu}
            aria-label="Toggle Menu"
            aria-expanded={isOpen}
          >
            {isOpen ? <HiX /> : <HiMenu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen ? (
        <div className="md:hidden border-t border-white/10 bg-[#050814]/75 backdrop-blur-xl">
          <nav className="max-w-6xl mx-auto px-5 sm:px-6 py-4">
            <div className="grid gap-2">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  className="rounded-lg px-3 py-3 text-white/85 hover:text-white hover:bg-white/5 transition text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814]"
                  href={link.href}
                  onClick={() => handleHashScroll(link.href)}
                >
                  {link.name}
                </a>
              ))}
            </div>

            <div className="mt-4 grid gap-3">
              <a
                href="/#demos"
                onClick={() => handleHashScroll("/#demos")}
                className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-4 py-3 font-semibold transition hover:bg-[#E0C15A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814]"
              >
                Listen to demos
              </a>

              <a
                href={BOOKINGS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-white/20 px-4 py-3 font-semibold text-white/90 hover:border-[#D4AF37]/60 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814]"
              >
                Request availability
              </a>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}