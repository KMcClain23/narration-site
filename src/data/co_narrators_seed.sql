-- Run in Supabase SQL editor AFTER co_narrators_migration.sql.
-- Add your co-narrators here. Fill in links via the admin panel.

INSERT INTO public.co_narrators (name, bio, website, amazon, instagram, tiktok, facebook, goodreads)
VALUES
  ('Ann Dahela', '', '', '', '', '', '', '')
ON CONFLICT (name) DO UPDATE SET
  bio=EXCLUDED.bio, website=EXCLUDED.website, amazon=EXCLUDED.amazon,
  instagram=EXCLUDED.instagram, tiktok=EXCLUDED.tiktok,
  facebook=EXCLUDED.facebook, goodreads=EXCLUDED.goodreads;
