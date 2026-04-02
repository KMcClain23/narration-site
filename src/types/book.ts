export type BookCategory = "completed" | "in-progress" | "coming-soon";

export type Book = {
  title: string;
  subtitle?: string;
  author: string;
  link: string;
  cover: string;
  note?: boolean;
  tags: string[];
  description?: string;
  category: BookCategory;
};