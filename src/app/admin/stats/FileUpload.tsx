"use client";

import { useState } from "react";

export default function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("Dark Romance"); // Default based on your niche
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (!file || !title) {
      setStatus({ type: 'error', msg: "Title and File are required." });
      return;
    }

    setUploading(true);

    try {
      // 1. Upload the audio to R2
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Upload failed");

      const audioUrl = data.url;

      // 2. SAVE TO CMS (Database)
      // We will create this API route next
      const dbRes = await fetch("/api/works", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          genre,
          audioUrl,
          key: data.key
        }),
      });

      if (!dbRes.ok) throw new Error("File uploaded to R2, but failed to save to database.");

      setStatus({ type: 'success', msg: `Successfully added "${title}" to your portfolio!` });
      
      // Reset form
      setFile(null);
      setTitle("");
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Title Input */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-white/50">Project Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Mindf*ck Series Demo"
            className="w-full bg-[#050814] border border-[#1A2550] rounded-lg px-4 py-2 text-white focus:border-[#D4AF37] outline-none transition"
          />
        </div>

        {/* Genre Select */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-white/50">Genre</label>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="w-full bg-[#050814] border border-[#1A2550] rounded-lg px-4 py-2 text-white focus:border-[#D4AF37] outline-none transition"
          >
            <option value="Dark Romance">Dark Romance</option>
            <option value="Contemporary">Contemporary</option>
            <option value="Thriller">Thriller</option>
            <option value="Fantasy">Fantasy</option>
          </select>
        </div>
      </div>

      {/* File Input */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-white/50">Audio File (MP3/WAV)</label>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-white/80 file:mr-4 file:rounded-md file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
        />
      </div>

      <button
        type="submit"
        disabled={uploading}
        className="w-full rounded-md bg-[#D4AF37] py-3 text-sm font-bold text-[#050814] hover:bg-[#E0C15A] disabled:opacity-50 transition"
      >
        {uploading ? "Processing Content..." : "Add to Portfolio"}
      </button>

      {status && (
        <p className={`text-sm font-medium ${status.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          {status.msg}
        </p>
      )}
    </form>
  );
}