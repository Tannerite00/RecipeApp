import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Plus } from 'lucide-react';
import { supabase, type MealPlan, type Recipe } from '../lib/supabase';
import {
  ensureMealPlanWeeks,
  cutoffWeekStart,
  currentWeekStart,
  plannableWeekStarts
} from '../lib/mealPlanWeeks';
import { cacheGet, cacheSet, enqueueMealPlanOp } from '../lib/offlineCache';
import { flushMealPlanQueue } from '../lib/mealPlanSync';

interface MealPlanItemEntry {
  itemId: string;
  recipe: Recipe;
}

interface MealPlanWithItems extends MealPlan {
  items: {
    day_of_week: number;
    entries: MealPlanItemEntry[];
  }[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isOnlineSafe() {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

function emptyWeekItems() {
  return Array(7).fill(null).map((_, day) => ({
    day_of_week: day,
    entries: [] as MealPlanItemEntry[],
  }));
}

function formatWeekStart(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

function loadMealPlansFromCache(): MealPlanWithItems[] | null {
  return cacheGet<MealPlanWithItems[]>('meal-plans');
}

function saveMealPlansToCache(plans: MealPlanWithItems[]): void {
  cacheSet('meal-plans', plans);
}

function loadRecipesFromCache(): Pick<Recipe, 'id' | 'title'>[] | null {
  return cacheGet<Pick<Recipe, 'id' | 'title'>[]>('meal-plan-recipes');
}

function saveRecipesToCache(recipes: Pick<Recipe, 'id' | 'title'>[]): void {
  cacheSet('meal-plan-recipes', recipes);
}

function ensureCachedPlansHaveCurrentWeeks(cached: MealPlanWithItems[]): MealPlanWithItems[] {
  const cutoff = cutoffWeekStart();
  const target = plannableWeekStarts();

  const plans = cached.filter(p => p.week_start_date >= cutoff);
  const have = new Set(plans.map(p => p.week_start_date));

  for (const w of target) {
    if (!have.has(w)) {
      plans.push({
        id: `offline-${w}`,
        user_id: '',
        week_start_date: w,
        created_at: new Date().toISOString(),
        items: emptyWeekItems(),
      });
    }
  }

  plans.sort((a, b) => a.week_start_date.localeCompare(b.week_start_date));

  const seen = new Set<string>();
  return plans.filter(p => {
    if (seen.has(p.week_start_date)) return false;
    seen.add(p.week_start_date);
    return true;
  });
}

function mergePlans(local: MealPlanWithItems[], remote: MealPlanWithItems[]) {
  const map = new Map<string, MealPlanWithItems>();

  for (const p of local) map.set(p.week_start_date, p);
  for (const p of remote) map.set(p.week_start_date, p);

  return Array.from(map.values()).sort((a, b) =>
    a.week_start_date.localeCompare(b.week_start_date)
  );
}

export function MealPlanPage() {
  const navigate = useNavigate();

  const [mealPlans, setMealPlans] = useState<MealPlanWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Pick<Recipe, 'id' | 'title'>[]>([]);
  const [openDropdownDay, setOpenDropdownDay] = useState<number | null>(null);

  // ----------------------------
  // SUPABASE FETCH (BACKGROUND ONLY)
  // ----------------------------
  async function fetchRecipes() {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title')
        .order('title');

      if (error) throw error;

      const fresh = data || [];
      setRecipes(fresh);
      saveRecipesToCache(fresh);
    } catch {
      const cached = loadRecipesFromCache();
      if (cached) setRecipes(cached);
    }
  }

  async function fetchMealPlans() {
    try {
      if (!isOnlineSafe()) return;

      const { data: plans, error } = await supabase
        .from('meal_plans')
        .select('*')
        .order('week_start_date', { ascending: true });

      if (error) throw error;

      const cutoff = cutoffWeekStart();
      const seenWeeks = new Set<string>();

      const uniquePlans = (plans || [])
        .filter(p => p.week_start_date >= cutoff)
        .filter(p => {
          if (seenWeeks.has(p.week_start_date)) return false;
          seenWeeks.add(p.week_start_date);
          return true;
        });

      const planIds = uniquePlans.map(p => p.id);

      const { data: items } = await supabase
        .from('meal_plan_items')
        .select('id, day_of_week, meal_plan_id, recipe_id, recipes(*)')
        .in('meal_plan_id', planIds);

      const groupedPlans: MealPlanWithItems[] = uniquePlans.map(plan => {
        const planItems = (items || []).filter(i => i.meal_plan_id === plan.id);

        const groupedDays = Array(7).fill(null).map((_, day) => ({
          day_of_week: day,
          entries: planItems
            .filter(i => i.day_of_week === day)
            .map(i => ({
              itemId: i.id,
              recipe: i.recipes
            }))
        }));

        return { ...plan, items: groupedDays };
      });

      const withCurrentWeeks = ensureCachedPlansHaveCurrentWeeks(groupedPlans);

      setMealPlans(prev => {
        const merged = mergePlans(prev, withCurrentWeeks);
        saveMealPlansToCache(merged);
        return merged;
      });

      // FIXED: no stale state usage
      setSelectedPlanId(prev => {
        if (prev) return prev;

        const thisWeek = currentWeekStart();
        const current = withCurrentWeeks.find(p => p.week_start_date === thisWeek);

        return (current ?? withCurrentWeeks[0])?.id ?? null;
      });

      await flushMealPlanQueue();
    } catch {
      const cached = loadMealPlansFromCache();
      if (cached) setMealPlans(cached);
    } finally {
      // ONLY UI bootstrap controls loading
      setLoading(false);
    }
  }

  // ----------------------------
  // BOOTSTRAP (CACHE FIRST, ALWAYS RENDER)
  // ----------------------------
  useEffect(() => {
    const cachedPlans = loadMealPlansFromCache();

    if (cachedPlans?.length) {
      const normalized = ensureCachedPlansHaveCurrentWeeks(cachedPlans);
      setMealPlans(normalized);
      saveMealPlansToCache(normalized);

      const thisWeek = currentWeekStart();
      const current = normalized.find(p => p.week_start_date === thisWeek);

      setSelectedPlanId((current ?? normalized[0])?.id ?? null);
    }

    const cachedRecipes = loadRecipesFromCache();
    if (cachedRecipes) setRecipes(cachedRecipes);

    setLoading(false);

    // background sync ONLY
    if (isOnlineSafe()) {
      ensureMealPlanWeeks().then(() => {
        fetchMealPlans();
        fetchRecipes();
      });
    }
  }, []);

  // ----------------------------
  // ONLINE SYNC
  // ----------------------------
  useEffect(() => {
    const handleOnline = () => {
      flushMealPlanQueue();

      if (isOnlineSafe()) {
        fetchMealPlans();
        fetchRecipes();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // ----------------------------
  // UI ACTIONS
  // ----------------------------
  async function addRecipeToDay(mealPlanId: string, recipeId: string, dayOfWeek: number) {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const matchedRecipe = recipes.find(r => r.id === recipeId);

    setMealPlans(prev => {
      const updated = prev.map(plan => {
        if (plan.id !== mealPlanId) return plan;

        const updatedItems = [...plan.items];

        updatedItems[dayOfWeek] = {
          ...updatedItems[dayOfWeek],
          entries: [
            ...updatedItems[dayOfWeek].entries,
            {
              itemId: tempId,
              recipe: { id: recipeId, title: matchedRecipe?.title ?? '' } as Recipe
            }
          ]
        };

        return { ...plan, items: updatedItems };
      });

      saveMealPlansToCache(updated);
      return updated;
    });

    setOpenDropdownDay(null);

    try {
      const realMealPlanId = mealPlanId.startsWith('offline-')
        ? await resolveOfflinePlanId(mealPlanId)
        : mealPlanId;

      if (!realMealPlanId) throw new Error('offline');

      const { data, error } = await supabase
        .from('meal_plan_items')
        .insert({
          meal_plan_id: realMealPlanId,
          recipe_id: recipeId,
          day_of_week: dayOfWeek
        })
        .select('id, day_of_week, recipes(*)')
        .single();

      if (error) throw error;

      setMealPlans(prev => {
        const updated = prev.map(plan => {
          if (plan.id !== mealPlanId) return plan;

          const updatedItems = [...plan.items];

          updatedItems[dayOfWeek] = {
            ...updatedItems[dayOfWeek],
            entries: updatedItems[dayOfWeek].entries.map(e =>
              e.itemId === tempId
                ? { itemId: data.id, recipe: data.recipes as unknown as Recipe }
                : e
            )
          };

          return { ...plan, items: updatedItems };
        });

        saveMealPlansToCache(updated);
        return updated;
      });

    } catch {
      enqueueMealPlanOp({
        kind: 'add',
        tempId,
        mealPlanId,
        recipeId,
        dayOfWeek,
        createdAt: new Date().toISOString(),
      });
    }
  }

  async function deleteMealPlanItem(itemId: string, mealPlanId: string, dayOfWeek: number) {
    setMealPlans(prev => {
      const updated = prev.map(plan => {
        if (plan.id !== mealPlanId) return plan;

        const updatedItems = [...plan.items];

        updatedItems[dayOfWeek] = {
          ...updatedItems[dayOfWeek],
          entries: updatedItems[dayOfWeek].entries.filter(e => e.itemId !== itemId)
        };

        return { ...plan, items: updatedItems };
      });

      saveMealPlansToCache(updated);
      return updated;
    });

    if (itemId.startsWith('temp-')) {
      enqueueMealPlanOp({
        kind: 'delete',
        itemId,
        createdAt: new Date().toISOString(),
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('meal_plan_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
    } catch {
      enqueueMealPlanOp({
        kind: 'delete',
        itemId,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // ----------------------------
  // UI
  // ----------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading meal plans...</div>
      </div>
    );
  }

  const selectedPlan = mealPlans.find(p => p.id === selectedPlanId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-6 sm:py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
            Meal Planning
          </h1>
        </div>

        {selectedPlan && (
          <div>... your existing UI ...</div>
        )}

      </div>
    </div>
  );
}

async function resolveOfflinePlanId(offlineId: string): Promise<string | null> {
  const weekStart = offlineId.replace('offline-', '');

  try {
    const { data: plans } = await supabase
      .from('meal_plans')
      .select('id')
      .eq('week_start_date', weekStart)
      .limit(1);

    if (!navigator.onLine) return null;

    if (plans?.length) return plans[0].id;

    const { data: created } = await supabase
      .from('meal_plans')
      .insert({ week_start_date: weekStart })
      .select('id')
      .single();

    return created?.id ?? null;

  } catch {
    return null;
  }
}