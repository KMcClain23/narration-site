import Link from "next/link";
import Image from "next/image";
import { adminType } from "@/lib/design-tokens";

// Matches the Board's existing stage colors (src/app/board/page.tsx COLUMNS),
// extended with a color for 'prepping' (added in Stage 2, after that
// palette was defined). Deliberately not a Stage-1 token — this reuses the
// Board's own established status language rather than inventing a new one.
const STATUS_STYLES: Record<string, string> = {
  audition: "bg-purple-900/35 text-purple-200",
  contracted: "bg-blue-900/35 text-blue-200",
  prepping: "bg-cyan-900/35 text-cyan-200",
  recording: "bg-yellow-900/25 text-yellow-200",
  editing: "bg-orange-900/25 text-orange-200",
  released: "bg-emerald-900/35 text-emerald-200",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

// The meaningful date per book: still-due date while active, actual release
// date once released — not created_at, which is just when the row was
// added and says nothing about the book itself.
function bookDisplayDate(book: { status: string; deadline: string | null; released_at: string | null }): string | null {
  const primary = book.status === "released" ? book.released_at : book.deadline;
  const fallback = book.status === "released" ? book.deadline : book.released_at;
  return primary ?? fallback ?? null;
}

export type BookTogetherRow = {
  id: string;
  title: string;
  cover_url: string | null;
  status: string;
  archived_at: string | null;
  deadline: string | null;
  released_at: string | null;
  // Omitted entirely for types that don't have it (e.g. authors) — the
  // format pill only renders when this is present and not "solo".
  narration_format?: string | null;
};

export function BooksTogetherSection({ books }: { books: BookTogetherRow[] }) {
  return (
    <div className="mt-8">
      <p className={adminType.title}>Books together ({books.length})</p>
      <div className="mt-3 space-y-2">
        {books.length === 0 ? (
          <p className={adminType.small}>No books together yet.</p>
        ) : (
          books.map(book => (
            <Link
              key={book.id}
              href={`/board?editCard=${book.id}`}
              className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-raised"
            >
              {/* Fixed height only — width follows each cover's natural aspect
                  ratio so non-2:3 covers never get cropped or squashed.
                  Squarer covers render wider (extra horizontal room within
                  the row); narrower/taller covers just use less width. */}
              <div className="flex h-[72px] shrink-0 items-center overflow-hidden rounded">
                {book.cover_url ? (
                  <Image
                    src={book.cover_url}
                    alt={book.title}
                    width={48}
                    height={72}
                    className="h-[72px] w-auto max-w-[96px] object-contain"
                  />
                ) : (
                  <div className="h-[72px] w-12 bg-background" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`${adminType.bodyMd} truncate text-text-primary`}>{book.title}</p>
                  {book.narration_format && book.narration_format !== "solo" && (
                    <span className="shrink-0 rounded bg-pill-neutral-bg px-2 py-0.5 text-[11px] capitalize text-pill-neutral-text">
                      {book.narration_format}
                    </span>
                  )}
                </div>
                {bookDisplayDate(book) && (
                  <p className="text-[12px] text-text-dim">{formatDate(bookDisplayDate(book)!)}</p>
                )}
              </div>
              {book.archived_at && (
                <span className="shrink-0 text-[11px] italic text-text-faint">archived</span>
              )}
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-[12px] font-medium capitalize ${STATUS_STYLES[book.status] ?? "bg-surface-raised text-text-muted"}`}
              >
                {book.status}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
