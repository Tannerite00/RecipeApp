import { useEffect, useState } from 'react';
import { supabase, type MealPlan, type Recipe } from '../lib/supabase';
import { getWeekDates, aggregateIngredients } from '../lib/utils';

interface Ingredient {
  name: string;
  count: number;
}

export function GroceryListPage() {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [selectedMealPlan, setSelectedMealPlan] = useState('');
  const [groceryItems, setGroceryItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchMealPlans();
  }, []);

  async function fetchMealPlans() {
    try {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('*')
        .order('week_start_date', { ascending: false });

      if (error) throw error;
      setMealPlans(data || []);
      if (data && data.length > 0) {
        setSelectedMealPlan(data[0].id);
        fetchGroceryList(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching meal plans:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchGroceryList(mealPlanId: string) {
    try {
      const { data: items, error } = await supabase
        .from('meal_plan_items')
        .select('recipes(*)')
        .eq('meal_plan_id', mealPlanId);

      if (error) throw error;

      const recipes: Recipe[] = items?.map(item => item.recipes).flat() || [];
      const ingredientLists = recipes.map(r => r.ingredients);
      const aggregated = aggregateIngredients(ingredientLists);

      const ingredientArray: Ingredient[] = Object.entries(aggregated)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setGroceryItems(ingredientArray);
    } catch (err) {
      console.error('Error fetching grocery list:', err);
    }
  }

  const handleMealPlanChange = (planId: string) => {
    setSelectedMealPlan(planId);
    setCheckedItems(new Set());
    fetchGroceryList(planId);
  };

  const toggleCheckItem = (itemName: string) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(itemName)) {
      newChecked.delete(itemName);
    } else {
      newChecked.add(itemName);
    }
    setCheckedItems(newChecked);
  };

  const checkedCount = checkedItems.size;
  const totalCount = groceryItems.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (mealPlans.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Grocery List</h1>
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">No meal plans yet. Create a meal plan first to generate a grocery list.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Grocery List</h1>
          <p className="text-gray-600">Ingredients aggregated from your meal plan</p>
        </div>

        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Meal Plan</label>
          <select
            value={selectedMealPlan}
            onChange={(e) => handleMealPlanChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {mealPlans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                Week of {new Date(plan.week_start_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                })}
              </option>
            ))}
          </select>
        </div>

        {groceryItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">No items in this meal plan yet. Add recipes to generate a grocery list.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4">
              <h2 className="text-2xl font-bold text-white">
                {checkedCount} of {totalCount} items purchased
              </h2>
              <div className="mt-2 h-2 bg-green-400 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-300"
                  style={{ width: `${totalCount > 0 ? (checkedCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {groceryItems.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => toggleCheckItem(item.name)}
                  className={`p-4 cursor-pointer transition hover:bg-gray-50 flex items-center gap-3 ${
                    checkedItems.has(item.name) ? 'bg-green-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checkedItems.has(item.name)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleCheckItem(item.name);
                    }}
                    className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className={`font-medium ${checkedItems.has(item.name) ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {item.name}
                    </p>
                  </div>
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-700 font-semibold">
                    {item.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
