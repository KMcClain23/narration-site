"use client";

import { useState } from "react";
import type { BookCategory } from "@/types/book";

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

export default function AdminPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong while adding the book.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#050814] text-white px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold">Admin: Add a Book</h1>
          <p className="text-white/60 mt-3">
            Add a cover, title, author, description, tags, and category without editing code.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 md:p-8 shadow-xl"
        >
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
              Category
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

          {status && (
            <p className="text-sm text-white/70 pt-2">{status}</p>
          )}
        </form>
      </div>
    </main>
  );
}