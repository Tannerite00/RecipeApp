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
  const [recipes, setRecipes] = useState<Pick<Recipe, 'id' | 'title'>[]>([]);
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
      const { data: plans, error } = await supabase
        .from('meal_plans')
        .select('*')
        .order('week_start_date', { ascending: true });

      if (error) throw error;

      const cutoff = cutoffWeekStart();
      const seenWeeks = new Set<string>();

      const uniquePlans = (plans || [])
        .filter(plan => plan.week_start_date >= cutoff)
        .filter(plan => {
          if (seenWeeks.has(plan.week_start_date)) return false;
          seenWeeks.add(plan.week_start_date);
          return true;
        });

      const planIds = uniquePlans.map(p => p.id);


      const { data: items } = await supabase
        .from('meal_plan_items')
        .select('id, day_of_week, meal_plan_id, recipe_id, recipes(*)')
        .in('meal_plan_id', planIds);

      const groupedPlans = uniquePlans.map(plan => {
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

      setMealPlans(groupedPlans);

      if (groupedPlans.length > 0 && !selectedPlanId) {
        const thisWeek = currentWeekStart();
        const current = groupedPlans.find(p => p.week_start_date === thisWeek);
        setSelectedPlanId((current ?? groupedPlans[0]).id);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching meal plans:', err);
      setLoading(false);
    }
  }

  async function addRecipeToDay(mealPlanId: string, recipeId: string, dayOfWeek: number) {
    try {
      const { data, error } = await supabase
        .from('meal_plan_items')
        .insert({
          meal_plan_id: mealPlanId,
          recipe_id: recipeId,
          day_of_week: dayOfWeek
        })
        .select('id, day_of_week, recipes(*)')
        .single();

      if (error) throw error;

      setMealPlans(prev =>
        prev.map(plan => {
          if (plan.id !== mealPlanId) return plan;

          const updatedItems = [...plan.items];

          updatedItems[dayOfWeek] = {
            ...updatedItems[dayOfWeek],
            entries: [
              ...updatedItems[dayOfWeek].entries,
              {
                itemId: data.id,
                recipe: data.recipes
              }
            ]
          };

          return { ...plan, items: updatedItems };
        })
      );

      setOpenDropdownDay(null);
    } catch (err) {
      console.error('Error adding recipe to day:', err);
    }
  }

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

          const updatedItems = [...plan.items];

          updatedItems[dayOfWeek] = {
            ...updatedItems[dayOfWeek],
            entries: updatedItems[dayOfWeek].entries.filter(e => e.itemId !== itemId)
          };

          return { ...plan, items: updatedItems };
        })
      );
    } catch (err) {
      console.error('Error deleting meal plan item:', err);
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
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
            Meal Planning
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">
            Total meal plans: {mealPlans.length}
          </p>
        </div>

        {mealPlans.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">No meal plans available</p>
          </div>
        ) : (
          <div className="space-y-6">

            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Week
              </label>

              <select
                value={selectedPlanId || ''}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              >
                {mealPlans.map(plan => (
                  <option key={plan.id} value={plan.id}>
                    Week of {formatWeekStart(plan.week_start_date)}
                  </option>
                ))}
              </select>
            </div>

            {selectedPlan && (
              <div className="bg-white rounded-lg shadow overflow-hidden">

                <div className="bg-blue-600 px-6 py-4">
                  <h2 className="text-white font-bold text-xl">
                    Week of {formatWeekStart(selectedPlan.week_start_date)}
                  </h2>
                </div>

                <div className="divide-y">
                  {DAYS.map((day, idx) => (
                    <div key={idx} className="p-4 sm:p-6">

                      <h3 className="font-bold mb-3">{day}</h3>

                      {selectedPlan.items[idx]?.entries.map(({ itemId, recipe }) => (
                        <div key={itemId} className="flex justify-between bg-blue-50 p-3 mb-2 rounded">

                          <button
                            onClick={() => navigate(`/recipe/${recipe.id}`)}
                            className="text-blue-600 text-sm"
                          >
                            {recipe.title}
                          </button>

                          <button
                            onClick={() => deleteMealPlanItem(itemId, selectedPlan.id, idx)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>

                        </div>
                      ))}

                      <div className="relative mt-2">
                        <button
                          onClick={() =>
                            setOpenDropdownDay(openDropdownDay === idx ? null : idx)
                          }
                          className="text-sm text-blue-600 flex items-center gap-1"
                        >
                          <Plus className="w-4 h-4" />
                          Add Recipe
                        </button>

                        {openDropdownDay === idx && (
                          <div className="absolute bg-white border mt-2 w-full z-10">
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

              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}