import { useEffect, useState } from 'react';
import { Trash2, ChevronDown } from 'lucide-react';
import { supabase, type MealPlan, type Recipe } from '../lib/supabase';
import { getWeekDates } from '../lib/utils';

interface MealPlanWithItems extends MealPlan {
  items: {
    day_of_week: number;
    recipes: Recipe[];
  }[];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getOrCreateUserId(): string {
  const key = 'recipehub_user_id';
  let userId = localStorage.getItem(key);
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem(key, userId);
  }
  return userId;
}

function getFirstMondayOf2026() {
  const date = new Date(2026, 0, 1);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function generateWeeklyMondays() {
  const mondays = [];
  const firstMonday = getFirstMondayOf2026();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let current = new Date(firstMonday);
  while (current <= today) {
    mondays.push(new Date(current));
    current.setDate(current.getDate() + 7);
  }

  return mondays;
}

export function MealPlanPage() {
  const [mealPlans, setMealPlans] = useState<MealPlanWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  useEffect(() => {
    initializeMealPlans();
  }, []);

  async function initializeMealPlans() {
    try {
      const userId = getOrCreateUserId();
      const mondays = generateWeeklyMondays();

      const { data: existingPlans, error: fetchError } = await supabase
        .from('meal_plans')
        .select('week_start_date')
        .eq('user_id', userId);

      if (fetchError) {
        console.error('Error fetching existing plans:', fetchError);
        setLoading(false);
        return;
      }

      const existingDates = new Set(
        (existingPlans || []).map(p => new Date(p.week_start_date).toDateString())
      );

      const missingMondays = mondays.filter(
        m => !existingDates.has(m.toDateString())
      );

      if (missingMondays.length > 0) {
        const { error: insertError } = await supabase.from('meal_plans').insert(
          missingMondays.map(monday => ({
            week_start_date: monday.toISOString().split('T')[0],
            user_id: userId
          }))
        );

        if (insertError) {
          console.error('Error inserting meal plans:', insertError);
        }
      }

      await fetchMealPlans();
    } catch (err) {
      console.error('Error initializing meal plans:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMealPlans() {
    try {
      const userId = getOrCreateUserId();
      const { data, error } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('user_id', userId)
        .order('week_start_date', { ascending: false });

      if (error) throw error;

      const plansWithItems = await Promise.all(
        (data || []).map(async (plan) => {
          const { data: items } = await supabase
            .from('meal_plan_items')
            .select('day_of_week, recipes(*)')
            .eq('meal_plan_id', plan.id);

          const groupedItems = Array(7).fill(null).map((_, i) => ({
            day_of_week: i,
            recipes: items?.filter(item => item.day_of_week === i).map(item => item.recipes).flat() || []
          }));

          return { ...plan, items: groupedItems };
        })
      );

      setMealPlans(plansWithItems);
      if (plansWithItems.length > 0 && !selectedPlanId) {
        setSelectedPlanId(plansWithItems[0].id);
      }
    } catch (err) {
      console.error('Error fetching meal plans:', err);
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
  const weekDates = selectedPlan ? getWeekDates(new Date(selectedPlan.week_start_date)) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Meal Planning</h1>
          <p className="text-gray-600 mt-2">Select a week and plan your meals</p>
        </div>

        {mealPlans.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">No meal plans available</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">Select Week</label>
              <div className="relative">
                <select
                  value={selectedPlanId || ''}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white cursor-pointer"
                >
                  {mealPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      Week of {new Date(plan.week_start_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {selectedPlan && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                  <h2 className="text-2xl font-bold text-white">
                    {new Date(selectedPlan.week_start_date).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric'
                    })} - {new Date(new Date(selectedPlan.week_start_date).getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </h2>
                </div>
                <div className="divide-y">
                  {weekDates.map((day, idx) => (
                    <div key={idx} className="p-6 hover:bg-gray-50 transition">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{day.label}</h3>
                          <p className="text-sm text-gray-600">{day.displayDate}</p>
                        </div>
                        <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
                          {selectedPlan.items[idx]?.recipes.length || 0} recipe{(selectedPlan.items[idx]?.recipes.length || 0) !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {selectedPlan.items[idx]?.recipes.length > 0 ? (
                        <div className="space-y-2">
                          {selectedPlan.items[idx]?.recipes.map((recipe) => (
                            <div key={recipe.id} className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg flex justify-between items-start gap-3 border border-blue-100">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">{recipe.title}</p>
                              </div>
                              <button
                                onClick={async () => {
                                  const { data: items } = await supabase
                                    .from('meal_plan_items')
                                    .select('id')
                                    .eq('meal_plan_id', selectedPlan.id)
                                    .eq('recipe_id', recipe.id)
                                    .eq('day_of_week', idx)
                                    .maybeSingle();
                                  if (items?.id) {
                                    await supabase
                                      .from('meal_plan_items')
                                      .delete()
                                      .eq('id', items.id);
                                    await fetchMealPlans();
                                  }
                                }}
                                className="text-red-500 hover:text-red-700 flex-shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No recipes planned</p>
                      )}
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