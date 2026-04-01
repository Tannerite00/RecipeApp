/*
  # Create recipe management tables

  1. New Tables
    - `recipes`
      - `id` (uuid, primary key)
      - `title` (text)
      - `type` (text, recipe category)
      - `cook_time` (text, ISO 8601 duration format)
      - `prep_time` (text, ISO 8601 duration format)
      - `servings` (text)
      - `ingredients` (text[], array of ingredient strings)
      - `instructions` (text[], array of instruction strings)
      - `rating` (integer)
      - `url` (text)
      - `created_at` (timestamp)
    - `meal_plans`
      - `id` (uuid, primary key)
      - `user_id` (uuid)
      - `week_start_date` (date)
      - `created_at` (timestamp)
    - `meal_plan_items`
      - `id` (uuid, primary key)
      - `meal_plan_id` (uuid, foreign key)
      - `recipe_id` (uuid, foreign key)
      - `day_of_week` (integer, 0-6 for Mon-Sun)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for public recipe access
    - Add policies for user-specific meal plans
*/

CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text,
  cook_time text,
  prep_time text,
  servings text,
  ingredients text[] DEFAULT '{}',
  instructions text[] DEFAULT '{}',
  rating integer,
  url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  week_start_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meal_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id uuid NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipes are publicly readable"
  ON recipes FOR SELECT
  USING (true);

CREATE POLICY "Meal plans are readable by their owner"
  ON meal_plans FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Meal plans are insertable by authenticated users"
  ON meal_plans FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Meal plan items are readable by meal plan owner"
  ON meal_plan_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meal_plans
      WHERE meal_plans.id = meal_plan_items.meal_plan_id
      AND meal_plans.user_id = auth.uid()
    )
  );

CREATE POLICY "Meal plan items are insertable by meal plan owner"
  ON meal_plan_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meal_plans
      WHERE meal_plans.id = meal_plan_items.meal_plan_id
      AND meal_plans.user_id = auth.uid()
    )
  );

CREATE POLICY "Meal plan items are deletable by meal plan owner"
  ON meal_plan_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meal_plans
      WHERE meal_plans.id = meal_plan_items.meal_plan_id
      AND meal_plans.user_id = auth.uid()
    )
  );
