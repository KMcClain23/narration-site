import Image from "next/image";

// First letter of the first name + first letter of the last name — a single
// name just uses its own first two letters. Always uppercase, max 2 chars.
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PersonAvatar({
  name,
  photoUrl,
  size = 40,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  if (photoUrl) {
    return (
      <div
        className="relative shrink-0 rounded-full overflow-hidden border border-white/15"
        style={{ width: size, height: size }}
      >
        <Image src={photoUrl} alt={name} fill className="object-cover" sizes={`${size}px`} />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={name}
      className="flex items-center justify-center shrink-0 rounded-full border border-white/10 bg-indigo-900/40 text-indigo-200/70 font-semibold select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {getInitials(name)}
    </div>
  );
}
