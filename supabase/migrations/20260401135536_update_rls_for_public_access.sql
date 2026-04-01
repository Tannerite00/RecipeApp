/*
  # Update RLS policies for public access
  
  1. Changes
    - Drop existing authentication-based policies
    - Add public access policies for meal plans and meal plan items
    - Allow anyone to create and manage meal plans without authentication
    
  2. Security
    - This is a temporary setup for basic functionality
    - In production, proper authentication should be implemented
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Meal plans are readable by their owner" ON meal_plans;
DROP POLICY IF EXISTS "Meal plans are insertable by authenticated users" ON meal_plans;
DROP POLICY IF EXISTS "Meal plan items are readable by meal plan owner" ON meal_plan_items;
DROP POLICY IF EXISTS "Meal plan items are insertable by meal plan owner" ON meal_plan_items;
DROP POLICY IF EXISTS "Meal plan items are deletable by meal plan owner" ON meal_plan_items;

-- Create public access policies for meal plans
CREATE POLICY "Meal plans are publicly readable"
  ON meal_plans FOR SELECT
  USING (true);

CREATE POLICY "Meal plans are publicly insertable"
  ON meal_plans FOR INSERT
  WITH CHECK (true);

-- Create public access policies for meal plan items
CREATE POLICY "Meal plan items are publicly readable"
  ON meal_plan_items FOR SELECT
  USING (true);

CREATE POLICY "Meal plan items are publicly insertable"
  ON meal_plan_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Meal plan items are publicly deletable"
  ON meal_plan_items FOR DELETE
  USING (true);

CREATE POLICY "Meal plan items are publicly updatable"
  ON meal_plan_items FOR UPDATE
  USING (true);

ALTER TABLE meal_plans 
ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE meal_plans DROP COLUMN user_id;