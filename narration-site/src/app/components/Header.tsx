"use client";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-sm font-semibold text-white">
            DM
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Dean Miller</p>
            <p className="text-xs text-white/60">Narrator</p>
          </div>
        </a>

        <nav className="flex items-center gap-6 text-sm text-white/80">
          <a className="hover:text-white transition" href="#demos">
            Demos
          </a>
          <a className="hover:text-white transition" href="#about">
            About
          </a>
          <a className="hover:text-white transition" href="#contact">
            Contact
          </a>
        </nav>
      </div>
    </header>
  );
}
