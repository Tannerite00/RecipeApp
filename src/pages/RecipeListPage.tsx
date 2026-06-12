import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, X, ArrowLeft, SlidersHorizontal, Heart, ChevronDown, PlusCircle, Leaf } from 'lucide-react';
import { type Recipe } from '../lib/supabase';
import { parseISO8601Duration, formatRecipeType, durationToMinutes } from '../lib/utils';
import { StarRating } from '../components/StarRating';
import { cacheGet, cacheSet, loadBundledRecipes, getFavorites, setFavorite, removeFavorite } from '../lib/offlineCache';
import { toggleFavoriteRemote } from '../lib/syncManager';

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

type SortOption = 'default' | 'alpha_asc' | 'alpha_desc' | 'prep_asc' | 'prep_desc' | 'cook_asc' | 'cook_desc' | 'rating_desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'alpha_asc', label: 'A to Z' },
  { value: 'alpha_desc', label: 'Z to A' },
  { value: 'prep_asc', label: 'Prep Time (shortest)' },
  { value: 'prep_desc', label: 'Prep Time (longest)' },
  { value: 'cook_asc', label: 'Cook Time (shortest)' },
  { value: 'cook_desc', label: 'Cook Time (longest)' },
  { value: 'rating_desc', label: 'Highest Rated' },
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

