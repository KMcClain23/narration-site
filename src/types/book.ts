export type BookCategory = "completed" | "in-progress" | "coming-soon";

export type Book = {
  id: string;
  title: string;
  subtitle?: string;
  author: string;
  link: string;
  cover_url: string;
  tags: string[];
  description?: string;
  category: BookCategory;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};