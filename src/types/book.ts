export type BookCategory = "completed" | "in-progress" | "coming-soon";

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
};