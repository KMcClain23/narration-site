-- Run in Supabase SQL editor.
-- Step 1: OBSOLETE, and left here only as a record of what this script did.
-- public.books was dropped on 2026-08-29 — it was write-only, nothing ever
-- selected from it, and board_cards carries co_narrator now. Re-running this
-- line would error on a table that no longer exists.
-- ALTER TABLE public.books ADD COLUMN IF NOT EXISTS co_narrator text NOT NULL DEFAULT '';

-- Step 2: Create co_narrators table (mirrors authors table structure)
CREATE TABLE IF NOT EXISTS public.co_narrators (
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

ALTER TABLE public.co_narrators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.co_narrators;
CREATE POLICY "Public read access" ON public.co_narrators
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.co_narrators;
CREATE POLICY "Service role full access" ON public.co_narrators
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
