"use client";

import { useRef, useState } from "react";

export default function ScriptUploader({
  bookTitle,
  currentUrl,
  onUpload,
}: {
  bookTitle: string;
  currentUrl?: string;
  onUpload: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setError("");

    if (file.size > 4 * 1024 * 1024) {
      setError("File must be under 4 MB. Compress or export a smaller PDF first.");
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("bookTitle", bookTitle);
      const res = await fetch("/api/onedrive/upload", { method: "POST", body });
      const text = await res.text();
      let data: { error?: string; url?: string } = {};
      try { data = JSON.parse(text); } catch {
        throw new Error(res.ok ? "Unexpected server response" : `Upload failed (${res.status}): ${text.slice(0, 120)}`);
      }
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      onUpload(data.url!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-1.5">
        Script (OneDrive)
      </span>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          {uploading ? "Uploading…" : currentUrl ? "Replace Script" : "Upload Script"}
        </button>

        {currentUrl && !uploading && (
          <a href={currentUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            View current
          </a>
        )}
      </div>

      {error && <p className="text-red-400 text-[11px] mt-1.5">{error}</p>}
      <p className="text-[10px] text-white/20 mt-1">PDF or Word · Saved to OneDrive › Production Scripts</p>
    </div>
  );
}
