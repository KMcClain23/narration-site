"use client";

import { useEffect, useRef, useState } from "react";

// Lazy MSAL singleton — browser-only
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

async function acquireSilently(): Promise<string | null> {
  try {
    const msal = await getMsal();
    const accounts = msal.getAllAccounts();
    if (accounts.length === 0) return null;
    const r = await msal.acquireTokenSilent({ scopes: SCOPES, account: accounts[0] });
    return r.accessToken;
  } catch {
    return null;
  }
}

async function uploadToOneDrive(token: string, file: File, bookTitle: string): Promise<string> {
  const safeName = bookTitle.replace(/[^a-zA-Z0-9 ]/g, "").trim() || "Script";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
  const drivePath = `Production Scripts/${safeName}.${ext}`;
  const encodedPath = encodeURIComponent(drivePath).replace(/%2F/g, "/");

  let itemId: string;

  if (file.size <= 4 * 1024 * 1024) {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/content`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" },
        body: file,
      }
    );
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    itemId = (await res.json()).id;
  } else {
    const sessionRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/createUploadSession`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
      }
    );
    if (!sessionRes.ok) throw new Error("Could not create upload session");
    const { uploadUrl } = await sessionRes.json();

    const CHUNK = 3 * 1024 * 1024;
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

  const shareRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "view", scope: "anonymous" }),
    }
  );
  if (!shareRes.ok) throw new Error("Could not create share link");
  return (await shareRes.json()).link.webUrl as string;
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
  // null = unknown, "" = unauthenticated, non-empty = valid token
  const [token, setToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // On mount: attempt silent token acquisition so the upload button is ready immediately
  useEffect(() => {
    acquireSilently().then(tok => setToken(tok ?? ""));
  }, []);

  // Step 1 — dedicated Connect button (pure click, popup allowed here)
  const connect = async () => {
    setError("");
    setConnecting(true);
    try {
      const msal = await getMsal();
      const result = await msal.loginPopup({ scopes: SCOPES });
      setToken(result.accessToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setConnecting(false);
    }
  };

  // Step 2 — upload button click is fully synchronous: just opens the file picker
  // Token is already in state from connect() or the silent check on mount
  const openFilePicker = () => {
    setError("");
    inputRef.current?.click();
  };

  // Called by file input onChange — token already in state, no popup needed
  const handleFile = async (file: File) => {
    let tok = token;
    // If token looks stale, try a silent refresh (no popup)
    if (!tok) {
      tok = await acquireSilently();
      if (tok) setToken(tok);
    }
    if (!tok) {
      setError("Not connected to OneDrive. Click Connect first.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const url = await uploadToOneDrive(tok, file, bookTitle);
      onUpload(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const isAuthenticated = Boolean(token);
  const isReady = token !== null; // false while useEffect hasn't resolved yet

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
        {/* Step 1: Connect (shown when not signed in) */}
        {isReady && !isAuthenticated && (
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full border border-[#D4AF37]/30 text-[#D4AF37]/70 hover:text-[#D4AF37] hover:border-[#D4AF37]/60 transition-colors disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
            </svg>
            {connecting ? "Connecting…" : "Connect OneDrive"}
          </button>
        )}

        {/* Step 2: Upload (shown when signed in) */}
        {isAuthenticated && (
          <button
            type="button"
            onClick={openFilePicker}
            disabled={uploading}
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            {uploading ? "Uploading…" : currentUrl ? "Replace Script" : "Upload Script"}
          </button>
        )}

        {/* Current script link */}
        {currentUrl && !uploading && (
          <a href={currentUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            View current
          </a>
        )}

        {/* Reconnect link (shown when authenticated, in case token is stale) */}
        {isAuthenticated && (
          <button type="button" onClick={connect}
            className="text-[10px] text-white/20 hover:text-white/40 transition-colors">
            Reconnect
          </button>
        )}
      </div>

      {error && <p className="text-red-400 text-[11px] mt-1.5">{error}</p>}
      <p className="text-[10px] text-white/20 mt-1">
        {isAuthenticated ? "Connected · PDF or Word · Saved to OneDrive › Production Scripts" : "PDF or Word · Saved to OneDrive › Production Scripts"}
      </p>
    </div>
  );
}