function FilterSection({ title, isOpen, onToggle, children }: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-[50vh] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-5 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
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
  const [selectedAllergens, setSelectedAllergens] = useState<Set<string>>(() => {
    const cached = cacheGet<string[]>('allergen-filters');
    return cached ? new Set(cached) : new Set();
  });
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [openSections, setOpenSections] = useState({ types: true, allergens: false, sort: false });
  const [favorites, setFavoritesState] = useState<Set<string>>(getFavorites);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const pickState = (location.state as MealPlanPickState | null)?.pickRecipeForMealPlan
    ? (location.state as MealPlanPickState)
    : null;

  const activeFilterCount =
    (selectedType ? 1 : 0) +
    selectedAllergens.size +
    (sortOption !== 'default' ? 1 : 0);

  useEffect(() => {
    loadFromCache();
  }, []);

  async function loadFromCache() {
    const cached = cacheGet<Recipe[]>('recipes');
    const cachedStats = cacheGet<Record<string, { average: number; count: number }>>('rating-stats');
    const cachedUser = cacheGet<{ id: string }>('auth-user');

    if (cachedStats) setRatingStats(cachedStats);
    if (cachedUser?.id) setCurrentUserId(cachedUser.id);

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
    let filtered = recipes.filter((r) => !r.is_user_recipe);

    if (showFavoritesOnly) {
      filtered = filtered.filter((r) => favorites.has(r.id));
    }

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

    if (sortOption !== 'default') {
      filtered = [...filtered];
      switch (sortOption) {
        case 'alpha_asc':
          filtered.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'alpha_desc':
          filtered.sort((a, b) => b.title.localeCompare(a.title));
          break;
        case 'prep_asc':
          filtered.sort((a, b) => durationToMinutes(a.prep_time) - durationToMinutes(b.prep_time));
          break;
        case 'prep_desc':
          filtered.sort((a, b) => durationToMinutes(b.prep_time) - durationToMinutes(a.prep_time));
          break;
        case 'cook_asc':
          filtered.sort((a, b) => durationToMinutes(a.cook_time) - durationToMinutes(b.cook_time));
          break;
        case 'cook_desc':
          filtered.sort((a, b) => durationToMinutes(b.cook_time) - durationToMinutes(a.cook_time));
          break;
        case 'rating_desc':
          filtered.sort((a, b) => {
            const ra = ratingStats[a.id]?.average ?? 0;
            const rb = ratingStats[b.id]?.average ?? 0;
            return rb - ra;
          });
          break;
      }
    }

    setFilteredRecipes(filtered);
  }, [searchQuery, selectedType, searchMode, recipes, selectedAllergens, sortOption, showFavoritesOnly, favorites, ratingStats]);

  function toggleAllergen(key: string) {
    setSelectedAllergens((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      cacheSet('allergen-filters', Array.from(next));
      return next;
    });
  }

  function clearAllFilters() {
    setSelectedType('');
    setSelectedAllergens(new Set());
    setSortOption('default');
    cacheSet('allergen-filters', []);
  }

  function toggleSection(section: keyof typeof openSections) {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  function handleToggleFavorite(e: React.MouseEvent, recipeId: string) {
    e.stopPropagation();
    const isFav = favorites.has(recipeId);
    if (isFav) {
      removeFavorite(recipeId);
    } else {
      setFavorite(recipeId);
    }
    setFavoritesState(getFavorites());
    if (currentUserId) {
      void toggleFavoriteRemote(recipeId, !isFav);
    }
  }

  useEffect(() => {
    if (!showFilterModal) return;
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowFilterModal(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterModal]);

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
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50">
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

        <div className="mb-6 sm:mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2">Recipe Collection</h1>
            <p className="text-sm sm:text-base text-gray-600">Browse and discover delicious recipes</p>
          </div>
          <button
            onClick={() => navigate('/add-recipe')}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg font-medium transition text-sm sm:text-base flex-shrink-0 shadow-sm"
          >
            <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Add Recipe</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        <div className="mb-8 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-lg border border-gray-300 bg-white">
              <button
                onClick={() => setSearchMode('name')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  searchMode === 'name'
                    ? 'bg-teal-500 text-white'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                By Name
              </button>
              <button
                onClick={() => setSearchMode('ingredients')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  searchMode === 'ingredients'
                    ? 'bg-teal-500 text-white'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                By Ingredients
              </button>
            </div>

            <button
              onClick={() => setShowFilterModal(true)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                activeFilterCount > 0
                  ? 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-teal-600 text-white rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                if (!currentUserId && !showFavoritesOnly) {
                  navigate('/auth');
                  return;
                }
                setShowFavoritesOnly(!showFavoritesOnly);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                showFavoritesOnly
                  ? 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Heart className={`w-4 h-4 ${showFavoritesOnly ? 'fill-rose-500' : ''}`} />
              Favorites
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={searchMode === 'name' ? 'Search recipes by name...' : 'Search by ingredient... (comma separate for multiple ingredients)'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500">Active filters:</span>
              {selectedType && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-700 rounded-full text-xs font-medium">
                  {formatRecipeType(selectedType)}
                  <button onClick={() => setSelectedType('')} className="hover:text-teal-900"><X className="w-3 h-3" /></button>
                </span>
              )}
              {ALLERGENS.filter((a) => selectedAllergens.has(a.key)).map((a) => (
                <span
                  key={a.key}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 border border-red-200 text-red-700 rounded-full text-xs font-medium"
                >
                  {a.label.split(' (')[0]}
                  <button onClick={() => toggleAllergen(a.key)} className="hover:text-red-900"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {sortOption !== 'default' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-full text-xs font-medium">
                  {SORT_OPTIONS.find((o) => o.value === sortOption)?.label}
                  <button onClick={() => setSortOption('default')} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
                </span>
              )}
              <button
                onClick={clearAllFilters}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium underline ml-1"
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
            <div className="text-center">
              <p className="text-gray-500">
                {showFavoritesOnly
                  ? 'No favorites yet. Heart some recipes to see them here!'
                  : searchQuery || activeFilterCount > 0
                    ? 'No recipes found matching your filters'
                    : 'No recipes available'}
              </p>
              {showFavoritesOnly && (
                <button
                  onClick={() => setShowFavoritesOnly(false)}
                  className="mt-3 text-sm text-teal-600 hover:text-teal-700 font-medium"
                >
                  Show all recipes
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredRecipes.map((recipe) => (
              <div
                key={recipe.id}
                onClick={() => handleRecipeClick(recipe)}
                className={`bg-white rounded-xl shadow hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden group hover:scale-[1.02] ${
                  pickState ? 'ring-2 ring-transparent hover:ring-blue-400' : ''
                }`}
              >
                {/* Thumbnail */}
                <div className="relative h-44 overflow-hidden bg-white flex-shrink-0">
                  {recipe.image_url ? (
                    <img
                      src={recipe.image_url}
                      alt={recipe.title}
                      className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-400 to-emerald-500">
                      <Leaf className="w-12 h-12 text-white/40" />
                    </div>
                  )}
                  <button
                    onClick={(e) => handleToggleFavorite(e, recipe.id)}
                    className={`absolute top-2.5 right-2.5 p-2 rounded-full backdrop-blur-sm transition-all duration-200 ${
                      favorites.has(recipe.id)
                        ? 'text-rose-500 bg-white/90 hover:bg-white'
                        : 'text-white/80 bg-black/20 hover:bg-black/30 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'
                    }`}
                    aria-label={favorites.has(recipe.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart className={`w-4 h-4 ${favorites.has(recipe.id) ? 'fill-rose-500' : ''}`} />
                  </button>
                </div>

                {/* Content */}
                <div className="p-4 sm:p-5">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 line-clamp-2">{recipe.title}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 mb-3">{formatRecipeType(recipe.type)}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-3">
                    <span><span className="font-medium text-gray-700">Prep:</span> {parseISO8601Duration(recipe.prep_time)}</span>
                    <span><span className="font-medium text-gray-700">Cook:</span> {parseISO8601Duration(recipe.cook_time)}</span>
                  </div>
                  <div className="pt-2.5 border-t border-gray-100">
                    <StarRating
                      value={ratingStats[recipe.id]?.average ?? 0}
                      count={ratingStats[recipe.id]?.count ?? 0}
                      readOnly
                      size="sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showFilterModal && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setShowFilterModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <div
              ref={modalRef}
              className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md max-h-[85vh] flex flex-col pointer-events-auto"
              style={{ animation: 'fadeSlideIn 0.15s ease-out' }}
            >
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <SlidersHorizontal className="w-5 h-5 text-teal-600" />
                  <h3 className="font-bold text-gray-900">Filters</h3>
                </div>
                <div className="flex items-center gap-3">
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearAllFilters}
                      className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    onClick={() => setShowFilterModal(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1">
                <FilterSection
                  title={`Recipe Type${selectedType ? ` (1)` : ''}`}
                  isOpen={openSections.types}
                  onToggle={() => toggleSection('types')}
                >
                  <div className="space-y-1">
                    <label
                      className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                        !selectedType ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="recipeType"
                        checked={!selectedType}
                        onChange={() => setSelectedType('')}
                        className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-sm">All Types</span>
                    </label>
                    {recipeTypes.map((type) => (
                      <label
                        key={type}
                        className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                          selectedType === type ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="recipeType"
                          checked={selectedType === type}
                          onChange={() => setSelectedType(type)}
                          className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-sm">{formatRecipeType(type)}</span>
                      </label>
                    ))}
                  </div>
                </FilterSection>

                <FilterSection
                  title={`Dietary Restrictions${selectedAllergens.size > 0 ? ` (${selectedAllergens.size})` : ''}`}
                  isOpen={openSections.allergens}
                  onToggle={() => toggleSection('allergens')}
                >
                  <p className="text-xs text-gray-500 mb-2">Check allergens to hide recipes containing them.</p>
                  <div className="space-y-0.5 max-h-[30vh] overflow-y-auto">
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
                </FilterSection>

                <FilterSection
                  title={`Sort By${sortOption !== 'default' ? ` (1)` : ''}`}
                  isOpen={openSections.sort}
                  onToggle={() => toggleSection('sort')}
                >
                  <div className="space-y-1">
                    {SORT_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                          sortOption === option.value ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="sortOption"
                          checked={sortOption === option.value}
                          onChange={() => setSortOption(option.value)}
                          className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-sm">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </FilterSection>
              </div>

              <div className="px-5 py-4 border-t border-gray-200 flex-shrink-0">
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Show Results
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
