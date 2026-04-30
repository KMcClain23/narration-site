import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Book, BookCategory } from "@/types/book";

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

export async function GET() {
  try {
    // Source of truth is board_cards — no separate books table to maintain.
    // Exclude audition-stage cards (not public yet) and cards without a cover.
    const { data, error } = await supabaseAdmin
      .from("board_cards")
      .select("id, title, subtitle, author, cover_url, audible_link, ar_link, co_narrator, tags, description, sort_order, status")
      .in("status", ["contracted", "recording", "editing", "released"])
      .order("sort_order", { ascending: true })
      .order("title",      { ascending: true });

    if (error) throw error;

    const books = (data || [])
      .filter((c: Record<string, unknown>) => c.cover_url) // skip cards with no cover
      .map((card: Record<string, unknown>) => {
        // Normalize co_narrator (may be JSON string, array, or plain string)
        let cn = card.co_narrator;
        if (!cn) cn = [];
        else if (typeof cn === "string") {
          try { cn = JSON.parse(cn); } catch { cn = cn ? [cn] : []; }
        }
        if (!Array.isArray(cn)) cn = [cn];

        return {
          id:          card.id,
          title:       card.title,
          subtitle:    card.subtitle || null,
          author:      card.author,
          link:        (card.audible_link as string) || "",
          ar_link:     (card.ar_link     as string) || "",
          cover_url:   (card.cover_url   as string),
          tags:        Array.isArray(card.tags) ? card.tags : [],
          description: (card.description as string) || "",
          category:    STATUS_TO_CATEGORY[card.status as string] ?? "coming-soon",
          co_narrator: (cn as unknown[]).filter(Boolean),
          sort_order:  (card.sort_order  as number) || 0,
        };
      });

    // Deduplicate by title+author (safety net for edge cases)
    const seen = new Set<string>();
    const deduped = books.filter((b) => {
      const key = `${String(b.title).trim().toLowerCase()}||${String(b.author).trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

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