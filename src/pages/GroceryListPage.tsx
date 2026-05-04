import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { List, LayoutGrid } from 'lucide-react';
import { type MealPlan, type Recipe } from '../lib/supabase';
import { currentWeekStart, getOfflineMealPlans } from '../lib/mealPlanWeeks';
import { cacheGet, getServingOverrides } from '../lib/offlineCache';
import { parseServingCount, scaleIngredient } from '../lib/servingScale';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GroceryItem {
  name: string;
  quantity: number;
  unit: string;
  key: string;
}

interface RecipeGroup {
  recipeId: string;
  recipeTitle: string;
  items: GroceryItem[];
}

type ViewMode = 'category' | 'recipe';

// ---------------------------------------------------------------------------
// Fraction / quantity helpers
// ---------------------------------------------------------------------------

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

function aggregateSingleRecipe(ingredients: string[]): GroceryItem[] {
  return aggregateIngredients([ingredients]);
}

function formatGroceryItem(item: GroceryItem): string {
  const qtyStr = item.quantity > 0 ? toFriendlyFraction(item.quantity) : '';
  const parts = [qtyStr, item.unit, item.name].filter(Boolean);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Ingredient category classification
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = [
  'Produce',
  'Fresh Herbs',
  'Canned & Jarred',
  'Grains & Bread',
  'Legumes & Beans',
  'Nuts & Seeds',
  'Spices & Seasonings',
  'Oils & Vinegars',
  'Dairy & Alternatives',
  'Condiments & Sauces',
  'Sweeteners',
  'Other',
] as const;

type Category = typeof CATEGORY_ORDER[number];

const CATEGORY_COLORS: Record<Category, string> = {
  'Produce': 'bg-green-600',
  'Fresh Herbs': 'bg-emerald-500',
  'Canned & Jarred': 'bg-amber-600',
  'Grains & Bread': 'bg-yellow-600',
  'Legumes & Beans': 'bg-orange-600',
  'Nuts & Seeds': 'bg-amber-700',
  'Spices & Seasonings': 'bg-red-600',
  'Oils & Vinegars': 'bg-lime-600',
  'Dairy & Alternatives': 'bg-sky-600',
  'Condiments & Sauces': 'bg-rose-600',
  'Sweeteners': 'bg-pink-500',
  'Other': 'bg-gray-500',
};

interface CategoryRule {
  category: Category;
  terms: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'Fresh Herbs',
    terms: [
      'parsley', 'cilantro', 'basil', 'mint', 'dill', 'thyme', 'rosemary',
      'oregano', 'chive', 'chives', 'sage', 'tarragon', 'fresh herb',
    ],
  },
  {
    category: 'Spices & Seasonings',
    terms: [
      'salt', 'pepper', 'cumin', 'paprika', 'cinnamon', 'ginger', 'turmeric',
      'nutmeg', 'clove', 'cayenne', 'chili powder', 'curry', 'coriander',
      'mustard', 'garlic powder', 'onion powder', 'smoked paprika',
      'ground ginger', 'ground cumin', 'ground cinnamon', 'black pepper',
      'white pepper', 'red pepper flakes', 'crushed red pepper', 'bay leaf',
      'bay leaves', 'allspice', 'cardamom', 'seasoning', 'spice',
      'dried chives', 'dried parsley', 'dried dill', 'dried oregano',
      'dried thyme', 'dried basil', 'dried rosemary', 'herbes de provence',
      'italian seasoning', 'everything bagel', 'za\'atar',
    ],
  },
  {
    category: 'Oils & Vinegars',
    terms: [
      'oil', 'vinegar', 'olive oil', 'sesame oil', 'coconut oil',
      'avocado oil', 'vegetable oil', 'canola oil', 'apple cider vinegar',
      'balsamic', 'rice vinegar', 'red wine vinegar', 'white wine vinegar',
    ],
  },
  {
    category: 'Canned & Jarred',
    terms: [
      'canned', 'can no-salt', 'can ', '15-oz', '14-oz', '28-oz',
      'tomato paste', 'tomato sauce', 'diced tomatoes', 'crushed tomatoes',
      'chopped tomatoes', 'coconut milk', 'coconut cream', 'broth',
      'vegetable broth', 'chicken broth', 'stock', 'chipotle',
      'adobo', 'artichoke hearts', 'olives',
    ],
  },
  {
    category: 'Grains & Bread',
    terms: [
      'rice', 'pasta', 'noodle', 'bread', 'tortilla', 'flour', 'cornmeal',
      'oat', 'oats', 'quinoa', 'couscous', 'barley', 'farro', 'bulgur',
      'polenta', 'pita', 'bun', 'roll', 'cracker', 'panko', 'breadcrumb',
      'corn tortilla', 'flour tortilla', 'wrap', 'flatbread',
    ],
  },
  {
    category: 'Legumes & Beans',
    terms: [
      'beans', 'lentil', 'chickpea', 'tofu', 'tempeh', 'edamame',
      'hummus', 'black bean', 'kidney bean', 'white bean', 'pinto',
      'navy bean', 'split pea',
    ],
  },
  {
    category: 'Nuts & Seeds',
    terms: [
      'cashew', 'almond', 'walnut', 'pecan', 'pistachio', 'hazelnut',
      'peanut', 'sunflower seed', 'pumpkin seed', 'pepita', 'sesame seed',
      'flaxseed', 'flax', 'chia', 'hemp seed', 'pine nut', 'tahini',
      'nut butter', 'peanut butter', 'almond butter', 'cashew butter',
    ],
  },
  {
    category: 'Dairy & Alternatives',
    terms: [
      'milk', 'yogurt', 'cheese', 'cream', 'butter', 'sour cream',
      'plant-based milk', 'almond milk', 'soy milk', 'oat milk',
      'coconut yogurt', 'nutritional yeast', 'silken tofu',
    ],
  },
  {
    category: 'Condiments & Sauces',
    terms: [
      'soy sauce', 'tamari', 'hot sauce', 'sriracha', 'ketchup',
      'mayo', 'mayonnaise', 'miso', 'worcestershire', 'bbq sauce',
      'hoisin', 'teriyaki', 'salsa', 'pesto', 'harissa', 'sambal',
      'dijon', 'liquid aminos', 'baking powder', 'baking soda',
      'vanilla', 'extract',
    ],
  },
  {
    category: 'Sweeteners',
    terms: [
      'maple syrup', 'sugar', 'honey', 'agave', 'molasses',
      'date', 'dates', 'applesauce', 'jam', 'jelly',
    ],
  },
  {
    category: 'Produce',
    terms: [
      'onion', 'garlic', 'tomato', 'potato', 'sweet potato', 'carrot',
      'celery', 'bell pepper', 'pepper', 'lettuce', 'spinach', 'kale',
      'broccoli', 'cauliflower', 'zucchini', 'squash', 'cucumber',
      'avocado', 'mushroom', 'corn', 'pea', 'green bean', 'eggplant',
      'cabbage', 'beet', 'radish', 'turnip', 'leek', 'scallion',
      'shallot', 'ginger root', 'fresh ginger', 'jalape',
      'lemon', 'lime', 'orange', 'apple', 'banana', 'berry', 'berries',
      'strawberry', 'blueberry', 'raspberry', 'mango', 'pineapple',
      'peach', 'pear', 'grape', 'melon', 'watermelon', 'fig',
      'pomegranate', 'kiwi', 'plum', 'cherry', 'cranberry',
      'arugula', 'romaine', 'bok choy', 'asparagus', 'artichoke',
      'fennel', 'swiss chard', 'collard', 'watercress',
      'currant', 'raisin', 'dried fruit',
    ],
  },
];

