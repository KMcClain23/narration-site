// Shared sanitizer for turning a person's display name into a URL/storage-key
// safe token — used for R2 object keys (authors/<uuid>-<sanitized-name>.jpg)
// and for generating on-the-fly contact-page slugs from the same convention.
export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
