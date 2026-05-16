"use client";

import { useRef, useState } from "react";

// Lazy MSAL singleton — browser-only, initialized once on first upload
let msalPromise: Promise<import("@azure/msal-browser").PublicClientApplication> | null = null;

const SCOPES = ["Files.ReadWrite", "User.Read"];

async function getMsal() {
  if (!msalPromise) {
    const { PublicClientApplication } = await import("@azure/msal-browser");
    const instance = new PublicClientApplication({
      auth: {
        clientId: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_TENANT_ID ?? "common"}`,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await instance.initialize();
    msalPromise = Promise.resolve(instance);
  }
  return msalPromise;
}

async function getToken(): Promise<string> {
  const msal = await getMsal();
  const accounts = msal.getAllAccounts();
  if (accounts.length > 0) {
    try {
      const r = await msal.acquireTokenSilent({ scopes: SCOPES, account: accounts[0] });
      return r.accessToken;
    } catch {
      // Token expired or unavailable — fall through to popup
    }
  }
  const r = await msal.loginPopup({ scopes: SCOPES });
  return r.accessToken;
}

async function uploadToOneDrive(token: string, file: File, bookTitle: string): Promise<string> {
  const safeName = bookTitle.replace(/[^a-zA-Z0-9 ]/g, "").trim() || "Script";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
  const drivePath = `Production Scripts/${safeName}.${ext}`;

  let itemId: string;

  if (file.size <= 4 * 1024 * 1024) {
    // Simple upload for files ≤ 4 MB
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(drivePath).replace(/%2F/g, "/")}:/content`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      }
    );
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    const item = await res.json();
    itemId = item.id;
  } else {
    // Resumable session upload for larger files
    const sessionRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(drivePath).replace(/%2F/g, "/")}:/createUploadSession`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
      }
    );
    if (!sessionRes.ok) throw new Error("Could not create upload session");
    const { uploadUrl } = await sessionRes.json();

    const CHUNK = 3 * 1024 * 1024; // 3 MB chunks
    let start = 0;
    let finalItem: Record<string, unknown> = {};
    while (start < file.size) {
      const end = Math.min(start + CHUNK, file.size);
      const resp = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
          "Content-Length": String(end - start),
        },
        body: file.slice(start, end),
      });
      if (!resp.ok && resp.status !== 202) throw new Error(`Chunk upload failed (${resp.status})`);
      if (resp.status === 200 || resp.status === 201) finalItem = await resp.json();
      start = end;
    }
    itemId = finalItem.id as string;
  }

  // Create an anonymous "view" share link
  const shareRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "view", scope: "anonymous" }),
    }
  );
  if (!shareRes.ok) throw new Error("Could not create share link");
  const shareData = await shareRes.json();
  return shareData.link.webUrl as string;
}

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
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setError("");
    setUploading(true);
    setProgress("Signing in to OneDrive…");
    try {
      const token = await getToken();
      setProgress("Uploading…");
      const url = await uploadToOneDrive(token, file, bookTitle);
      onUpload(url);
      setProgress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setProgress("");
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
          {/* Document icon */}
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          {uploading ? progress : currentUrl ? "Replace Script" : "Upload Script"}
        </button>

        {currentUrl && !uploading && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors"
          >
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
