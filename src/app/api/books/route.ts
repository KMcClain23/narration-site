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

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function findBookIndex(books: Book[], title: string, author: string) {
  return books.findIndex(
    (book) =>
      normalize(book.title) === normalize(title) &&
      normalize(book.author) === normalize(author)
  );
}

export async function GET() {
  try {
    const books = await readBooks();

    return NextResponse.json({
      success: true,
      books,
    });
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
    } = body as {
      title?: string;
      subtitle?: string;
      author?: string;
      link?: string;
      cover?: string;
      tags?: string[];
      description?: string;
      category?: BookCategory;
    };

    if (!title || !author || !cover || !category) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const books = await readBooks();

    const alreadyExists = books.some(
      (book) =>
        normalize(book.title) === normalize(title) &&
        normalize(book.author) === normalize(author)
    );

    if (alreadyExists) {
      return NextResponse.json(
        { error: "That book already exists." },
        { status: 409 }
      );
    }

    const newBook: Book = {
      title: title.trim(),
      subtitle: subtitle?.trim() || undefined,
      author: author.trim(),
      link: link.trim(),
      cover: cover.trim(),
      tags: Array.isArray(tags) ? tags : [],
      description: description.trim(),
      category,
    };

    books.push(newBook);
    await writeBooks(books);

    return NextResponse.json({
      success: true,
      message: "Book added successfully.",
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
    const bookIndex = findBookIndex(books, title, author);

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

export async function PUT(req: Request) {
  try {
    const body = await req.json();

    const {
      originalTitle,
      originalAuthor,
      updatedBook,
    }: {
      originalTitle?: string;
      originalAuthor?: string;
      updatedBook?: Book;
    } = body;

    if (!originalTitle || !originalAuthor || !updatedBook) {
      return NextResponse.json(
        { error: "Missing required fields for edit." },
        { status: 400 }
      );
    }

    if (!updatedBook.title || !updatedBook.author || !updatedBook.cover || !updatedBook.category) {
      return NextResponse.json(
        { error: "Updated book is missing required fields." },
        { status: 400 }
      );
    }

    const books = await readBooks();
    const bookIndex = findBookIndex(books, originalTitle, originalAuthor);

    if (bookIndex === -1) {
      return NextResponse.json(
        { error: "Original book not found." },
        { status: 404 }
      );
    }

    const duplicateIndex = books.findIndex(
      (book, index) =>
        index !== bookIndex &&
        normalize(book.title) === normalize(updatedBook.title) &&
        normalize(book.author) === normalize(updatedBook.author)
    );

    if (duplicateIndex !== -1) {
      return NextResponse.json(
        { error: "Another book already uses that title and author." },
        { status: 409 }
      );
    }

    const sanitizedBook: Book = {
      title: updatedBook.title.trim(),
      subtitle: updatedBook.subtitle?.trim() || undefined,
      author: updatedBook.author.trim(),
      link: updatedBook.link?.trim() || "",
      cover: updatedBook.cover.trim(),
      tags: Array.isArray(updatedBook.tags)
        ? updatedBook.tags.map((tag) => tag.trim()).filter(Boolean)
        : [],
      description: updatedBook.description?.trim() || "",
      category: updatedBook.category,
    };

    books[bookIndex] = sanitizedBook;
    await writeBooks(books);

    return NextResponse.json({
      success: true,
      message: "Book updated successfully.",
      book: sanitizedBook,
    });
  } catch (error) {
    console.error("PUT /api/books failed:", error);

    return NextResponse.json(
      { error: "Failed to update book." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();

    const {
      title,
      author,
    }: {
      title?: string;
      author?: string;
    } = body;

    if (!title || !author) {
      return NextResponse.json(
        { error: "Missing required fields for delete." },
        { status: 400 }
      );
    }

    const books = await readBooks();
    const bookIndex = findBookIndex(books, title, author);

    if (bookIndex === -1) {
      return NextResponse.json(
        { error: "Book not found." },
        { status: 404 }
      );
    }

    const [deletedBook] = books.splice(bookIndex, 1);
    await writeBooks(books);

    return NextResponse.json({
      success: true,
      message: "Book deleted successfully.",
      book: deletedBook,
    });
  } catch (error) {
    console.error("DELETE /api/books failed:", error);

    return NextResponse.json(
      { error: "Failed to delete book." },
      { status: 500 }
    );
  }
}