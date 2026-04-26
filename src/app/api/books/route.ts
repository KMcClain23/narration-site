import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Book, BookCategory } from "@/types/book";

type CreateBookBody = {
  title?: string;
  subtitle?: string;
  author?: string;
  link?: string;
  co_narrator?: string;
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

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("books")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      books: data,
    });
  } catch (error) {
    console.error("GET /api/books failed:", error);

    return NextResponse.json(
      {
        error: "Failed to load books.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
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
      co_narrator = "",
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
        co_narrator: co_narrator.trim(),
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
      co_narrator: updatedBook.co_narrator?.trim() || "",
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