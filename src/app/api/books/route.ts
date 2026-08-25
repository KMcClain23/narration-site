import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Book, BookCategory } from "@/types/book";
import { requireAdmin } from "@/lib/require-admin";
import { rankCompleted } from "@/lib/book-ranking";

type CreateBookBody = {
  title?: string;
  subtitle?: string;
  author?: string;
  link?: string;
  co_narrator?: string[];
  cover_url?: string;
  tags?: string[];
  description?: string;
  category?: BookCategory;
  sort_order?: number;
};

type UpdateBookBody = {
  id?: string;
  updatedBook?: Partial<Book>;
};

type MoveBookBody = {
  id?: string;
  newCategory?: BookCategory;
};

type DeleteBookBody = {
  id?: string;
};

// board_cards.status → Book.category
const STATUS_TO_CATEGORY: Record<string, BookCategory> = {
  contracted: "coming-soon",
  recording:  "in-progress",
  editing:    "in-progress",
  released:   "completed",
};

type MappedCard = { id: unknown; title: unknown; subtitle: unknown; author: unknown; link: string; ar_link: string; spotify_link: string; cover_url: string; tags: unknown[]; description: string; category: string; co_narrator: unknown[]; sort_order: number; slug: string | null; is_confidential: boolean; narration_format: string | null; released_at: string | null; amazon_rating: number | null; amazon_review_count: number | null };

// Under-NDA cards keep their real title/author/cover/links in the DB (Dean
// still needs those on the admin board) but must never leak them to the
// public API response — so redaction happens here, at the source, rather
// than relying on every UI consumer to remember to hide fields correctly.
const CONFIDENTIAL_TITLE = "Untitled Project";

function mapCards(data: Record<string, unknown>[]): MappedCard[] {
  return data
    .filter((c) => c.cover_url)
    .map((card) => {
      let cn = card.co_narrator;
      if (!cn) cn = [];
      else if (typeof cn === "string") {
        try { cn = JSON.parse(cn); } catch { cn = cn ? [cn] : []; }
      }
      if (!Array.isArray(cn)) cn = [cn];

      const isConfidential = Boolean(card.is_confidential);

      if (isConfidential) {
        return {
          id:              card.id,
          title:           CONFIDENTIAL_TITLE,
          subtitle:        null,
          author:          "",
          link:            "",
          ar_link:         "",
          spotify_link:    "",
          cover_url:       "",
          tags:            Array.isArray(card.tags) ? card.tags : [],
          description:     "",
          category:        STATUS_TO_CATEGORY[card.status as string] ?? "coming-soon",
          co_narrator:     [],
          sort_order:      (card.sort_order as number) || 0,
          // Always id-based, never card.slug — the stored slug column is
          // usually auto-derived from the real title at creation time, which
          // would leak it right back out through the public URL.
          slug:            `confidential-${card.id}`,
          is_confidential: true,
          // Anonymized like every other identifying field on a confidential card.
          narration_format: null,
          // Withheld for the same reason: a release date plus a distinctive
          // rating and review count would identify the book as surely as the
          // title. The cost is that a confidential release sorts to the end of
          // Completed, which is the right trade.
          released_at: null,
          amazon_rating: null,
          amazon_review_count: null,
        };
      }

      return {
        id:          card.id,
        title:       card.title,
        subtitle:    card.subtitle || null,
        author:      card.author,
        link:         (card.audible_link  as string) || "",
        ar_link:      (card.ar_link      as string) || "",
        spotify_link: (card.spotify_link as string) || "",
        cover_url:   (card.cover_url   as string),
        tags:        Array.isArray(card.tags) ? card.tags : [],
        description: (card.description as string) || "",
        category:    STATUS_TO_CATEGORY[card.status as string] ?? "coming-soon",
        co_narrator: (cn as unknown[]).filter(Boolean),
        sort_order:  (card.sort_order  as number) || 0,
        slug:        (card.slug as string) || null,
        is_confidential: false,
        narration_format: (card.narration_format as string) || null,
        released_at: (card.released_at as string) || null,
        // Supabase hands numeric back as a string often enough to be worth
        // coercing here rather than discovering it in a comparator.
        amazon_rating: card.amazon_rating == null ? null : Number(card.amazon_rating),
        amazon_review_count: card.amazon_review_count == null ? null : Number(card.amazon_review_count),
      };
    });
}

