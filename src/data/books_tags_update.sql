-- Run in Supabase SQL editor to update book tags.

BEGIN;
  UPDATE books SET tags = ARRAY['Sci-Fi Thriller', 'AI & Dystopia', 'Psych Horror', 'Near Future'] WHERE title = 'The Final Guardian';
  UPDATE books SET tags = ARRAY['Holiday Romance', 'Age Gap', 'Single Mom', 'Spicy'] WHERE title = 'Santa Promised';
  UPDATE books SET tags = ARRAY['Dark Romance', 'Secret Society', 'Ritual & Obsession', 'Psychological'] WHERE title = 'The Circle';
  UPDATE books SET tags = ARRAY['Romantasy', 'Dragon Lore', 'Enemies to Lovers', 'Fated Mates'] WHERE title = 'Heir of the Emberscale';
  UPDATE books SET tags = ARRAY['LGBTQ+', 'Friends to Lovers', 'Spicy', 'Contemporary'] WHERE title = 'Sultry Secrets: Tease';
  UPDATE books SET tags = ARRAY['Contemporary Romance', 'Emotional Depth', 'Steamy', 'Second Chance'] WHERE title = 'No One to Hold Me';
  UPDATE books SET tags = ARRAY['Dark Romance', 'Reverse Harem', 'Bully Romance', 'Enemies to Lovers'] WHERE title = 'Merciless Punks';
  UPDATE books SET tags = ARRAY['Contemporary', 'Best Friend''s Sister', 'Second Chance', 'Playboy Hero'] WHERE title = 'Unmasked Hearts';
  UPDATE books SET tags = ARRAY['MC Romance', 'Wolf Shifter', 'Why Choose', 'Fated Mates'] WHERE title = 'Blood on the Asphalt';
  UPDATE books SET tags = ARRAY['Dark Romance', 'He Falls First', 'Tragic & Emotional', 'Obsessive Love'] WHERE title = 'Beating For You';
  UPDATE books SET tags = ARRAY['Primal Play', 'Touch & Die', 'Protective Billionaire', 'Mutual Obsession'] WHERE title = 'Whiskey & Lies';
COMMIT;
