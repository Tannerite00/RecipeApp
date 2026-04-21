-- Seed data for local Supabase development.
-- Runs automatically after migrations when you run `supabase start` or `supabase db reset`.

-- Rating column reset + user-driven ratings table.
-- This lives in seed.sql (rather than a migration) because the hosted project
-- already has it applied; keeping it here makes `supabase start` produce a
-- schema that matches the hosted DB for offline development.

UPDATE recipes SET rating = 0;

CREATE TABLE IF NOT EXISTS recipe_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_ratings_recipe_id ON recipe_ratings(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ratings_user_id ON recipe_ratings(user_id);

ALTER TABLE recipe_ratings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recipe_ratings' AND policyname='Recipe ratings readable by anon') THEN
    CREATE POLICY "Recipe ratings readable by anon" ON recipe_ratings FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recipe_ratings' AND policyname='Recipe ratings readable by authenticated') THEN
    CREATE POLICY "Recipe ratings readable by authenticated" ON recipe_ratings FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recipe_ratings' AND policyname='Users insert own recipe rating') THEN
    CREATE POLICY "Users insert own recipe rating" ON recipe_ratings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recipe_ratings' AND policyname='Users update own recipe rating') THEN
    CREATE POLICY "Users update own recipe rating" ON recipe_ratings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recipe_ratings' AND policyname='Users delete own recipe rating') THEN
    CREATE POLICY "Users delete own recipe rating" ON recipe_ratings FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;