export async function GET() {
  try {
    // Source of truth is board_cards. Try with slug first; fall back without
    // it if the column hasn't been migrated yet so the page never goes blank.
    // "prepping" belongs here: it sits between contracted and recording, both
    // of which are public, so omitting it made a title vanish from the public
    // page partway through the pipeline and reappear once recording started.
    const STATUS_FILTER = ["contracted", "prepping", "recording", "editing", "released"] as const;

    const primary = await supabaseAdmin
      .from("board_cards")
      .select("id, title, subtitle, author, cover_url, audible_link, ar_link, spotify_link, co_narrator, tags, description, sort_order, status, slug, deadline, first15_due, first_15_complete, is_confidential, narration_format, released_at, amazon_rating, amazon_review_count")
      .in("status", STATUS_FILTER)
      .is("archived_at", null)
      .order("sort_order",  { ascending: true })
      .order("title",       { ascending: true });

    let rows: Record<string, unknown>[];

    if (primary.error) {
      console.error("GET /api/books — primary query failed (slug column may be missing):", primary.error.message, primary.error.details ?? "");
      // Retry without slug
      const fallback = await supabaseAdmin
        .from("board_cards")
        .select("id, title, subtitle, author, cover_url, audible_link, ar_link, spotify_link, co_narrator, tags, description, sort_order, status, deadline, first15_due, first_15_complete, is_confidential, narration_format, released_at")
        .in("status", STATUS_FILTER)
        .is("archived_at", null)
        .order("sort_order", { ascending: true })
        .order("title",      { ascending: true });

      if (fallback.error) {
        console.error("GET /api/books — fallback query failed (is_confidential column may be missing):", fallback.error.message, fallback.error.details ?? "");
        // Retry without is_confidential either (migration not run yet)
        const fallback2 = await supabaseAdmin
          .from("board_cards")
          .select("id, title, subtitle, author, cover_url, audible_link, ar_link, spotify_link, co_narrator, tags, description, sort_order, status, deadline, first15_due, first_15_complete, released_at")
          .in("status", STATUS_FILTER)
          .is("archived_at", null)
          .order("sort_order", { ascending: true })
          .order("title",      { ascending: true });

        if (fallback2.error) {
          console.error("GET /api/books — fallback2 query also failed:", fallback2.error.message, fallback2.error.details ?? "");
          throw fallback2.error;
        }
        rows = (fallback2.data || []) as Record<string, unknown>[];
      } else {
        rows = (fallback.data || []) as Record<string, unknown>[];
      }
    } else {
      rows = (primary.data || []) as Record<string, unknown>[];
    }

    // Order by the earliest upcoming milestone — First 15 due date if not yet
    // complete, otherwise the full deadline — so cards line up by what's
    // actually due soonest, mirroring the internal board's sort logic.
    const earliestDue = (row: Record<string, unknown>): number => {
      const deadline = row.deadline as string | null;
      const first15Due = row.first_15_complete ? null : (row.first15_due as string | null);
      const candidates = [first15Due, deadline].filter(Boolean).map((d) => new Date(d as string).getTime());
      return candidates.length ? Math.min(...candidates) : Infinity;
    };
    rows.sort((a, b) => {
      const diff = earliestDue(a) - earliestDue(b);
      if (diff !== 0) return diff;
      const sortDiff = ((a.sort_order as number) || 0) - ((b.sort_order as number) || 0);
      if (sortDiff !== 0) return sortDiff;
      return String(a.title).localeCompare(String(b.title));
    });

    const books = mapCards(rows);

    // Deduplicate by title+author — confidential cards all share the same
    // redacted title/author, so key those by id instead or every one past
    // the first would get dropped as a "duplicate".
    const seen = new Set<string>();
    const deduped = books.filter((b) => {
      const key = b.is_confidential
        ? `confidential||${b.id}`
        : `${String(b.title).trim().toLowerCase()}||${String(b.author).trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    rankCompleted(deduped);

    return NextResponse.json({ success: true, books: deduped });
  } catch (error) {
    console.error("GET /api/books failed:", error);
    return NextResponse.json(
      { error: "Failed to load books.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await req.json()) as CreateBookBody;

    const {
      title,
      subtitle = "",
      author,
      link = "",
      co_narrator = [] as string[],
      cover_url,
      tags = [],
      description = "",
      category,
      sort_order = 0,
    } = body;

    if (!title || !author || !cover_url || !category) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("books")
      .insert({
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        author: author.trim(),
        link: link.trim(),
        cover_url: cover_url.trim(),
        tags: Array.isArray(tags)
          ? tags.map((tag) => tag.trim()).filter(Boolean)
          : [],
        description: description.trim(),
        category,
        sort_order,
        co_narrator: Array.isArray(co_narrator) ? co_narrator.filter(Boolean) : [],
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      book: data,
    });
  } catch (error) {
    console.error("POST /api/books failed:", error);

    return NextResponse.json(
      {
        error: "Failed to save book.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await req.json()) as UpdateBookBody;
    const { id, updatedBook } = body;

    if (!id || !updatedBook) {
      return NextResponse.json(
        { error: "Missing required fields for edit." },
        { status: 400 }
      );
    }

    const payload = {
      title: updatedBook.title?.trim(),
      subtitle: updatedBook.subtitle?.trim() || null,
      author: updatedBook.author?.trim(),
      link: updatedBook.link?.trim() || "",
      cover_url: updatedBook.cover_url?.trim(),
      tags: Array.isArray(updatedBook.tags)
        ? updatedBook.tags.map((tag) => tag.trim()).filter(Boolean)
        : undefined,
      description: updatedBook.description?.trim() || "",
      category: updatedBook.category,
      sort_order: updatedBook.sort_order ?? 0,
      co_narrator: Array.isArray(updatedBook.co_narrator) ? updatedBook.co_narrator.filter(Boolean) : [],
    };

    const { data, error } = await supabaseAdmin
      .from("books")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      book: data,
    });
  } catch (error) {
    console.error("PUT /api/books failed:", error);

    return NextResponse.json(
      {
        error: "Failed to update book.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await req.json()) as MoveBookBody;
    const { id, newCategory } = body;

    if (!id || !newCategory) {
      return NextResponse.json(
        { error: "Missing required fields for category update." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("books")
      .update({ category: newCategory })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      book: data,
    });
  } catch (error) {
    console.error("PATCH /api/books failed:", error);

    return NextResponse.json(
      {
        error: "Failed to update book category.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await req.json()) as DeleteBookBody;
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required id for delete." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("books")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("DELETE /api/books failed:", error);

    return NextResponse.json(
      {
        error: "Failed to delete book.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}