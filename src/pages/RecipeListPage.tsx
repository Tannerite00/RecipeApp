import { useEffect, useState } from 'react'; 
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, X, ArrowLeft } from 'lucide-react';
import { type Recipe } from '../lib/supabase';
import { parseISO8601Duration, formatRecipeType } from '../lib/utils';
import { StarRating } from '../components/StarRating';
import { cacheGet, loadBundledRecipes } from '../lib/offlineCache';

interface MealPlanPickState {
  pickRecipeForMealPlan: boolean;
  mealPlanId: string;
  dayOfWeek: number;
  dayName: string;
  weekStart: string;
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

    // First-ever launch with no cache -- try bundled fallback
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
  }, [searchQuery, selectedType, searchMode, recipes]);

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
          <div className="flex items-center gap-3">
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
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-gray-500">Loading recipes...</div>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-gray-500">
              {searchQuery ? 'No recipes found matching your search' : 'No recipes available'}
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
