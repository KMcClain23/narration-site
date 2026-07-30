// Shared upload/duration helpers for the demos admin UI. Mirrors the logic
// in src/app/admin/demos/DemosAdminClient.tsx (the old page, left untouched)
// so both surfaces behave identically — duplicated rather than imported from
// there to avoid coupling the old page's fate to the new one's.

export const GENRES = [
  "Romance", "Dark Romance", "Romantasy", "Thriller",
  "Fantasy", "Contemporary", "Drama", "Multi-Character", "Other",
];
export const KNOWN_GENRES = GENRES.filter(g => g !== "Other");

// A genre value that isn't one of the presets is treated as a saved custom
// genre — the select shows "Other" and the free-text field shows the value.
export function splitGenre(g: string | null): { select: string; custom: string } {
  if (!g) return { select: "", custom: "" };
  return KNOWN_GENRES.includes(g) ? { select: g, custom: "" } : { select: "Other", custom: g };
}

export function fmtDuration(s: number | null): string | null {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function detectDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.onloadedmetadata = () => { resolve(audio.duration); URL.revokeObjectURL(url); };
    audio.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
    audio.src = url;
  });
}

export async function uploadToR2(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ key: string; publicUrl: string }> {
  const res = await fetch("/api/demos/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: "audio/mpeg" }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  const { uploadUrl, key, publicUrl } = await res.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", "audio/mpeg");
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed — network error or SSL issue with R2 endpoint."));
    xhr.onabort = () => reject(new Error("Upload aborted."));
    xhr.send(file);
  });

  return { key, publicUrl };
}
