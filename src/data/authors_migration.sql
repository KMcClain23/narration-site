-- Safe to re-run: uses IF NOT EXISTS and DROP/CREATE for policies.

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

ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.authors;
CREATE POLICY "Public read access" ON public.authors
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.authors;
CREATE POLICY "Service role full access" ON public.authors
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
