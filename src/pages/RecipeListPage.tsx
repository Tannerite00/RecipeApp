import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, X, ArrowLeft, ShieldAlert } from 'lucide-react';
import { type Recipe } from '../lib/supabase';
import { parseISO8601Duration, formatRecipeType } from '../lib/utils';
import { StarRating } from '../components/StarRating';
import { cacheGet, cacheSet, loadBundledRecipes } from '../lib/offlineCache';

interface MealPlanPickState {
  pickRecipeForMealPlan: boolean;
  mealPlanId: string;
  dayOfWeek: number;
  dayName: string;
  weekStart: string;
}

const ALLERGENS = [
  { key: 'milk', label: 'Milk', terms: ['milk', 'cream', 'butter', 'cheese', 'yogurt', 'whey', 'casein', 'lactose', 'ghee'] },
  { key: 'eggs', label: 'Eggs', terms: ['egg', 'eggs', 'meringue', 'mayonnaise'] },
  { key: 'fish', label: 'Fish', terms: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'anchovy', 'anchovies', 'sardine', 'sardines', 'trout', 'halibut', 'bass', 'swordfish', 'mahi', 'mackerel', 'snapper'] },
  { key: 'crustaceans', label: 'Crustaceans', terms: ['shrimp', 'crab', 'lobster', 'crawfish', 'crayfish', 'prawn', 'prawns'] },
  { key: 'mollusks', label: 'Mollusks (clams, mussels, oysters)', terms: ['clam', 'clams', 'mussel', 'mussels', 'oyster', 'oysters', 'scallop', 'scallops', 'squid', 'calamari', 'octopus', 'snail'] },
  { key: 'peanuts', label: 'Peanuts', terms: ['peanut', 'peanuts'] },
  { key: 'tree_nuts', label: 'Tree nuts', terms: ['almond', 'almonds', 'walnut', 'walnuts', 'pecan', 'pecans', 'cashew', 'cashews', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'macadamia', 'pine nut', 'pine nuts', 'brazil nut'] },
  { key: 'soybeans', label: 'Soybeans', terms: ['soy', 'soybean', 'soybeans', 'tofu', 'tempeh', 'edamame', 'miso', 'soy sauce'] },
  { key: 'wheat', label: 'Wheat (gluten)', terms: ['wheat', 'flour', 'bread', 'breadcrumb', 'breadcrumbs', 'pasta', 'noodle', 'noodles', 'tortilla', 'pita', 'couscous', 'semolina', 'farina'] },
  { key: 'barley', label: 'Barley (gluten)', terms: ['barley'] },
  { key: 'rye', label: 'Rye (gluten)', terms: ['rye'] },
  { key: 'oats', label: 'Oats (gluten)', terms: ['oat', 'oats', 'oatmeal'] },
  { key: 'celery', label: 'Celery', terms: ['celery'] },
  { key: 'mustard', label: 'Mustard', terms: ['mustard'] },
  { key: 'sesame', label: 'Sesame', terms: ['sesame', 'tahini'] },
  { key: 'lupin', label: 'Lupin (legume, common in EU foods)', terms: ['lupin', 'lupine', 'lupini'] },
  { key: 'sulphites', label: 'Sulphites (preservatives, e.g., in wine/dried fruit)', terms: ['sulphite', 'sulfite', 'sulphites', 'sulfites', 'wine', 'dried fruit'] },
  { key: 'corn', label: 'Corn', terms: ['corn', 'cornmeal', 'cornstarch', 'corn starch', 'polenta', 'hominy', 'grits', 'maize'] },
  { key: 'garlic', label: 'Garlic', terms: ['garlic'] },
  { key: 'onion', label: 'Onion', terms: ['onion', 'onions', 'shallot', 'shallots', 'scallion', 'scallions', 'leek', 'leeks', 'chive', 'chives'] },
  { key: 'nightshades', label: 'Nightshades (tomato, potato, eggplant)', terms: ['tomato', 'tomatoes', 'potato', 'potatoes', 'eggplant', 'bell pepper', 'bell peppers', 'paprika', 'cayenne', 'jalape', 'chili pepper', 'chipotle'] },
  { key: 'citrus', label: 'Citrus', terms: ['lemon', 'lime', 'orange', 'grapefruit', 'tangerine', 'clementine', 'mandarin', 'citrus', 'zest'] },
  { key: 'chocolate', label: 'Chocolate (cocoa)', terms: ['chocolate', 'cocoa', 'cacao'] },
];

