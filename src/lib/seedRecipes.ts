import { supabase } from './supabase';

export interface RecipeData {
  title: string;
  type: string;
  cook_time: string;
  prep_time: string;
  servings: string;
  ingredients: string[];
  instructions: string[];
  rating?: number | null;
  url?: string;
}

export async function seedRecipes(recipes: RecipeData[]) {
  try {
    const { error } = await supabase
      .from('recipes')
      .insert(recipes);

    if (error) throw error;
    console.log(`Successfully added ${recipes.length} recipes`);
    return true;
  } catch (err) {
    console.error('Error seeding recipes:', err);
    return false;
  }
}

export async function clearRecipes() {
  try {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error clearing recipes:', err);
    return false;
  }
}
