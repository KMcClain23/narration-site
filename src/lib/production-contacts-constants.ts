// Shared between the new /contacts/production-companies UI and PersonForm —
// these values must exactly match the existing /admin/contacts CRM
// (ContactsClient.tsx) since both read/write the same production_contacts
// rows. Do not drift these from that file without updating both.

export const STATUSES = [
  { value: "", label: "Needs Contact", bg: "bg-red-500/15", border: "border-red-500/25", text: "text-red-300" },
  { value: "contacted", label: "Contacted", bg: "bg-amber-500/15", border: "border-amber-500/25", text: "text-amber-300" },
  { value: "waiting", label: "Waiting on Reply", bg: "bg-blue-500/15", border: "border-blue-500/25", text: "text-blue-300" },
  { value: "replied", label: "Received Reply", bg: "bg-emerald-500/15", border: "border-emerald-500/25", text: "text-emerald-300" },
] as const;

export function statusMeta(value: string) {
  return STATUSES.find(s => s.value === value) ?? STATUSES[0];
}

export const CANONICAL_GENRES = [
  "Biography", "Business", "Childrens", "Classics", "Comics",
  "Erotica", "Faith-based", "Fantasy", "Fiction", "Health",
  "History", "Horror", "Humor", "LGBTQ+", "LitPRG", "Memoir",
  "Mystery", "Non-fiction", "Romance", "Sci-Fi", "Self-Help",
  "Short Story/Anthology", "Suspense", "Thriller", "Travel",
  "True Crime", "Western", "Young Adult",
];

const CANONICAL_GENRES_SET = new Set(CANONICAL_GENRES);

// The genres text[] column also holds free-text operational notes some
// contacts were tagged with (e.g. "Roster is by invite ONLY!") — the old
// ContactsClient splits these from real genres rather than treating them as
// chips. Matches that exact split so the two UIs never show different data.
export function realGenres(genres: string[]): string[] {
  return genres.filter(g => CANONICAL_GENRES_SET.has(g));
}

export function genreNotes(genres: string[]): string[] {
  return genres.filter(g => !CANONICAL_GENRES_SET.has(g));
}

export function isValidDate(raw: string): boolean {
  return !!raw && !isNaN(new Date(raw).getTime());
}

export function isOverdue(raw: string): boolean {
  if (!isValidDate(raw)) return false;
  return new Date(raw) < new Date(new Date().toDateString());
}

export function formatDateSafe(raw: string): string {
  if (!isValidDate(raw)) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(raw));
}

// job_titles and contact_names are two independent text[] columns with no
// shared key beyond array position — a stopgap until the schema is properly
// modernized into a real roster table (Stage 8+ per the Stage 4.3 plan).
// Zips them by index, padding the shorter with "" so rows always line up.
export function zipRoster(names: string[], jobTitles: string[], context?: string): { name: string; jobTitle: string }[] {
  if (names.length !== jobTitles.length && context) {
    console.warn(`[production-contacts] roster array length mismatch for "${context}": ${names.length} names vs ${jobTitles.length} job titles`);
  }
  const len = Math.max(names.length, jobTitles.length);
  return Array.from({ length: len }, (_, i) => ({ name: names[i] ?? "", jobTitle: jobTitles[i] ?? "" }));
}
