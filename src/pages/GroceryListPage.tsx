import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { type MealPlan, type Recipe } from '../lib/supabase';
import { currentWeekStart, getOfflineMealPlans } from '../lib/mealPlanWeeks';
import { cacheGet, getServingOverrides } from '../lib/offlineCache';
import { parseServingCount, scaleIngredient } from '../lib/servingScale';

interface GroceryItem {
  name: string;
  quantity: number;
  unit: string;
  key: string;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '\u00BC': 1/4, '\u00BD': 1/2, '\u00BE': 3/4,
  '\u2150': 1/7, '\u2151': 1/9, '\u2152': 1/10,
  '\u2153': 1/3, '\u2154': 2/3, '\u2155': 1/5,
  '\u2156': 2/5, '\u2157': 3/5, '\u2158': 4/5,
  '\u2159': 1/6, '\u215A': 5/6, '\u215B': 1/8,
  '\u215C': 3/8, '\u215D': 5/8, '\u215E': 7/8,
};

const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

const LEADING_QTY_RE = new RegExp(
  `^\\s*(\\d+\\s*[${FRACTION_CHARS}]|\\d+\\/\\d+|\\d+\\.\\d+|\\d+|[${FRACTION_CHARS}])\\s*(.*)$`
);

const KNOWN_UNITS: Record<string, string> = {
  cup: 'cup', cups: 'cup',
  tablespoon: 'tablespoon', tablespoons: 'tablespoon', tbsp: 'tablespoon',
  teaspoon: 'teaspoon', teaspoons: 'teaspoon', tsp: 'teaspoon',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  clove: 'clove', cloves: 'clove',
  slice: 'slice', slices: 'slice',
  can: 'can', cans: 'can',
  bunch: 'bunch', bunches: 'bunch',
  head: 'head', heads: 'head',
  sprig: 'sprig', sprigs: 'sprig',
  pinch: 'pinch',
  dash: 'dash',
};

