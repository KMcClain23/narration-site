"use client";

import { useEffect, useState } from "react";
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

  const navLinks = [
    { name: "Demos", href: "/#demos" },
    { name: "Narrated Works", href: "/narrated-works" },
    { name: "About", href: "/#about" },
    { name: "Contact", href: "/#contact" },
  ];

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
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNavClick = (href: string) => {
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

  const headerBase =
    "sticky top-0 z-50 transition-colors duration-200 backdrop-blur-xl";

  // Not scrolled: very subtle tint so it blends with hero and never reveals white
  // Scrolled: darker glass, still not gray
  const headerStyle = isScrolled
    ? "bg-[#050814]/90 border-b border-white/10"
    : "bg-[#050814]/35 border-b border-white/0";

  return (
    <header className={`${headerBase} ${headerStyle}`}>
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-3" onClick={closeMenu}>
          <div className="h-9 w-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-sm font-semibold text-white">
            DM
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Dean Miller</p>
            <p className="text-xs text-white/60">Narrator</p>
          </div>
        </a>

        <div className="flex items-center gap-4 sm:gap-6">
          <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
            {navLinks.map((link) => (
              <a
                key={link.name}
                className="hover:text-white transition"
                href={link.href}
                onClick={() => handleNavClick(link.href)}
              >
                {link.name}
              </a>
            ))}
          </nav>

          <a
            href={BOOKINGS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="
              hidden md:inline-flex items-center justify-center
              rounded-md border border-white/20
              bg-white/5
              px-4 py-2 text-sm font-semibold
              text-white/90
              hover:border-[#D4AF37]/60 hover:bg-white/10 hover:text-white
              transition
            "
          >
            Request availability
          </a>

          <div className="flex items-center gap-4 text-xl">
            <a
              href="https://www.tiktok.com/@deanmillernarration"
              target="_blank"
              rel="noopener noreferrer"
              className="md:hidden text-white/80 hover:text-[#D4AF37] transition"
              aria-label="TikTok"
            >
              <FaTiktok />
            </a>

            <div className="hidden md:flex items-center gap-4 text-xl">
              <a
                href="https://www.tiktok.com/@deanmillernarration"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 hover:text-[#D4AF37] transition"
                aria-label="TikTok"
              >
                <FaTiktok />
              </a>
              <a
                href="https://www.instagram.com/deanmillernarrator"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 hover:text-[#D4AF37] transition"
                aria-label="Instagram"
              >
                <FaInstagram />
              </a>
              <a
                href="https://discord.com/users/1425271466538045512"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 hover:text-[#D4AF37] transition"
                aria-label="Discord"
              >
                <FaDiscord />
              </a>
            </div>
          </div>

          <button
            className="md:hidden text-2xl text-white/80 hover:text-white transition"
            onClick={toggleMenu}
            aria-label="Toggle Menu"
            aria-expanded={isOpen}
          >
            {isOpen ? <HiX /> : <HiMenu />}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div className="md:hidden border-t border-white/10 bg-[#050814]/95 backdrop-blur-xl">
          <nav className="max-w-6xl mx-auto px-5 sm:px-6 py-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.22em] text-white/60">
                Social
              </p>
              <div className="flex items-center gap-4 text-xl">
                <a
                  href="https://www.tiktok.com/@deanmillernarration"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/80 hover:text-[#D4AF37] transition"
                  aria-label="TikTok"
                >
                  <FaTiktok />
                </a>
                <a
                  href="https://www.instagram.com/deanmillernarrator"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/80 hover:text-[#D4AF37] transition"
                  aria-label="Instagram"
                >
                  <FaInstagram />
                </a>
                <a
                  href="https://discord.com/users/1425271466538045512"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/80 hover:text-[#D4AF37] transition"
                  aria-label="Discord"
                >
                  <FaDiscord />
                </a>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  className="rounded-lg px-3 py-3 text-white/85 hover:text-white hover:bg-white/5 transition text-base font-medium"
                  href={link.href}
                  onClick={() => handleNavClick(link.href)}
                >
                  {link.name}
                </a>
              ))}
            </div>

            <div className="mt-4 grid gap-3">
              <a
                href="/#demos"
                onClick={() => handleNavClick("/#demos")}
                className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-4 py-3 font-semibold transition hover:bg-[#E0C15A]"
              >
                Listen to demos
              </a>

              <a
                href={BOOKINGS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-white/20 px-4 py-3 font-semibold text-white/90 hover:border-[#D4AF37]/60 hover:text-white transition"
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
