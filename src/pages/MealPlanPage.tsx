import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Plus } from 'lucide-react';
import { supabase, type MealPlan, type Recipe } from '../lib/supabase';
import { ensureMealPlanWeeks, cutoffWeekStart, currentWeekStart } from '../lib/mealPlanWeeks';

interface MealPlanItemEntry {
  itemId: string;
  recipe: Recipe;
  day_of_week: number;
  meal_plan_id: string;
}

interface MealPlanWithItems extends MealPlan {
  items: {
    day_of_week: number;
    entries: MealPlanItemEntry[];
  }[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatWeekStart(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

export function MealPlanPage() {
  const navigate = useNavigate();

  const [mealPlans, setMealPlans] = useState<MealPlanWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Pick<Recipe, 'id' | 'title'>[]>([]);
  const [openDropdownDay, setOpenDropdownDay] = useState<number | null>(null);

  // simple in-memory cache (prevents re-fetch loops on navigation)
  const mealPlanCacheRef = useState<{ data: MealPlanWithItems[] | null }>({ data: null })[0];

  useEffect(() => {
    init();
  }, []);

  async function init() {
    await ensureMealPlanWeeks();
    await Promise.all([fetchMealPlans(), fetchRecipes()]);
  }

  async function fetchRecipes() {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title')
        .order('title');

      if (error) throw error;
      setRecipes(data || []);
    } catch (err) {
      console.error('Error fetching recipes:', err);
    }
  }

  async function fetchMealPlans() {
    try {
      // use cache if available
      if (mealPlanCacheRef.data) {
        setMealPlans(mealPlanCacheRef.data);
        setLoading(false);
        return;
      }

      // 1️⃣ fetch meal plans
      const { data: plans, error: planError } = await supabase
        .from('meal_plans')
        .select('*')
        .order('week_start_date', { ascending: true });

      if (planError) throw planError;

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

      // 2️⃣ SINGLE query instead of N+1
      const { data: items, error: itemError } = await supabase
        .from('meal_plan_items')
        .select('id, day_of_week, meal_plan_id, recipes(id, title)')
        .in('meal_plan_id', planIds);

      if (itemError) throw itemError;

      // 3️⃣ group items in memory
      const plansWithItems: MealPlanWithItems = uniquePlans.map((plan: any) => {
        const planItems = (items || []).filter(i => i.meal_plan_id === plan.id);

        const grouped = Array(7).fill(null).map((_, i) => ({
          day_of_week: i,
          entries: planItems
            .filter(i => i.day_of_week === i)
            .flatMap((item: any) => [
              {
                itemId: item.id,
                recipe: item.recipes,
                day_of_week: item.day_of_week,
                meal_plan_id: item.meal_plan_id
              }
            ])
        }));

        return { ...plan, items: grouped };
      });

      mealPlanCacheRef.data = plansWithItems;
      setMealPlans(plansWithItems);

      if (plansWithItems.length > 0 && !selectedPlanId) {
        const thisWeek = currentWeekStart();
        const current = plansWithItems.find(p => p.week_start_date === thisWeek);
        setSelectedPlanId((current ?? plansWithItems[0]).id);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching meal plans:', err);
      setLoading(false);
    }
  }

  // 🔥 OPTIMISTIC ADD (no full refetch)
  async function addRecipeToDay(mealPlanId: string, recipeId: string, dayOfWeek: number) {
    try {
      const { data, error } = await supabase
        .from('meal_plan_items')
        .insert({
          meal_plan_id: mealPlanId,
          recipe_id: recipeId,
          day_of_week: dayOfWeek
        })
        .select('id, day_of_week, meal_plan_id, recipes(id, title)')
        .single();

      if (error) throw error;

      setMealPlans(prev =>
        prev.map(plan => {
          if (plan.id !== mealPlanId) return plan;

          const updatedItems = [...plan.items];

          const dayGroup = updatedItems[dayOfWeek];

          dayGroup.entries.push({
            itemId: data.id,
            recipe: data.recipes,
            day_of_week: dayOfWeek,
            meal_plan_id: mealPlanId
          });

          return { ...plan, items: updatedItems };
        })
      );

      setOpenDropdownDay(null);
    } catch (err) {
      console.error('Error adding recipe:', err);
    }
  }

  // 🔥 OPTIMISTIC DELETE (no full refetch)
  async function deleteMealPlanItem(itemId: string, mealPlanId: string, dayOfWeek: number) {
    try {
      const { error } = await supabase
        .from('meal_plan_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      setMealPlans(prev =>
        prev.map(plan => {
          if (plan.id !== mealPlanId) return plan;

          const updatedItems = plan.items.map(day => ({
            ...day,
            entries: day.entries.filter(e => e.itemId !== itemId)
          }));

          return { ...plan, items: updatedItems };
        })
      );
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  }

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

        <h1 className="text-3xl font-bold mb-2">Meal Planning</h1>
        <p className="text-gray-600 mb-6">Total meal plans: {mealPlans.length}</p>

        <select
          value={selectedPlanId || ''}
          onChange={(e) => setSelectedPlanId(e.target.value)}
          className="w-full mb-6 p-3 border rounded"
        >
          {mealPlans.map(plan => (
            <option key={plan.id} value={plan.id}>
              Week of {formatWeekStart(plan.week_start_date)}
            </option>
          ))}
        </select>

        {selectedPlan && (
          <div className="bg-white rounded shadow">
            {DAYS.map((day, idx) => (
              <div key={idx} className="p-4 border-b">
                <h3 className="font-bold mb-2">{day}</h3>

                {selectedPlan.items[idx]?.entries.map(({ itemId, recipe, meal_plan_id }) => (
                  <div key={itemId} className="flex justify-between bg-blue-50 p-2 mb-2 rounded">
                    <button
                      onClick={() => navigate(`/recipe/${recipe.id}`)}
                      className="text-blue-600"
                    >
                      {recipe.title}
                    </button>

                    <button
                      onClick={() => deleteMealPlanItem(itemId, meal_plan_id, idx)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                ))}

                <div>
                  <button onClick={() => setOpenDropdownDay(openDropdownDay === idx ? null : idx)}>
                    <Plus className="w-4 h-4 inline" /> Add Recipe
                  </button>

                  {openDropdownDay === idx && (
                    <div className="border mt-2">
                      {recipes.map(r => (
                        <button
                          key={r.id}
                          onClick={() => addRecipeToDay(selectedPlan.id, r.id, idx)}
                          className="block w-full text-left p-2 hover:bg-gray-100"
                        >
                          {r.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}