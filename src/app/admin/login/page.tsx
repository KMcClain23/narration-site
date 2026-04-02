"use client";

import { useEffect, useMemo, useState } from "react";
import type { Book, BookCategory } from "@/types/book";

type FormState = {
  title: string;
  subtitle: string;
  author: string;
  link: string;
  description: string;
  tags: string;
  category: BookCategory;
};

const initialForm: FormState = {
  title: "",
  subtitle: "",
  author: "",
  link: "",
  description: "",
  tags: "",
  category: "completed",
};

const categoryLabels: Record<BookCategory, string> = {
  completed: "Completed Audiobook Projects",
  "in-progress": "Currently Narrating",
  "coming-soon": "Coming Soon to Audible",
};

type DragPayload = {
  title: string;
  author: string;
};

function AdminBookCard({
  book,
  onDragStart,
}: {
  book: Book;
  onDragStart: (book: Book) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(book)}
      className="rounded-xl border border-[#1A2550] bg-[#050814] p-4 shadow-md cursor-grab active:cursor-grabbing hover:border-[#D4AF37]/40 transition-colors"
    >
      <div className="flex items-start gap-3">
        <img
          src={book.cover}
          alt={`${book.title} cover`}
          className="h-20 w-14 rounded object-cover border border-[#1A2550]"
        />

        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white leading-tight">
            {book.title}
          </h3>

          {book.subtitle && (
            <p className="text-xs text-white/55 mt-1">{book.subtitle}</p>
          )}

          <p className="text-sm text-[#D4AF37] mt-1">{book.author}</p>

          <div className="mt-2 flex flex-wrap gap-1">
            {book.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] uppercase rounded-full border border-[#D4AF37]/30 px-2 py-0.5 text-[#D4AF37]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryColumn({
  category,
  books,
  onDropBook,
  draggedBook,
  setDraggedBook,
}: {
  category: BookCategory;
  books: Book[];
  onDropBook: (category: BookCategory) => void;
  draggedBook: DragPayload | null;
  setDraggedBook: (value: DragPayload | null) => void;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        onDropBook(category);
        setDraggedBook(null);
      }}
      className={`rounded-2xl border p-4 min-h-[320px] transition-all ${
        isOver
          ? "border-[#D4AF37] bg-[#0f1730]"
          : "border-[#1A2550] bg-[#0B1224]"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/90">
          {categoryLabels[category]}
        </h2>
        <span className="rounded-full bg-[#050814] border border-[#1A2550] px-2.5 py-1 text-xs text-white/60">
          {books.length}
        </span>
      </div>

      <div className="space-y-3">
        {books.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#1A2550] p-6 text-center text-sm text-white/40">
            {draggedBook
              ? "Drop book here"
              : "No books in this category"}
          </div>
        ) : (
          books.map((book) => (
            <AdminBookCard
              key={`${book.title}-${book.author}`}
              book={book}
              onDragStart={(dragged) =>
                setDraggedBook({
                  title: dragged.title,
                  author: dragged.author,
                })
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [draggedBook, setDraggedBook] = useState<DragPayload | null>(null);

  useEffect(() => {
    const loadBooks = async () => {
      try {
        setIsLoadingBooks(true);

        const response = await fetch("/api/books");
        const result = await response.json();

        if (!response.ok) {
          setStatus(result.error || "Failed to load books.");
          return;
        }

        setBooks(result.books || []);
      } catch (error) {
        console.error(error);
        setStatus("Failed to load books.");
      } finally {
        setIsLoadingBooks(false);
      }
    };

    loadBooks();
  }, []);

  const completedBooks = useMemo(
    () => books.filter((book) => book.category === "completed"),
    [books]
  );

  const inProgressBooks = useMemo(
    () => books.filter((book) => book.category === "in-progress"),
    [books]
  );

  const comingSoonBooks = useMemo(
    () => books.filter((book) => book.category === "coming-soon"),
    [books]
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setCoverFile(null);

    const fileInput = document.getElementById("cover-upload") as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const refreshBooks = async () => {
    const response = await fetch("/api/books");
    const result = await response.json();

    if (response.ok) {
      setBooks(result.books || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!coverFile) {
      setStatus("Please select a cover image.");
      return;
    }

    try {
      setIsSubmitting(true);
      setStatus("Uploading cover...");

      const imageFormData = new FormData();
      imageFormData.append("file", coverFile);

      const uploadResponse = await fetch("/api/upload-cover", {
        method: "POST",
        body: imageFormData,
      });

      const uploadResult = await uploadResponse.json();

      if (!uploadResponse.ok) {
        setStatus(uploadResult.error || "Failed to upload cover.");
        return;
      }

      setStatus("Saving book...");

      const saveResponse = await fetch("/api/books", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title,
          subtitle: form.subtitle,
          author: form.author,
          link: form.link,
          cover: uploadResult.coverPath,
          description: form.description,
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          category: form.category,
        }),
      });

      const saveResult = await saveResponse.json();

      if (!saveResponse.ok) {
        setStatus(saveResult.error || "Failed to save book.");
        return;
      }

      setStatus("Book added successfully.");
      resetForm();
      await refreshBooks();
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong while adding the book.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDropBook = async (targetCategory: BookCategory) => {
    if (!draggedBook) return;

    const currentBook = books.find(
      (book) =>
        book.title === draggedBook.title &&
        book.author === draggedBook.author
    );

    if (!currentBook) return;
    if (currentBook.category === targetCategory) return;

    const previousBooks = books;

    const updatedBooks = books.map((book) =>
      book.title === draggedBook.title && book.author === draggedBook.author
        ? { ...book, category: targetCategory }
        : book
    );

    setBooks(updatedBooks);
    setStatus(`Moving "${draggedBook.title}"...`);

    try {
      const response = await fetch("/api/books", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: draggedBook.title,
          author: draggedBook.author,
          newCategory: targetCategory,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setBooks(previousBooks);
        setStatus(result.error || "Failed to move book.");
        return;
      }

      setStatus(`Moved "${draggedBook.title}" to ${categoryLabels[targetCategory]}.`);
    } catch (error) {
      console.error(error);
      setBooks(previousBooks);
      setStatus("Something went wrong while moving the book.");
    }
  };

  return (
    <main className="min-h-screen bg-[#050814] text-white px-6 py-12">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold">Admin: Manage Books</h1>
          <p className="text-white/60 mt-3">
            Add new books and drag them between categories as they move through production.
          </p>
        </header>

        <section className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 md:p-8 shadow-xl mb-10">
          <h2 className="text-xl font-bold mb-6">Add a Book</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-2">
                Title
              </label>
              <input
                id="title"
                name="title"
                type="text"
                value={form.title}
                onChange={handleChange}
                required
                className="w-full rounded-lg bg-[#050814] border border-[#1A2550] p-3 outline-none focus:border-[#D4AF37]/60"
              />
            </div>

            <div>
              <label htmlFor="subtitle" className="block text-sm font-medium mb-2">
                Subtitle
              </label>
              <input
                id="subtitle"
                name="subtitle"
                type="text"
                value={form.subtitle}
                onChange={handleChange}
                className="w-full rounded-lg bg-[#050814] border border-[#1A2550] p-3 outline-none focus:border-[#D4AF37]/60"
              />
            </div>

            <div>
              <label htmlFor="author" className="block text-sm font-medium mb-2">
                Author
              </label>
              <input
                id="author"
                name="author"
                type="text"
                value={form.author}
                onChange={handleChange}
                required
                className="w-full rounded-lg bg-[#050814] border border-[#1A2550] p-3 outline-none focus:border-[#D4AF37]/60"
              />
            </div>

            <div>
              <label htmlFor="link" className="block text-sm font-medium mb-2">
                Amazon / Audible Link
              </label>
              <input
                id="link"
                name="link"
                type="url"
                value={form.link}
                onChange={handleChange}
                placeholder="https://"
                className="w-full rounded-lg bg-[#050814] border border-[#1A2550] p-3 outline-none focus:border-[#D4AF37]/60"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-2">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                required
                rows={6}
                className="w-full rounded-lg bg-[#050814] border border-[#1A2550] p-3 outline-none focus:border-[#D4AF37]/60"
              />
            </div>

            <div>
              <label htmlFor="tags" className="block text-sm font-medium mb-2">
                Tags
              </label>
              <input
                id="tags"
                name="tags"
                type="text"
                value={form.tags}
                onChange={handleChange}
                placeholder="Dark Romance, Mystery, Duet"
                className="w-full rounded-lg bg-[#050814] border border-[#1A2550] p-3 outline-none focus:border-[#D4AF37]/60"
              />
              <p className="text-xs text-white/45 mt-2">
                Separate tags with commas.
              </p>
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium mb-2">
                Starting Category
              </label>
              <select
                id="category"
                name="category"
                value={form.category}
                onChange={handleChange}
                className="w-full rounded-lg bg-[#050814] border border-[#1A2550] p-3 outline-none focus:border-[#D4AF37]/60"
              >
                <option value="completed">Completed Audiobook Projects</option>
                <option value="in-progress">Currently Narrating</option>
                <option value="coming-soon">Coming Soon to Audible</option>
              </select>
            </div>

            <div>
              <label htmlFor="cover-upload" className="block text-sm font-medium mb-2">
                Book Cover
              </label>
              <input
                id="cover-upload"
                type="file"
                accept="image/*"
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                required
                className="w-full rounded-lg bg-[#050814] border border-[#1A2550] p-3 outline-none focus:border-[#D4AF37]/60"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-full bg-[#D4AF37] text-black px-6 py-3 font-bold hover:scale-105 transition-all disabled:opacity-60 disabled:hover:scale-100"
              >
                {isSubmitting ? "Submitting..." : "Add Book"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <div className="mb-5">
            <h2 className="text-xl font-bold">Move Books Between Categories</h2>
            <p className="text-white/55 text-sm mt-2">
              Drag a book card from one column to another to update its status.
            </p>
          </div>

          {isLoadingBooks ? (
            <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-8 text-white/60">
              Loading books...
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <CategoryColumn
                category="coming-soon"
                books={comingSoonBooks}
                onDropBook={handleDropBook}
                draggedBook={draggedBook}
                setDraggedBook={setDraggedBook}
              />
              <CategoryColumn
                category="in-progress"
                books={inProgressBooks}
                onDropBook={handleDropBook}
                draggedBook={draggedBook}
                setDraggedBook={setDraggedBook}
              />
              <CategoryColumn
                category="completed"
                books={completedBooks}
                onDropBook={handleDropBook}
                draggedBook={draggedBook}
                setDraggedBook={setDraggedBook}
              />
            </div>
          )}
        </section>

        {status && (
          <div className="mt-8 rounded-xl border border-[#1A2550] bg-[#0B1224] px-4 py-3 text-sm text-white/75">
            {status}
          </div>
        )}
      </div>
    </main>
  );
}