function classifyIngredient(item: GroceryItem): Category {
  const text = `${item.unit} ${item.name}`.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    for (const term of rule.terms) {
      if (text.includes(term)) return rule.category;
    }
  }

  return 'Other';
}

function groupByCategory(items: GroceryItem[]): Map<Category, GroceryItem[]> {
  const map = new Map<Category, GroceryItem[]>();
  for (const item of items) {
    const cat = classifyIngredient(item);
    const list = map.get(cat);
    if (list) {
      list.push(item);
    } else {
      map.set(cat, [item]);
    }
  }
  const sorted = new Map<Category, GroceryItem[]>();
  for (const cat of CATEGORY_ORDER) {
    const list = map.get(cat);
    if (list && list.length > 0) {
      sorted.set(cat, list.sort((a, b) => a.name.localeCompare(b.name)));
    }
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatWeekStart(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GroceryListPage() {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [selectedMealPlan, setSelectedMealPlan] = useState('');
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [recipeGroups, setRecipeGroups] = useState<RecipeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [isComplete, setIsComplete] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('category');

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
      setRecipeGroups([]);
      return;
    }
    const plan = cachedMealPlans.find((p: any) => p.id === mealPlanId);
    if (!plan || !plan.items) {
      setGroceryItems([]);
      setRecipeGroups([]);
      return;
    }

    const allRecipes = cacheGet<Recipe[]>('recipes') || [];
    const overrides = getServingOverrides();
    const ingredientLists: string[][] = [];
    const perRecipe: RecipeGroup[] = [];
    const seenRecipes = new Map<string, number>();

    for (const day of plan.items) {
      for (const entry of day.entries) {
        const recipe = allRecipes.find((r: Recipe) => r.id === entry.recipe?.id);
        if (!recipe) continue;

        const chosenServings = overrides[entry.itemId];
        const baseCount = parseServingCount(recipe.servings);
        const multiplier = (chosenServings && baseCount) ? chosenServings / baseCount : 1;

        const scaled = multiplier === 1
          ? recipe.ingredients
          : recipe.ingredients.map((ing: string) => scaleIngredient(ing, multiplier));

        ingredientLists.push(scaled);

        const existingIdx = seenRecipes.get(recipe.id);
        if (existingIdx !== undefined) {
          const existing = perRecipe[existingIdx];
          const combined = [...existing.items.map(i => formatGroceryItem(i)), ...scaled];
          existing.items = aggregateSingleRecipe(combined);
        } else {
          seenRecipes.set(recipe.id, perRecipe.length);
          perRecipe.push({
            recipeId: recipe.id,
            recipeTitle: recipe.title,
            items: aggregateSingleRecipe(scaled),
          });
        }
      }
    }

    setGroceryItems(aggregateIngredients(ingredientLists));
    setRecipeGroups(perRecipe.sort((a, b) => a.recipeTitle.localeCompare(b.recipeTitle)));
  }

  const handleMealPlanChange = (planId: string) => {
    setSelectedMealPlan(planId);
    setCheckedItems(new Set());
    setIsComplete(false);
    buildGroceryList(planId);
  };

  const toggleCheckItem = (itemKey: string) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(itemKey)) newChecked.delete(itemKey);
    else newChecked.add(itemKey);
    setCheckedItems(newChecked);
  };

  const checkedCount = checkedItems.size;
  const totalCount = groceryItems.length;
  const progressPercent = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  const categorizedItems = groupByCategory(groceryItems);

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

  function renderCheckableItem(item: GroceryItem) {
    return (
      <div
        key={item.key}
        onClick={() => toggleCheckItem(item.key)}
        className={`px-4 py-3 cursor-pointer flex items-center gap-3 transition ${
          checkedItems.has(item.key) ? 'bg-green-50' : 'hover:bg-gray-50'
        }`}
      >
        <input
          type="checkbox"
          checked={checkedItems.has(item.key)}
          onChange={(e) => { e.stopPropagation(); toggleCheckItem(item.key); }}
          className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0"
        />
        <p className={`flex-1 font-medium text-sm sm:text-base ${checkedItems.has(item.key) ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {formatGroceryItem(item)}
        </p>
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

        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Meal Plan</label>
            <select
              value={selectedMealPlan}
              onChange={(e) => handleMealPlanChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {mealPlans.map(plan => (
                <option key={plan.id} value={plan.id}>
                  Week of {formatWeekStart(plan.week_start_date)}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:self-end">
            <label className="block text-sm font-medium text-gray-700 mb-2 sm:sr-only">View</label>
            <div className="inline-flex rounded-lg border border-gray-300 bg-white">
              <button
                onClick={() => setViewMode('category')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded-l-lg ${
                  viewMode === 'category'
                    ? 'bg-green-600 text-white'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                By Category
              </button>
              <button
                onClick={() => setViewMode('recipe')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-l border-gray-300 rounded-r-lg ${
                  viewMode === 'recipe'
                    ? 'bg-green-600 text-white'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <List className="w-4 h-4" />
                By Recipe
              </button>
            </div>
          </div>
        </div>

        {groceryItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">No items yet. Add recipes to generate a list.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
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
            </div>

            {viewMode === 'category' ? (
              <div className="space-y-4">
                {Array.from(categorizedItems.entries()).map(([category, items]) => (
                  <div key={category} className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-gray-100">
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${CATEGORY_COLORS[category]}`} />
                      <h3 className="font-semibold text-gray-900 text-sm sm:text-base">{category}</h3>
                      <span className="text-xs text-gray-400 font-medium">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {items.map(renderCheckableItem)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {recipeGroups.map((group) => (
                  <div key={group.recipeId} className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="px-4 sm:px-5 py-3 border-b border-gray-100">
                      <h3 className="font-semibold text-gray-900 text-sm sm:text-base">{group.recipeTitle}</h3>
                      <span className="text-xs text-gray-400 font-medium">{group.items.length} {group.items.length === 1 ? 'ingredient' : 'ingredients'}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {group.items.map(renderCheckableItem)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
