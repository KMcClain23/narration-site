// Placeholder cover for under-NDA projects — shown instead of the real cover
// art on the public site.

// Buffer isn't available in the browser (this renders client-side) — use a
// URL-encoded data URI instead of base64 so no Node API is needed.
const NOISE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>
  <filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter>
  <rect width='100%' height='100%' filter='url(#n)' opacity='0.05'/>
</svg>`;
const NOISE_BG = `data:image/svg+xml,${encodeURIComponent(NOISE_SVG)}`;

export function ConfidentialCover() {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background: "linear-gradient(160deg, #2A1B3A 0%, #1B1024 60%, #150C1C 100%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{ backgroundImage: `url("${NOISE_BG}")` }}
      />
      <div className="absolute inset-3 rounded-lg border border-[#D4AF37]/25" />
      <svg
        className="h-10 w-10 text-[#C9A9DD]/70 relative z-10"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </div>
  );
}
