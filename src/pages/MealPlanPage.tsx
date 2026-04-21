import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Plus } from 'lucide-react';
import { supabase, type MealPlan, type Recipe } from '../lib/supabase';
import { ensureMealPlanWeeks, cutoffWeekStart, currentWeekStart } from '../lib/mealPlanWeeks';

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

function formatWeekStart(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

export function MealPlanPage() {
  const navigate = useNavigate();
  const [mealPlans, setMealPlans] = useState<MealPlanWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [openDropdownDay, setOpenDropdownDay] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      await ensureMealPlanWeeks();
      await fetchMealPlans();
    })();
    fetchRecipes();
  }, []);

  async function fetchRecipes() {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('title');

      if (error) throw error;
      setRecipes(data || []);
    } catch (err) {
      console.error('Error fetching recipes:', err);
    }
  }

  async function fetchMealPlans() {
    try {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('*')
        .order('week_start_date', { ascending: true });

      if (error) throw error;

      const cutoff = cutoffWeekStart();
      const seenWeeks = new Set<string>();
      const uniquePlans = (data || [])
        .filter(plan => plan.week_start_date >= cutoff)
        .filter(plan => {
          if (seenWeeks.has(plan.week_start_date)) {
            return false;
          }
          seenWeeks.add(plan.week_start_date);
          return true;
        });

      const plansWithItems = await Promise.all(
        uniquePlans.map(async (plan) => {
          const { data: items } = await supabase
            .from('meal_plan_items')
            .select('id, day_of_week, recipes(*)')
            .eq('meal_plan_id', plan.id);

          const groupedItems = Array(7).fill(null).map((_, i) => ({
            day_of_week: i,
            entries: (items || [])
              .filter((item: { day_of_week: number }) => item.day_of_week === i)
              .flatMap((item: { id: string; recipes: Recipe | Recipe[] | null }) => {
                const recipeList = Array.isArray(item.recipes)
                  ? item.recipes
                  : item.recipes
                    ? [item.recipes]
                    : [];
                return recipeList.map((recipe) => ({ itemId: item.id, recipe }));
              }),
          }));

          return { ...plan, items: groupedItems };
        })
      );

      setMealPlans(plansWithItems);
      if (plansWithItems.length > 0 && !selectedPlanId) {
        const thisWeek = currentWeekStart();
        const current = plansWithItems.find((p) => p.week_start_date === thisWeek);
        setSelectedPlanId((current ?? plansWithItems[0]).id);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching meal plans:', err);
      setLoading(false);
    }
  }

  async function addRecipeToDay(mealPlanId: string, recipeId: string, dayOfWeek: number) {
    try {
      const { error } = await supabase
        .from('meal_plan_items')
        .insert({
          meal_plan_id: mealPlanId,
          recipe_id: recipeId,
          day_of_week: dayOfWeek
        });

      if (error) throw error;
      setOpenDropdownDay(null);
      await fetchMealPlans();
    } catch (err) {
      console.error('Error adding recipe to day:', err);
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
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">Meal Planning</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">Total meal plans: {mealPlans.length}</p>
        </div>

        {mealPlans.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">No meal plans available</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">Select Week</label>
              <select
                value={selectedPlanId || ''}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {mealPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    Week of {formatWeekStart(plan.week_start_date)}
                  </option>
                ))}
              </select>
            </div>

            {selectedPlan && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-blue-600 px-4 sm:px-6 py-3 sm:py-4">
                  <h2 className="text-lg sm:text-2xl font-bold text-white">
                    Week of {formatWeekStart(selectedPlan.week_start_date)}
                  </h2>
                </div>
                <div className="divide-y">
                  {DAYS.map((day, idx) => (
                    <div key={idx} className="p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-2 mb-3 sm:mb-4">
                        <h3 className="text-base sm:text-lg font-bold text-gray-900">{day}</h3>
                        <span className="text-xs sm:text-sm bg-blue-100 text-blue-800 px-2 sm:px-3 py-1 rounded-full font-medium whitespace-nowrap">
                          {selectedPlan.items[idx]?.entries.length || 0} recipe{(selectedPlan.items[idx]?.entries.length || 0) !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {(selectedPlan.items[idx]?.entries.length || 0) > 0 && (
                          <>
                            {selectedPlan.items[idx]?.entries.map(({ itemId, recipe }) => (
                              <div key={itemId} className="bg-blue-50 p-4 rounded-lg flex justify-between items-start gap-3 border border-blue-100">
                                <button
                                  onClick={() => navigate(`/recipe/${recipe.id}`, { state: { fromMealPlan: true } })}
                                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left flex-1"
                                >
                                  {recipe.title}
                                </button>
                                <button
                                  onClick={async () => {
                                    const { error } = await supabase
                                      .from('meal_plan_items')
                                      .delete()
                                      .eq('id', itemId);
                                    if (error) {
                                      console.error('Error deleting meal plan item:', error);
                                      return;
                                    }
                                    await fetchMealPlans();
                                  }}
                                  className="text-red-500 hover:text-red-700 flex-shrink-0"
                                  aria-label={`Remove ${recipe.title}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}

                        <div className="relative">
                          <button
                            onClick={() => setOpenDropdownDay(openDropdownDay === idx ? null : idx)}
                            className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium py-2 px-3 rounded-lg border border-dashed border-blue-300 hover:border-blue-400 transition flex items-center justify-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            Add Recipe
                          </button>

                          {openDropdownDay === idx && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                              {recipes.length === 0 ? (
                                <div className="p-3 text-sm text-gray-500">No recipes available</div>
                              ) : (
                                recipes.map((recipe) => (
                                  <button
                                    key={recipe.id}
                                    onClick={() => addRecipeToDay(selectedPlan.id, recipe.id, idx)}
                                    className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm text-gray-900 transition border-b border-gray-100 last:border-0"
                                  >
                                    {recipe.title}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
