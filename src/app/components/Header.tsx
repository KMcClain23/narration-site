"use client";

import Image from "next/image";
import { BUSINESS, PROFILE_PHOTO_URL, ROLE_LABEL } from "@/lib/business-identity";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FaTiktok, FaInstagram, FaDiscord } from "react-icons/fa";
import { HiMenu, HiX } from "react-icons/hi";
import { usePathname } from "next/navigation";
import { isAdminRoute } from "@/lib/admin-routes";
import { SiteSearch } from "./SiteSearch";
import { useCart } from "@/context/CartContext";

const BOOKINGS_URL =
  "https://outlook.office.com/book/DeanMillerNarration1@deanmillernarrator.com/s/-Gzrs2xlgUy8MfSGaPUf1A2?ismsaljsauthenabled";

// Admin is its own world with no public chrome. Shared with middleware.ts
// rather than kept as a second copy: the copy that lived here fell a page
// behind the moment /expenses was added, and put the marketing navigation
// across the top of a private page.
const isAdminWorldRoute = isAdminRoute;

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const { count: cartCount, openCart } = useCart();
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();

  const toggleMenu = () => setIsOpen((v) => !v);
  const closeMenu = () => setIsOpen(false);

  const navLinks = useMemo(
    () => [
      { name: "Narrated Works", href: "/narrated-works" },
      { name: "Demos", href: "/demos" },
      { name: "Merch", href: "/merch" },
      { name: "About", href: "/#about" },
      { name: "Contact", href: "/#contact" },
    ],
    []
  );

  useEffect(() => {
    closeMenu();
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
    ? "bg-[#06082E]/55 backdrop-blur-xl border-b border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
    : "bg-[#06082E]/60 backdrop-blur-md border-b border-white/5";

  if (isAdminWorldRoute(pathname)) return null;

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 h-12 sm:h-16 transition-all duration-200 ${headerClass}`}>
      <div className="max-w-7xl mx-auto px-5 sm:px-6 h-12 sm:h-16 flex items-center justify-between">
        {/* Brand — an ordinary link, and it stays one.
            Five rapid clicks here used to open a shared-secret admin modal that
            POSTed to /api/admin/login. That route is gone and the browser signs
            in with email and password at /admin/login. R1's sweep missed this
            because it searched for ADMIN_SECRET_KEY and ADMIN_COOKIE_NAME, and
            this file named neither — it knew only the URL. */}
        <Link
          href="/"
          className="flex items-center gap-3 group"
          onClick={closeMenu}
        >
          <div className="h-9 w-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center overflow-hidden transition group-hover:border-[#D4AF37]/50 group-hover:bg-[#D4AF37]/10">
            <Image
              src={PROFILE_PHOTO_URL}
              alt={BUSINESS.name}
              width={36}
              height={36}
              className="object-cover"
              style={{ objectPosition: "center 30%" }}
              priority
            />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">{BUSINESS.name}</p>
            <p className="text-xs text-white/60 hidden sm:block">{ROLE_LABEL}</p>
          </div>
        </Link>

        {/* Right Section */}
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
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06082E] rounded",
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

          {/* Search */}
          <SiteSearch />

          {/* Social Links */}
          <div className="flex items-center gap-4 text-xl">
            <a
              href="https://www.tiktok.com/@deanmillernarration"
              target="_blank"
              rel="noopener noreferrer"
              className="md:hidden text-white/80 hover:text-[#D4AF37] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06082E] rounded"
              aria-label="TikTok"
            >
              <FaTiktok />
            </a>

            <div className="hidden md:flex items-center gap-4 text-xl">
              <a
                href="https://www.tiktok.com/@deanmillernarration"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 hover:text-[#D4AF37] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06082E] rounded"
                aria-label="TikTok"
              >
                <FaTiktok />
              </a>
              <a
                href="https://www.instagram.com/deanmillernarrator"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 hover:text-[#D4AF37] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06082E] rounded"
                aria-label="Instagram"
              >
                <FaInstagram />
              </a>
              <a
                href="https://discord.com/users/1425271466538045512"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 hover:text-[#D4AF37] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06082E] rounded"
                aria-label="Discord"
              >
                <FaDiscord />
              </a>
            </div>
          </div>

          {/* Cart button — only on merch pages */}
          {pathname.startsWith("/merch") && (
            <button
              onClick={openCart}
              aria-label="Open cart"
              className="relative p-1.5 text-white/70 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06082E] rounded"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#D4AF37] text-[#06082E] text-[10px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          )}

          {/* Hamburger Menu Toggle */}
          <button
            className="md:hidden text-2xl text-white bg-black/40 backdrop-blur-sm rounded-lg p-2 hover:bg-black/60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06082E]"
            onClick={toggleMenu}
            aria-label="Toggle Menu"
            aria-expanded={isOpen}
          >
            {isOpen ? <HiX /> : <HiMenu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen ? (
        <div className="md:hidden border-t border-white/15 bg-[#06082E] shadow-2xl">
          <nav className="max-w-7xl mx-auto px-5 sm:px-6 py-4">
            <div className="grid gap-2">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  className="rounded-lg px-3 py-3 text-white/85 hover:text-white hover:bg-white/5 transition text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06082E]"
                  href={link.href}
                  onClick={() => handleHashScroll(link.href)}
                >
                  {link.name}
                </a>
              ))}
            </div>

            <div className="mt-4 grid gap-3">
              <a
                href="/demos"
                className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-4 py-3 font-semibold transition hover:bg-[#E0C15A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06082E]"
              >
                Listen to demos
              </a>


            </div>
          </nav>
        </div>
      ) : null}

    </header>
  );
}