function parseFraction(s: string): number {
  s = s.trim();
  for (const [ch, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (s.includes(ch)) {
      const before = s.replace(ch, '').trim();
      return (before ? parseFloat(before) : 0) + val;
    }
  }
  if (s.includes('/')) {
    const [n, d] = s.split('/');
    return parseFloat(n) / parseFloat(d);
  }
  return parseFloat(s);
}

function toFriendlyFraction(n: number): string {
  if (n === 0) return '0';
  const whole = Math.floor(n);
  const frac = n - whole;
  if (Math.abs(frac) < 0.01) return String(whole);

  const fractions: [number, string][] = [
    [1/8, '1/8'], [1/4, '1/4'], [1/3, '1/3'],
    [3/8, '3/8'], [1/2, '1/2'], [5/8, '5/8'],
    [2/3, '2/3'], [3/4, '3/4'], [7/8, '7/8'],
  ];
  let best = '';
  let bestDiff = Infinity;
  for (const [val, str] of fractions) {
    const diff = Math.abs(frac - val);
    if (diff < bestDiff) { bestDiff = diff; best = str; }
  }
  if (bestDiff < 0.04) {
    return whole > 0 ? `${whole} ${best}` : best;
  }
  const rounded = Math.round(n * 100) / 100;
  if (rounded === Math.round(rounded)) return String(Math.round(rounded));
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function parseIngredient(raw: string): { quantity: number; unit: string; name: string } {
  const trimmed = raw.trim().replace(/<[^>]*>/g, '');
  const qtyMatch = trimmed.match(LEADING_QTY_RE);
  if (!qtyMatch) return { quantity: 0, unit: '', name: trimmed };

  const quantity = parseFraction(qtyMatch[1].trim());
  let rest = qtyMatch[2].trim();

  const unitMatch = rest.match(/^(\S+)\s+(.*)$/);
  if (unitMatch) {
    const candidate = unitMatch[1].toLowerCase().replace(/\.$/, '');
    const canonical = KNOWN_UNITS[candidate];
    if (canonical) {
      return { quantity: isNaN(quantity) ? 1 : quantity, unit: canonical, name: unitMatch[2].trim() };
    }
  }

  return { quantity: isNaN(quantity) ? 1 : quantity, unit: '', name: rest };
}

function aggregateIngredients(ingredientLists: string[][]): GroceryItem[] {
  const map = new Map<string, { quantity: number; unit: string; name: string }>();

  for (const list of ingredientLists) {
    for (const raw of list) {
      const { quantity, unit, name } = parseIngredient(raw);
      if (!name) continue;

      const key = `${unit}||${name.toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantity += quantity;
      } else {
        map.set(key, { quantity, unit, name });
      }
    }
  }

  return Array.from(map.entries())
    .map(([key, data]) => ({ key, name: data.name, quantity: data.quantity, unit: data.unit }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatGroceryItem(item: GroceryItem): string {
  const qtyStr = item.quantity > 0 ? toFriendlyFraction(item.quantity) : '';
  const parts = [qtyStr, item.unit, item.name].filter(Boolean);
  return parts.join(' ');
}

function formatWeekStart(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

export function GroceryListPage() {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [selectedMealPlan, setSelectedMealPlan] = useState('');
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const cachedPlans = cacheGet<MealPlan[]>('grocery-meal-plans');
    if (cachedPlans && cachedPlans.length) {
      setMealPlans(cachedPlans);
      const thisWeek = currentWeekStart();
      const initial = cachedPlans.find(p => p.week_start_date === thisWeek) ?? cachedPlans[0];
      setSelectedMealPlan(initial.id);
      buildGroceryList(initial.id);
    } else {
      const offlinePlans = getOfflineMealPlans();
      if (offlinePlans.length) {
        setMealPlans(offlinePlans as MealPlan[]);
        const thisWeek = currentWeekStart();
        const initial = offlinePlans.find(p => p.week_start_date === thisWeek) ?? offlinePlans[0];
        setSelectedMealPlan(initial.id);
        buildGroceryList(initial.id);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const percent = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
    if (percent === 100 && !isComplete) {
      setIsComplete(true);
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }
    if (percent < 100 && isComplete) setIsComplete(false);
  }, [checkedItems, groceryItems]);

  function buildGroceryList(mealPlanId: string) {
    const cachedMealPlans = cacheGet<any[]>('meal-plans');
    if (!cachedMealPlans) {
      setGroceryItems([]);
      return;
    }
    const plan = cachedMealPlans.find((p: any) => p.id === mealPlanId);
    if (!plan || !plan.items) {
      setGroceryItems([]);
      return;
    }

    const allRecipes = cacheGet<Recipe[]>('recipes') || [];
    const overrides = getServingOverrides();
    const ingredientLists: string[][] = [];

    for (const day of plan.items) {
      for (const entry of day.entries) {
        const recipe = allRecipes.find((r: Recipe) => r.id === entry.recipe?.id);
        if (!recipe) continue;

        const chosenServings = overrides[entry.itemId];
        const baseCount = parseServingCount(recipe.servings);
        const multiplier = (chosenServings && baseCount) ? chosenServings / baseCount : 1;

        if (multiplier === 1) {
          ingredientLists.push(recipe.ingredients);
        } else {
          ingredientLists.push(
            recipe.ingredients.map((ing: string) => scaleIngredient(ing, multiplier))
          );
        }
      }
    }

    setGroceryItems(aggregateIngredients(ingredientLists));
  }

  const handleMealPlanChange = (planId: string) => {
    setSelectedMealPlan(planId);
    setCheckedItems(new Set());
    setIsComplete(false);
    buildGroceryList(planId);
  };

  const toggleCheckItem = (itemName: string) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(itemName)) newChecked.delete(itemName);
    else newChecked.add(itemName);
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
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2">Grocery List</h1>
          <p className="text-sm sm:text-base text-gray-600">Ingredients aggregated from your meal plan</p>
        </div>

        <div className="mb-6 sm:mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Meal Plan</label>
          <select
            value={selectedMealPlan}
            onChange={(e) => handleMealPlanChange(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          >
            {mealPlans.map(plan => (
              <option key={plan.id} value={plan.id}>
                Week of {formatWeekStart(plan.week_start_date)}
              </option>
            ))}
          </select>
        </div>

        {groceryItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">No items yet. Add recipes to generate a list.</p>
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
                <div className="h-full bg-white transition-all duration-500" style={{ width: `${progressPercent}%` }} />
              </div>
              {isComplete && <p className="mt-2 text-white font-semibold">All items checked! Nice work!</p>}
            </div>

            <div className="divide-y">
              {groceryItems.map((item) => (
                <div
                  key={item.key}
                  onClick={() => toggleCheckItem(item.key)}
                  className={`p-4 cursor-pointer flex items-center gap-3 transition ${
                    checkedItems.has(item.key) ? 'bg-green-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checkedItems.has(item.key)}
                    onChange={(e) => { e.stopPropagation(); toggleCheckItem(item.key); }}
                    className="w-5 h-5"
                  />
                  <p className={`flex-1 font-medium ${checkedItems.has(item.key) ? 'line-through text-gray-500' : ''}`}>
                    {formatGroceryItem(item)}
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
