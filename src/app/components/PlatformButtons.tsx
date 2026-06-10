"use client";

function track(event: string, page: string, metadata: object) {
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, page, metadata }),
  }).catch(() => {});
}

const SpotifyIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const PlayIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.14v13.72l11-6.86L8 5.14z"/>
  </svg>
);

export function PlatformButtons({
  audibleUrl,
  spotifyUrl,
  arUrl,
  size = "md",
  className = "",
  bookTitle,
}: {
  audibleUrl?: string;
  spotifyUrl?: string;
  arUrl?: string;
  size?: "sm" | "md";
  className?: string;
  bookTitle?: string;
}) {
  const px = size === "sm" ? "px-3 py-1.5 text-xs" : "px-6 py-3 text-sm";
  const meta = bookTitle ? { title: bookTitle } : {};
  const page = typeof window !== "undefined" ? window.location.pathname : "";

  const buttons: React.ReactNode[] = [];

  if (audibleUrl?.trim()) {
    buttons.push(
      <a key="audible" href={audibleUrl} target="_blank" rel="noopener noreferrer"
        onClick={() => track("audible_link_clicked", page, meta)}
        className={`inline-flex items-center gap-2 bg-[#D4AF37] text-black font-bold rounded-full hover:bg-[#E0C15A] transition-colors ${px}`}>
        <PlayIcon />
        Listen on Audible
      </a>
    );
  }

  if (spotifyUrl?.trim()) {
    buttons.push(
      <a key="spotify" href={spotifyUrl} target="_blank" rel="noopener noreferrer"
        onClick={() => track("spotify_link_clicked", page, meta)}
        className={`inline-flex items-center gap-2 bg-[#1DB954] text-white font-bold rounded-full hover:bg-[#1ed760] transition-colors ${px}`}>
        <SpotifyIcon />
        Listen on Spotify
      </a>
    );
  }

  if (arUrl?.trim()) {
    buttons.push(
      <a key="ar" href={arUrl} target="_blank" rel="noopener noreferrer"
        onClick={() => track("ar_link_clicked", page, meta)}
        className={`inline-flex items-center gap-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-semibold rounded-full transition-colors ${px}`}>
        Listen on Authors Republic
      </a>
    );
  }

  if (buttons.length === 0) return null;
  return <div className={`flex flex-wrap gap-3 ${className}`}>{buttons}</div>;
}

/** Small colored dots indicating which platforms carry this title */
export function PlatformDots({
  audibleUrl,
  spotifyUrl,
}: {
  audibleUrl?: string;
  spotifyUrl?: string;
}) {
  if (!audibleUrl?.trim() && !spotifyUrl?.trim()) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      {audibleUrl?.trim() && (
        <span className="h-2 w-2 rounded-full bg-[#D4AF37]" title="Available on Audible" />
      )}
      {spotifyUrl?.trim() && (
        <span className="h-2 w-2 rounded-full bg-[#1DB954]" title="Available on Spotify" />
      )}
    </div>
  );
}
