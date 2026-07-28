export type BookCategory = "completed" | "in-progress" | "coming-soon";

export type NarrationFormat = "solo" | "dual" | "duet" | "multicast";

export type ArchivedReason = "recasted" | "canceled" | "other";

export type Book = {
  id: string;
  title: string;
  subtitle?: string;
  author: string;
  link: string;
  ar_link?: string;
  spotify_link?: string;
  co_narrator?: string[]; // array of co-narrator names
  cover_url: string;
  tags: string[];
  description?: string;
  category: BookCategory;
  sort_order?: number;
  slug?: string;
  released_at?: string | null;
  created_at?: string;
  updated_at?: string;
  is_confidential?: boolean;
  narration_format?: NarrationFormat | null;
  archived_at?: string | null;
  archived_reason?: ArchivedReason | null;
  archived_notes?: string | null;
};