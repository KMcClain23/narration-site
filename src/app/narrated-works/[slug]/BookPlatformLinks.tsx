// Pure server component — no tracking, no "use client" needed.
// Renders one pill per available platform link on the book detail page.

const HeadphonesIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3C7.03 3 3 7.03 3 12v5a2 2 0 002 2h1a1 1 0 001-1v-5a1 1 0 00-1-1H4.07C4.56 7.67 7.96 5 12 5s7.44 2.67 7.93 6H18a1 1 0 00-1 1v5a1 1 0 001 1h1a2 2 0 002-2v-5c0-4.97-4.03-9-9-9z" />
  </svg>
);

const SpotifyIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);

const BookOpenIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
    <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
  </svg>
);

export function BookPlatformLinks({
  audibleUrl,
  spotifyUrl,
  arUrl,
}: {
  audibleUrl?: string | null;
  spotifyUrl?: string | null;
  arUrl?: string | null;
}) {
  const hasPills = audibleUrl?.trim() || spotifyUrl?.trim() || arUrl?.trim();
  if (!hasPills) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {audibleUrl?.trim() && (
        <a
          href={audibleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#D4AF37] text-black font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-[#E0C15A] transition-colors"
        >
          <HeadphonesIcon />
          Audible
        </a>
      )}

      {spotifyUrl?.trim() && (
        <a
          href={spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#1DB954] text-white font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-[#1ed760] transition-colors"
        >
          <SpotifyIcon />
          Spotify
        </a>
      )}

      {arUrl?.trim() && (
        <a
          href={arUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-semibold text-sm px-5 py-2.5 rounded-full transition-colors"
        >
          <BookOpenIcon />
          Authors Republic
        </a>
      )}
    </div>
  );
}
