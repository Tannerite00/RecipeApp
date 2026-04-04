import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { supabase, type MealPlan, type Recipe } from '../lib/supabase';
import { aggregateIngredients } from '../lib/utils';

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
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    fetchMealPlans();
  }, []);

  useEffect(() => {
    const percent = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

    if (percent === 100 && !isComplete) {
      setIsComplete(true);
      triggerConfetti();
    }

    if (percent < 100 && isComplete) {
      setIsComplete(false);
    }
  }, [checkedItems, groceryItems]);

  const triggerConfetti = () => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 }
    });
  };

  async function fetchMealPlans() {
    try {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('*')
        .order('week_start_date', { ascending: false });

      if (error) throw error;

      const seenWeeks = new Set<string>();
      const uniquePlans = (data || []).filter(plan => {
        if (seenWeeks.has(plan.week_start_date)) return false;
        seenWeeks.add(plan.week_start_date);
        return true;
      });

      setMealPlans(uniquePlans);

      if (uniquePlans.length > 0) {
        setSelectedMealPlan(uniquePlans[0].id);
        fetchGroceryList(uniquePlans[0].id);
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
    setIsComplete(false);
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
  const progressPercent = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

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
        <div className="max-w-3xl mx-auto px-4">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Grocery List</h1>
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">
              No meal plans yet. Create one first.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Grocery List
          </h1>
          <p className="text-gray-600">
            Ingredients aggregated from your meal plan
          </p>
        </div>

        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Meal Plan
          </label>
          <select
            value={selectedMealPlan}
            onChange={(e) => handleMealPlanChange(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          >
            {mealPlans.map(plan => (
              <option key={plan.id} value={plan.id}>
                Week of{' '}
                {new Date(plan.week_start_date).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        {groceryItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">
              No items yet. Add recipes to generate a list.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* HEADER */}
            <div
              className={`px-6 py-4 transition-all duration-500 ${
                isComplete
                  ? 'bg-gradient-to-r from-blue-400 to-blue-600'
                  : 'bg-gradient-to-r from-green-600 to-emerald-600'
              }`}
            >
              <h2 className="text-2xl font-bold text-white">
                {checkedCount} of {totalCount} items purchased
              </h2>

              <div className="mt-2 h-2 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {isComplete && (
                <p className="mt-2 text-white font-semibold">
                  🎉 All items checked! Nice work!
                </p>
              )}
            </div>

            {/* LIST */}
            <div className="divide-y">
              {groceryItems.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => toggleCheckItem(item.name)}
                  className={`p-4 cursor-pointer flex items-center gap-3 transition ${
                    checkedItems.has(item.name)
                      ? 'bg-green-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checkedItems.has(item.name)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleCheckItem(item.name);
                    }}
                    className="w-5 h-5"
                  />

                  <p
                    className={`flex-1 font-medium ${
                      checkedItems.has(item.name)
                        ? 'line-through text-gray-500'
                        : ''
                    }`}
                  >
                    {item.name}
                  </p>

                  <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full font-semibold">
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