import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, X, ArrowLeft, SlidersHorizontal, Heart, ChevronDown, Send, CheckCircle } from 'lucide-react';
import { type Recipe } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { parseISO8601Duration, formatRecipeType, durationToMinutes } from '../lib/utils';
import { StarRating } from '../components/StarRating';
import { cacheGet, cacheSet, getFavorites, setFavorite, removeFavorite } from '../lib/offlineCache';
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
      <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-[50vh] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-5 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function PersonalRecipesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'ingredients'>('name');
  const [loading, setLoading] = useState(true);
  const [recipeTypes, setRecipeTypes] = useState<string[]>([]);
  const [ratingStats] = useState<Record<string, { average: number; count: number }>>({});
  const [selectedAllergens, setSelectedAllergens] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [openSections, setOpenSections] = useState({ types: true, allergens: false, sort: false });
  const [favorites, setFavoritesState] = useState<Set<string>>(getFavorites);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Submit to Plantiful
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedSubmitId, setSelectedSubmitId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitModalRef = useRef<HTMLDivElement>(null);

  const pickState = (location.state as MealPlanPickState | null)?.pickRecipeForMealPlan
    ? (location.state as MealPlanPickState)
    : null;

  const activeFilterCount =
    (selectedType ? 1 : 0) +
    selectedAllergens.size +
    (sortOption !== 'default' ? 1 : 0);

  useEffect(() => {
    loadPersonalRecipes();
  }, []);

  async function loadPersonalRecipes() {
    const cachedUser = cacheGet<{ id: string }>('auth-user');
    if (!cachedUser?.id) {
      setLoading(false);
      return;
    }
    setCurrentUserId(cachedUser.id);

    const userCacheKey = `user-recipes:${cachedUser.id}`;
    const cached = cacheGet<Recipe[]>(userCacheKey);
    if (cached) {
      setRecipes(cached);
      setFilteredRecipes(cached);
      setRecipeTypes(Array.from(new Set(cached.map((r) => r.type).filter(Boolean))).sort());
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('recipes')
      .select('*')
      .eq('is_user_recipe', true)
      .eq('user_id', cachedUser.id)
      .order('created_at', { ascending: false });

    if (data && data.length) {
      const recipes = data as Recipe[];
      cacheSet(userCacheKey, recipes);
      setRecipes(recipes);
      setFilteredRecipes(recipes);
      setRecipeTypes(Array.from(new Set(recipes.map((r) => r.type).filter(Boolean))).sort());
    }
    setLoading(false);
  }

  useEffect(() => {
    let filtered = recipes;

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
        filtered = filtered.filter(recipe => recipe.title.toLowerCase().includes(query));
      } else {
        const searchTerms = query.split(',').map(term => term.trim()).filter(Boolean);
        if (searchTerms.length > 0) {
          filtered = filtered.filter(recipe =>
            searchTerms.every(term =>
              recipe.ingredients.some(ingredient => ingredient.toLowerCase().includes(term))
            )
          );
        }
      }
    }

    if (sortOption !== 'default') {
      filtered = [...filtered];
      switch (sortOption) {
        case 'alpha_asc': filtered.sort((a, b) => a.title.localeCompare(b.title)); break;
        case 'alpha_desc': filtered.sort((a, b) => b.title.localeCompare(a.title)); break;
        case 'prep_asc': filtered.sort((a, b) => durationToMinutes(a.prep_time) - durationToMinutes(b.prep_time)); break;
        case 'prep_desc': filtered.sort((a, b) => durationToMinutes(b.prep_time) - durationToMinutes(a.prep_time)); break;
        case 'cook_asc': filtered.sort((a, b) => durationToMinutes(a.cook_time) - durationToMinutes(b.cook_time)); break;
        case 'cook_desc': filtered.sort((a, b) => durationToMinutes(b.cook_time) - durationToMinutes(a.cook_time)); break;
        case 'rating_desc':
          filtered.sort((a, b) => (ratingStats[b.id]?.average ?? 0) - (ratingStats[a.id]?.average ?? 0));
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
      return next;
    });
  }

  function clearAllFilters() {
    setSelectedType('');
    setSelectedAllergens(new Set());
    setSortOption('default');
  }

  function toggleSection(section: keyof typeof openSections) {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  function handleToggleFavorite(e: React.MouseEvent, recipeId: string) {
    e.stopPropagation();
    const isFav = favorites.has(recipeId);
    if (isFav) removeFavorite(recipeId);
    else setFavorite(recipeId);
    setFavoritesState(getFavorites());
    if (currentUserId) void toggleFavoriteRemote(recipeId, !isFav);
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

  useEffect(() => {
    if (!showSubmitModal) return;
    function handleClickOutside(e: MouseEvent) {
      if (submitModalRef.current && !submitModalRef.current.contains(e.target as Node)) {
        setShowSubmitModal(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSubmitModal]);

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

  async function handleSubmitToPlantiful() {
    if (!selectedSubmitId) return;
    setSubmitting(true);
    setSubmitError(null);

    const { error } = await supabase
      .from('recipes')
      .update({ submitted_for_review: true })
      .eq('id', selectedSubmitId);

    setSubmitting(false);

    if (error) {
      setSubmitError('Submission failed. Please try again.');
      return;
    }

    const updated = (r: Recipe) => r.id === selectedSubmitId ? { ...r, submitted_for_review: true } : r;
    setRecipes(prev => prev.map(updated));
    if (currentUserId) {
      const key = `user-recipes:${currentUserId}`;
      const cached = cacheGet<Recipe[]>(key) ?? [];
      cacheSet(key, cached.map(updated));
    }
    setShowSubmitModal(false);
    setSelectedSubmitId(null);
  }

  const unsubmittedRecipes = recipes.filter(r => !r.submitted_for_review);

  if (!currentUserId && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Sign in required</h2>
          <p className="text-gray-600 text-sm mb-6">Create an account or log in to save and manage your personal recipes.</p>
          <button
            onClick={() => navigate('/auth')}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
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
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2">Personal Recipes</h1>
            <p className="text-sm sm:text-base text-gray-600">Your saved recipes, ready to share with Plantiful</p>
          </div>
          <button
            onClick={() => {
              setSelectedSubmitId(null);
              setSubmitError(null);
              setShowSubmitModal(true);
            }}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg font-medium transition text-sm sm:text-base flex-shrink-0 shadow-sm"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Submit to Plantiful</span>
            <span className="sm:hidden">Submit</span>
          </button>
        </div>

        <div className="mb-8 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-lg border border-gray-300 bg-white">
              <button
                onClick={() => setSearchMode('name')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${searchMode === 'name' ? 'bg-teal-500 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                By Name
              </button>
              <button
                onClick={() => setSearchMode('ingredients')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${searchMode === 'ingredients' ? 'bg-teal-500 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                By Ingredients
              </button>
            </div>

            <button
              onClick={() => setShowFilterModal(true)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                activeFilterCount > 0 ? 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
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
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                showFavoritesOnly ? 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
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
              placeholder={searchMode === 'name' ? 'Search recipes by name...' : 'Search by ingredient... (comma separate for multiple)'}
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
                <span key={a.key} className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 border border-red-200 text-red-700 rounded-full text-xs font-medium">
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
              <button onClick={clearAllFilters} className="text-xs text-gray-500 hover:text-gray-700 font-medium underline ml-1">Clear all</button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-gray-500">Loading your recipes...</div>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <p className="text-gray-500">
                {showFavoritesOnly
                  ? 'No favorites yet. Heart some recipes to see them here!'
                  : searchQuery || activeFilterCount > 0
                    ? 'No recipes found matching your filters'
                    : "You haven't added any personal recipes yet."}
              </p>
              {recipes.length === 0 && (
                <button
                  onClick={() => navigate('/add-recipe')}
                  className="mt-4 text-sm text-teal-600 hover:text-teal-700 font-medium"
                >
                  Add your first recipe
                </button>
              )}
              {showFavoritesOnly && (
                <button onClick={() => setShowFavoritesOnly(false)} className="mt-3 text-sm text-teal-600 hover:text-teal-700 font-medium">
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
                className={`bg-white rounded-lg shadow hover:shadow-lg transition p-4 sm:p-6 text-left hover:scale-[1.02] transform duration-200 cursor-pointer relative group ${
                  pickState ? 'ring-2 ring-transparent hover:ring-blue-400' : ''
                }`}
              >
                {recipe.submitted_for_review && (
                  <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-1 bg-teal-50 border border-teal-200 text-teal-700 rounded-full px-2 py-0.5 text-xs font-medium">
                    <CheckCircle className="w-3 h-3" />
                    Submitted
                  </div>
                )}
                <button
                  onClick={(e) => handleToggleFavorite(e, recipe.id)}
                  className={`absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 rounded-full transition-all duration-200 ${
                    favorites.has(recipe.id)
                      ? 'text-rose-500 bg-rose-50 hover:bg-rose-100'
                      : 'text-gray-300 bg-white/80 hover:text-rose-400 hover:bg-rose-50 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'
                  }`}
                  aria-label={favorites.has(recipe.id) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart className={`w-5 h-5 ${favorites.has(recipe.id) ? 'fill-rose-500' : ''}`} />
                </button>

                <h3 className={`text-lg sm:text-xl font-bold text-gray-900 mb-2 line-clamp-2 pr-8 ${recipe.submitted_for_review ? 'mt-6' : ''}`}>
                  {recipe.title}
                </h3>
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter modal */}
      {showFilterModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowFilterModal(false)} />
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
                    <button onClick={clearAllFilters} className="text-xs text-teal-600 hover:text-teal-700 font-medium">Clear all</button>
                  )}
                  <button onClick={() => setShowFilterModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
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
                    <label className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors ${!selectedType ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-50'}`}>
                      <input type="radio" name="recipeType" checked={!selectedType} onChange={() => setSelectedType('')} className="w-4 h-4 text-teal-600 focus:ring-teal-500" />
                      <span className="text-sm">All Types</span>
                    </label>
                    {recipeTypes.map((type) => (
                      <label key={type} className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors ${selectedType === type ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-50'}`}>
                        <input type="radio" name="recipeType" checked={selectedType === type} onChange={() => setSelectedType(type)} className="w-4 h-4 text-teal-600 focus:ring-teal-500" />
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
                      <label key={allergen.key} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                        <input type="checkbox" checked={selectedAllergens.has(allergen.key)} onChange={() => toggleAllergen(allergen.key)} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 flex-shrink-0" />
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
                      <label key={option.value} className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors ${sortOption === option.value ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-50'}`}>
                        <input type="radio" name="sortOption" checked={sortOption === option.value} onChange={() => setSortOption(option.value)} className="w-4 h-4 text-teal-600 focus:ring-teal-500" />
                        <span className="text-sm">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </FilterSection>
              </div>

              <div className="px-5 py-4 border-t border-gray-200 flex-shrink-0">
                <button onClick={() => setShowFilterModal(false)} className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors text-sm">
                  Show Results
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Submit to Plantiful modal */}
      {showSubmitModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowSubmitModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <div
              ref={submitModalRef}
              className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md flex flex-col pointer-events-auto"
              style={{ animation: 'fadeSlideIn 0.15s ease-out' }}
            >
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <Send className="w-5 h-5 text-teal-600" />
                  <h3 className="font-bold text-gray-900">Submit to Plantiful</h3>
                </div>
                <button onClick={() => setShowSubmitModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 py-4">
                <p className="text-sm text-gray-600 mb-4">
                  Select one of your recipes to submit for review. If approved, it will be added to the Plantiful recipe collection for everyone to enjoy.
                </p>

                {unsubmittedRecipes.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle className="w-10 h-10 text-teal-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700">All your recipes have been submitted!</p>
                    <p className="text-xs text-gray-500 mt-1">Our team will review them soon.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {unsubmittedRecipes.map((recipe) => (
                      <label
                        key={recipe.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedSubmitId === recipe.id
                            ? 'bg-teal-50 border-teal-300'
                            : 'bg-gray-50 border-gray-200 hover:border-teal-200 hover:bg-teal-50/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="submitRecipe"
                          checked={selectedSubmitId === recipe.id}
                          onChange={() => setSelectedSubmitId(recipe.id)}
                          className="w-4 h-4 text-teal-600 focus:ring-teal-500 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{recipe.title}</p>
                          {recipe.type && <p className="text-xs text-gray-500">{formatRecipeType(recipe.type)}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}
              </div>

              {unsubmittedRecipes.length > 0 && (
                <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
                  <button
                    onClick={() => setShowSubmitModal(false)}
                    className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitToPlantiful}
                    disabled={!selectedSubmitId || submitting}
                    className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {submitting ? 'Submitting...' : 'Submit for Review'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
