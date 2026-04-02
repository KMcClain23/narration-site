import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { Book, BookCategory } from "@/types/book";

const filePath = path.join(process.cwd(), "src", "data", "books.json");

async function readBooks(): Promise<Book[]> {
  const fileContents = await fs.readFile(filePath, "utf-8");
  return JSON.parse(fileContents) as Book[];
}

async function writeBooks(books: Book[]) {
  await fs.writeFile(filePath, JSON.stringify(books, null, 2), "utf-8");
}

export async function GET() {
  try {
    const books = await readBooks();
    return NextResponse.json({ success: true, books });
  } catch (error) {
    console.error("GET /api/books failed:", error);

    return NextResponse.json(
      { error: "Failed to load books." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      title,
      subtitle = "",
      author,
      link = "",
      cover,
      tags = [],
      description = "",
      category,
    } = body;

    if (!title || !author || !cover || !category) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const books = await readBooks();

    const alreadyExists = books.some(
      (book) =>
        book.title.trim().toLowerCase() === title.trim().toLowerCase() &&
        book.author.trim().toLowerCase() === author.trim().toLowerCase()
    );

    if (alreadyExists) {
      return NextResponse.json(
        { error: "That book already exists." },
        { status: 409 }
      );
    }

    const newBook: Book = {
      title,
      subtitle: subtitle || undefined,
      author,
      link,
      cover,
      tags: Array.isArray(tags) ? tags : [],
      description,
      category,
    };

    books.push(newBook);
    await writeBooks(books);

    return NextResponse.json({
      success: true,
      message: "Book saved successfully.",
      book: newBook,
    });
  } catch (error) {
    console.error("POST /api/books failed:", error);

    return NextResponse.json(
      { error: "Failed to save book." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    const {
      title,
      author,
      newCategory,
    }: {
      title?: string;
      author?: string;
      newCategory?: BookCategory;
    } = body;

    if (!title || !author || !newCategory) {
      return NextResponse.json(
        { error: "Missing required fields for category update." },
        { status: 400 }
      );
    }

    const books = await readBooks();

    const bookIndex = books.findIndex(
      (book) =>
        book.title.trim().toLowerCase() === title.trim().toLowerCase() &&
        book.author.trim().toLowerCase() === author.trim().toLowerCase()
    );

    if (bookIndex === -1) {
      return NextResponse.json(
        { error: "Book not found." },
        { status: 404 }
      );
    }

    books[bookIndex].category = newCategory;

    await writeBooks(books);

    return NextResponse.json({
      success: true,
      message: "Book category updated successfully.",
      book: books[bookIndex],
    });
  } catch (error) {
    console.error("PATCH /api/books failed:", error);

    return NextResponse.json(
      { error: "Failed to update book category." },
      { status: 500 }
    );
  }
}