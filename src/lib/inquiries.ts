// Shared between the /inquiries admin UI and its API routes — the single
// source of truth for the Redis keys/connection and inquiry shape, since both
// read/write the same two lists.

import { Redis } from "@upstash/redis";

export const INQUIRY_KEY = "dmn_inquiries";
export const ARCHIVE_KEY = "dmn_inquiries_archived";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? "",
  token: process.env.KV_REST_API_TOKEN ?? "",
});

// Real live shape (confirmed against production Redis) — note there is no
// `role` field despite older code referencing one; the live contact form
// (src/app/actions/sendEmail.ts) has sent `genre`/`word_count` for a while
// and `role` was never actually populated by it.
export type Inquiry = {
  id: string;
  name: string;
  email: string;
  message: string;
  genre?: string;
  word_count?: string;
  createdAt: string;
  status: string;
  archivedAt?: string;
};

export function parseInquiryList(raw: unknown[]): Inquiry[] {
  return raw.map(i => (typeof i === "string" ? JSON.parse(i) : i)) as Inquiry[];
}

export async function getActiveInquiries(): Promise<Inquiry[]> {
  const raw = await redis.lrange(INQUIRY_KEY, 0, -1);
  return parseInquiryList(raw);
}

export async function getArchivedInquiries(): Promise<Inquiry[]> {
  const raw = await redis.lrange(ARCHIVE_KEY, 0, -1);
  return parseInquiryList(raw);
}

// Archive age is measured from archivedAt. Rows archived before that field
// existed fall back to the original inquiry date (createdAt) so bulk-delete
// age filtering still works for them instead of treating them as brand new.
export function archiveAgeReference(inquiry: Inquiry): string {
  return inquiry.archivedAt ?? inquiry.createdAt;
}

export function isOlderThanDays(inquiry: Inquiry, days: number): boolean {
  const ref = archiveAgeReference(inquiry);
  if (!ref) return false;
  const refTime = new Date(ref).getTime();
  if (isNaN(refTime)) return false;
  return Date.now() - refTime > days * 24 * 60 * 60 * 1000;
}
