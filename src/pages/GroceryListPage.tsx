import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { supabase, type MealPlan, type Recipe } from '../lib/supabase';

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

// ----------------------
// 🆕 INGREDIENT PARSING + CONVERSION
// ----------------------
const UNIT_CONVERSIONS: Record<string, number> = {
  cup: 1,
  cups: 1,
  tbsp: 1 / 16,
  tablespoon: 1 / 16,
  tablespoons: 1 / 16,
  tsp: 1 / 48,
  teaspoon: 1 / 48,
  teaspoons: 1 / 48,
  oz: 1 / 8,
  ounce: 1 / 8,
  ounces: 1 / 8,
  slice: 1,
  slices: 1,
};

const FRACTION_MAP: Record<number, string> = {
  0.25: '1/4',
  0.33: '1/3',
  0.5: '1/2',
  0.66: '2/3',
  0.75: '3/4',
};

// Map unicode fractions to decimal
const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
};

// parse quantity strings like "1", "1 1/2", "½", etc.
const parseQuantity = (qtyStr: string) => {
  qtyStr = qtyStr.trim();
  if (!qtyStr) return 1;

  // replace unicode fractions
  Object.entries(UNICODE_FRACTIONS).forEach(([char, val]) => {
    qtyStr = qtyStr.replace(char, ` ${val}`);
  });

  const parts = qtyStr.split(' ').filter(Boolean);
  let total = 0;

  parts.forEach(p => {
    if (p.includes('/')) {
      const [num, denom] = p.split('/').map(Number);
      if (!isNaN(num) && !isNaN(denom)) total += num / denom;
    } else {
      const n = parseFloat(p);
      if (!isNaN(n)) total += n;
    }
  });

  return total || 1;
};

// parse an ingredient string into quantity, unit, and name
const parseIngredient = (ingredient: string) => {
  const trimmed = ingredient.trim();
  const match = trimmed.match(/^([\d\s\/\u00bc-\u00be\u2150-\u215e]+)?\s*([a-zA-Z]+)?\s*(.*)$/);

  if (!match) return { quantity: 1, unit: 'count', name: trimmed };

  let [, qtyStr, unit, name] = match;
  const quantity = qtyStr ? parseQuantity(qtyStr) : 1;

  if (!unit || !UNIT_CONVERSIONS[unit.toLowerCase()]) {
    name = [unit, name].filter(Boolean).join(' ').trim();
    unit = 'count';
  }

  return { quantity, unit: unit ? unit.toLowerCase() : 'count', name: name.trim() };
};

// aggregate ingredients smartly
const aggregateIngredientsSmart = (ingredientLists: string[][]) => {
  const result: Record<string, { quantity: number; unit: string }> = {};

  ingredientLists.forEach(list => {
    list.forEach(ingredient => {
      const { quantity, unit, name } = parseIngredient(ingredient);

      if (!result[name]) {
        result[name] = { quantity: 0, unit };
      }

      const convertedQty = quantity * (UNIT_CONVERSIONS[unit] || 1);
      result[name].quantity += convertedQty;

      if (unit !== 'count') result[name].unit = 'cup';
    });
  });

  return result;
};

// format ingredient for display
const formatIngredient = (name: string, data: any) => {
  if (data.unit === 'count') {
    const qty = Math.round(data.quantity * 100) / 100;
    return `${qty} ${name}${qty > 1 ? 's' : ''}`;
  }

  const whole = Math.floor(data.quantity);
  const fraction = data.quantity - whole;
  const roundedFrac = Object.keys(FRACTION_MAP)
    .map(Number)
    .find(f => Math.abs(f - fraction) < 0.02);

  const fractionStr = roundedFrac ? ` ${FRACTION_MAP[roundedFrac]}` : '';
  return `${whole > 0 ? whole : ''}${fractionStr} ${data.unit} ${name}`.trim();
};

// ----------------------
// COMPONENT
// ----------------------
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

      const aggregated = aggregateIngredientsSmart(ingredientLists);

      const ingredientArray: Ingredient[] = Object.entries(aggregated)
        .map(([name, data]) => ({
          name,
          quantity: data.quantity,
          unit: data.unit
        }))
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
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 py-6 sm:py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4 sm:mb-6">Grocery List</h1>
          <div className="bg-white rounded-lg shadow p-8 sm:p-12 text-center">
            <p className="text-sm sm:text-base text-gray-600">
              No meal plans yet. Create one first.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 py-6 sm:py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Grocery List
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Ingredients aggregated from your meal plan
          </p>
        </div>

        <div className="mb-6 sm:mb-8">
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
                Week of {new Date(plan.week_start_date).toLocaleDateString()}
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
            <div
              className={`px-4 sm:px-6 py-3 sm:py-4 transition-all duration-500 ${
                isComplete
                  ? 'bg-gradient-to-r from-blue-400 to-blue-600'
                  : 'bg-gradient-to-r from-green-600 to-emerald-600'
              }`}
            >
              <h2 className="text-lg sm:text-2xl font-bold text-white">
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
                    {formatIngredient(item.name, item)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}