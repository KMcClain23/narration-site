import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { Book } from "@/types/book";

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

    const filePath = path.join(process.cwd(), "src", "data", "books.json");
    const fileContents = await fs.readFile(filePath, "utf-8");
    const books = JSON.parse(fileContents) as Book[];

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

    await fs.writeFile(filePath, JSON.stringify(books, null, 2), "utf-8");

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