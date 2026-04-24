-- Run this in Supabase SQL editor AFTER the migration to seed author data.
-- Safe to re-run: uses ON CONFLICT to update existing rows.

INSERT INTO public.authors (name, bio, website, amazon, instagram, tiktok, facebook, goodreads)
VALUES
  ('Alexander Kamenetsky', 'Author of sci-fi psychological thriller fiction. His debut novel The Final Guardian explores AI, control, and the modern soul.', '', 'https://www.amazon.com/stores/author/B0G1CNQM8H', '', '', '', ''),
  ('Bethanie Loren', 'A mood-writer based in Texas with a wide range of romance titles including LGBTQ+ fiction, contemporary romance, and the Sultry Secrets series.', '', 'https://www.amazon.com/stores/author/B0D2SJTTZX', '', '', '', 'https://www.goodreads.com/author/show/47863562.Bethanie_Loren'),
  ('E.A. Harper', 'Author of sinfully addictive dark romance with spice, angst, and emotional damage. Find her books and merch at her official site.', 'https://www.eaharperauthor.com', '', 'https://www.instagram.com/author_eaharper/', 'https://www.tiktok.com/@author_eaharper', 'https://www.facebook.com/author.e.a.harper/', ''),
  ('K.E. Noel', '', '', 'https://www.amazon.com/K-E-Noel/e/B0G1J951DS/', 'https://www.instagram.com/k.e_noel_author/', 'https://www.tiktok.com/@k.e.noel.author', '', 'https://www.goodreads.com/author/show/58454523.K_E_Noel'),
  ('L.L. McAlister', '', '', 'https://www.amazon.com/L-L-McAlister/e/B0DSLGKPSX/', 'https://www.instagram.com/llmcalisterauthor/', 'https://www.tiktok.com/@l.l.mcalisterauthor', '', ''),
  ('Laetitia Clark', 'Debut author of holiday romance and romantasy. Her spicy Christmas novella Santa Promised has been praised for its cozy setting and warmth.', '', '', 'https://www.instagram.com/laetitia.clark.writes/', '', '', ''),
  ('Lillian Minx Monroe', 'Author of dark romance and erotic thriller. Her Circle series features secret societies, ritual obsession, and psychological tension.', '', 'https://www.amazon.com/stores/author/B0FBWTDVV9', '', 'https://www.tiktok.com/@theminxmonroe', '', 'https://www.goodreads.com/author/show/56941363.Lillian_Minx_Monroe'),
  ('Madeline Fay', 'Dark romance author based in rural Michigan. Creator of the Dolls & Douchebags series, known for bully romance and multi-love interests.', 'https://www.madelinefayauthor.com', '', 'https://www.instagram.com/madelinefay_author/', '', 'https://www.facebook.com/MadelineFayReaders', 'https://www.goodreads.com/author/show/18860882.Madeline_Fay'),
  ('Noelle Rahn-Johnson', 'Contemporary romance author from Northern Minnesota with eleven books and growing. Writing career started in 2014 spanning MM, MF, and paranormal romance.', '', '', '', '', 'https://www.facebook.com/AuthorNoelleRahnJohnson', 'https://www.goodreads.com/author/show/14153352.Noelle_Rahn_Johnson'),
  ('River Fox', '', 'https://riverfox.co.uk/', 'https://www.amazon.com/River-Fox/e/B0FRY7V7RY/', '', 'https://www.tiktok.com/@riverruin_riverfox', '', ''),
  ('Shelby Gardner', 'Author of fantasy romance. Her debut Heir of the Emberscale is a dark, character-driven enemies-to-lovers trilogy starter featuring dragon lore and fated mates.', '', '', '', 'https://www.tiktok.com/@shelbygardnerauthor', 'https://www.facebook.com/61580224450935', 'https://www.goodreads.com/author/show/61100661.Shelby_Gardner')
ON CONFLICT (name) DO UPDATE SET
  bio       = EXCLUDED.bio,
  website   = EXCLUDED.website,
  amazon    = EXCLUDED.amazon,
  instagram = EXCLUDED.instagram,
  tiktok    = EXCLUDED.tiktok,
  facebook  = EXCLUDED.facebook,
  goodreads = EXCLUDED.goodreads;
