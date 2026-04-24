-- Run this in your Supabase SQL editor to create the authors table.
-- After running, seed it by pasting the INSERT statements below,
-- or add authors manually via the admin page.

CREATE TABLE IF NOT EXISTS public.authors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  bio         text NOT NULL DEFAULT '',
  website     text NOT NULL DEFAULT '',
  amazon      text NOT NULL DEFAULT '',
  instagram   text NOT NULL DEFAULT '',
  tiktok      text NOT NULL DEFAULT '',
  facebook    text NOT NULL DEFAULT '',
  goodreads   text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Optional: enable Row Level Security (recommended)
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;

-- Allow public read access (same as your books table)
CREATE POLICY "Public read access" ON public.authors
  FOR SELECT USING (true);

-- Allow service role full access (used by supabaseAdmin)
CREATE POLICY "Service role full access" ON public.authors
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Seed: paste your authors from authors.json
-- (You can also just add them via the admin page)
INSERT INTO public.authors (name) VALUES
  ('Alexander Kamenetsky'),
  ('Bethanie Loren'),
  ('E.A. Harper'),
  ('K.E. Noel'),
  ('L.L. McAlister'),
  ('Laetitia Clark'),
  ('Lillian Minx Monroe'),
  ('Madeline Fay'),
  ('Noelle Rahn-Johnson'),
  ('River Fox'),
  ('Shelby Gardner')
ON CONFLICT (name) DO NOTHING;
