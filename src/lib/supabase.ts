import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Recipe {
  id: string;
  title: string;
  type: string;
  cook_time: string;
  prep_time: string;
  servings: string;
  ingredients: string[];
  instructions: string[];
  rating: number | null;
  url: string;
  created_at: string;
}

export interface MealPlan {
  id: string;
  user_id: string;
  week_start_date: string;
  created_at: string;
}

export interface MealPlanItem {
  id: string;
  meal_plan_id: string;
  recipe_id: string;
  day_of_week: number;
  created_at: string;
}