function recipeContainsAllergen(recipe: Recipe, allergenTerms: string[]): boolean {
  return recipe.ingredients.some((ingredient) => {
    const lower = ingredient.toLowerCase();
    return allergenTerms.some((term) => {
      const regex = new RegExp(`\\b${term}s?\\b`, 'i');
      return regex.test(lower);
    });
  });
}

export function RecipeListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'ingredients'>('name');
  const [loading, setLoading] = useState(true);
  const [recipeTypes, setRecipeTypes] = useState<string[]>([]);
  const [ratingStats, setRatingStats] = useState<Record<string, { average: number; count: number }>>({});
  const [showAllergenModal, setShowAllergenModal] = useState(false);
  const [selectedAllergens, setSelectedAllergens] = useState<Set<string>>(() => {
    const cached = cacheGet<string[]>('allergen-filters');
    return cached ? new Set(cached) : new Set();
  });
  const modalRef = useRef<HTMLDivElement>(null);

  const pickState = (location.state as MealPlanPickState | null)?.pickRecipeForMealPlan
    ? (location.state as MealPlanPickState)
    : null;

  useEffect(() => {
    loadFromCache();
  }, []);

  async function loadFromCache() {
    const cached = cacheGet<Recipe[]>('recipes');
    const cachedStats = cacheGet<Record<string, { average: number; count: number }>>('rating-stats');

    if (cachedStats) setRatingStats(cachedStats);

    if (cached && cached.length) {
      setRecipes(cached);
      setFilteredRecipes(cached);
      setRecipeTypes(
        Array.from(new Set(cached.map((r) => r.type).filter(Boolean))).sort()
      );
      setLoading(false);
      return;
    }

    const bundled = await loadBundledRecipes();
    if (bundled && bundled.length) {
      setRecipes(bundled as Recipe[]);
      setFilteredRecipes(bundled as Recipe[]);
      setRecipeTypes(
        Array.from(new Set((bundled as Recipe[]).map((r) => r.type).filter(Boolean))).sort()
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    let filtered = recipes;

    if (selectedAllergens.size > 0) {
      const activeTerms = ALLERGENS
        .filter((a) => selectedAllergens.has(a.key))
        .flatMap((a) => a.terms);
      filtered = filtered.filter((recipe) => !recipeContainsAllergen(recipe, activeTerms));
    }

    if (selectedType) {
      filtered = filtered.filter(recipe => recipe.type === selectedType);
    }

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      if (searchMode === 'name') {
        filtered = filtered.filter(recipe =>
          recipe.title.toLowerCase().includes(query)
        );
      } else {
        const searchTerms = query.split(',').map(term => term.trim()).filter(Boolean);
        if (searchTerms.length > 0) {
          filtered = filtered.filter(recipe =>
            searchTerms.every(term =>
              recipe.ingredients.some(ingredient =>
                ingredient.toLowerCase().includes(term)
              )
            )
          );
        }
      }
    }

    setFilteredRecipes(filtered);
  }, [searchQuery, selectedType, searchMode, recipes, selectedAllergens]);

  function toggleAllergen(key: string) {
    setSelectedAllergens((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      cacheSet('allergen-filters', Array.from(next));
      return next;
    });
  }

  function clearAllAllergens() {
    setSelectedAllergens(new Set());
    cacheSet('allergen-filters', []);
  }

  useEffect(() => {
    if (!showAllergenModal) return;
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowAllergenModal(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAllergenModal]);

  function handleRecipeClick(recipe: Recipe) {
    if (pickState) {
      navigate('/meal-plans', {
        state: {
          addRecipeToMealPlan: true,
          mealPlanId: pickState.mealPlanId,
          dayOfWeek: pickState.dayOfWeek,
          recipeId: recipe.id,
          recipeTitle: recipe.title,
        },
      });
    } else {
      navigate(`/recipe/${recipe.id}`);
    }
  }

  function formatWeekLabel(weekStart: string): string {
    const [y, m, d] = weekStart.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {pickState && (
          <div className="mb-6 bg-blue-600 text-white rounded-xl p-4 sm:p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-lg">Select a recipe to add</p>
                <p className="text-blue-100 text-sm mt-1">
                  Adding to <span className="font-semibold text-white">{pickState.dayName}</span> &mdash; Week of {formatWeekLabel(pickState.weekStart)}
                </p>
              </div>
              <button
                onClick={() => navigate('/meal-plans')}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2">Recipe Collection</h1>
          <p className="text-sm sm:text-base text-gray-600">Browse and discover delicious recipes</p>
        </div>

        <div className="mb-8 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-lg border border-gray-300 bg-white">
              <button
                onClick={() => setSearchMode('name')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  searchMode === 'name'
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                By Name
              </button>
              <button
                onClick={() => setSearchMode('ingredients')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  searchMode === 'ingredients'
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                By Ingredients
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowAllergenModal(!showAllergenModal)}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  selectedAllergens.size > 0
                    ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
                Allergens
                {selectedAllergens.size > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-red-600 text-white rounded-full">
                    {selectedAllergens.size}
                  </span>
                )}
              </button>

              {showAllergenModal && (
                <div
                  ref={modalRef}
                  className="absolute left-0 top-full mt-2 z-50 w-[340px] sm:w-[400px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in"
                  style={{ animation: 'fadeSlideIn 0.15s ease-out' }}
                >
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-600" />
                      <h3 className="font-semibold text-gray-900 text-sm">Allergen Filters</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedAllergens.size > 0 && (
                        <button
                          onClick={clearAllAllergens}
                          className="text-xs text-red-600 hover:text-red-700 font-medium"
                        >
                          Clear all
                        </button>
                      )}
                      <button
                        onClick={() => setShowAllergenModal(false)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="px-4 pt-3 pb-2 text-xs text-gray-500">
                    Check allergens to hide recipes containing them.
                  </p>
                  <div className="px-2 pb-3 max-h-[360px] overflow-y-auto">
                    {ALLERGENS.map((allergen) => (
                      <label
                        key={allergen.key}
                        className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAllergens.has(allergen.key)}
                          onChange={() => toggleAllergen(allergen.key)}
                          className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 flex-shrink-0"
                        />
                        <span className="text-sm text-gray-800">{allergen.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={searchMode === 'name' ? 'Search recipes by name...' : 'Search by ingredient... (comma separate for multiple ingredients)'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700">Filter by Type:</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            >
              <option value="">All Types</option>
              {recipeTypes.map((type) => (
                <option key={type} value={type}>
                  {formatRecipeType(type)}
                </option>
              ))}
            </select>
            {selectedType && (
              <button
                onClick={() => setSelectedType('')}
                className="flex items-center gap-1 px-3 py-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>

          {selectedAllergens.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-red-600">Excluding:</span>
              {ALLERGENS.filter((a) => selectedAllergens.has(a.key)).map((a) => (
                <span
                  key={a.key}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 border border-red-200 text-red-700 rounded-full text-xs font-medium"
                >
                  {a.label.split(' (')[0]}
                  <button
                    onClick={() => toggleAllergen(a.key)}
                    className="hover:text-red-900 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button
                onClick={clearAllAllergens}
                className="text-xs text-red-600 hover:text-red-700 font-medium underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-gray-500">Loading recipes...</div>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-gray-500">
              {searchQuery || selectedAllergens.size > 0 ? 'No recipes found matching your filters' : 'No recipes available'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredRecipes.map((recipe) => (
              <button
                key={recipe.id}
                onClick={() => handleRecipeClick(recipe)}
                className={`bg-white rounded-lg shadow hover:shadow-lg transition p-4 sm:p-6 text-left hover:scale-105 transform duration-200 ${
                  pickState ? 'ring-2 ring-transparent hover:ring-blue-400' : ''
                }`}
              >
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 line-clamp-2">{recipe.title}</h3>
                <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">{formatRecipeType(recipe.type)}</p>
                <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm text-gray-700 items-center">
                  <div>
                    <span className="font-medium">Prep:</span>
                    <p className="text-gray-600">{parseISO8601Duration(recipe.prep_time)}</p>
                  </div>
                  <div>
                    <span className="font-medium">Cook:</span>
                    <p className="text-gray-600">{parseISO8601Duration(recipe.cook_time)}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <StarRating
                    value={ratingStats[recipe.id]?.average ?? 0}
                    count={ratingStats[recipe.id]?.count ?? 0}
                    readOnly
                    size="sm"
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}  
