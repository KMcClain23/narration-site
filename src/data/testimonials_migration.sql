-- Run in Supabase SQL editor to create the testimonials table.

CREATE TABLE IF NOT EXISTS public.testimonials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_name text NOT NULL,
  reviewer_role text NOT NULL CHECK (reviewer_role IN ('author', 'narrator')),
  book_title    text NOT NULL DEFAULT '',
  quote         text NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

-- Public can only read approved testimonials
DROP POLICY IF EXISTS "Public read approved" ON public.testimonials;
CREATE POLICY "Public read approved" ON public.testimonials
  FOR SELECT USING (status = 'approved');

-- Public can insert (submit a review)
DROP POLICY IF EXISTS "Public insert" ON public.testimonials;
CREATE POLICY "Public insert" ON public.testimonials
  FOR INSERT WITH CHECK (true);

-- Service role has full access (admin operations)
DROP POLICY IF EXISTS "Service role full access" ON public.testimonials;
CREATE POLICY "Service role full access" ON public.testimonials
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
