import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

const SESSION_KEY = 'offline-session';

export function saveSession(session: any) {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

export async function getSafeSession() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session ?? null;
  } catch {
    return null;
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    saveSession(session);
  }
});

export function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

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

export interface RecipeRating {
  id: string;
  user_id: string;
  recipe_id: string;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface RatingStats {
  average: number;
  count: number;
}

export interface RecipeComment {
  id: string;
  user_id: string;
  recipe_id: string;
  user_email: string;
  content: string;
  created_at: string;
}

export function usernameFromEmail(email: string | null | undefined): string {
  if (!email) return 'User';
  const prefix = email.split('@')[0];
  return prefix || 'User';
}