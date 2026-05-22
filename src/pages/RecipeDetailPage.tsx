import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Minus, Heart } from 'lucide-react';
import { type Recipe } from '../lib/supabase';
import { parseISO8601Duration } from '../lib/utils';
import { StarRating } from '../components/StarRating';
import { RecipeComments } from '../components/RecipeComments';
import { currentWeekStart, getOfflineMealPlans } from '../lib/mealPlanWeeks';
import { cacheGet, cacheSet, enqueueRating, enqueueMealPlanOp, setServingOverride, getServingOverrides, getFavorites, setFavorite, removeFavorite } from '../lib/offlineCache';
import { markDirty, flushWrites, toggleFavoriteRemote } from '../lib/syncManager';
import { parseServingCount, scaleIngredient } from '../lib/servingScale';

export function RecipeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMealPlanModal, setShowMealPlanModal] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | ''>('');
  const [mealPlans, setMealPlans] = useState<{ id: string; week_start_date: string }[]>([]);
  const [selectedMealPlan, setSelectedMealPlan] = useState('');
  const [ratingAverage, setRatingAverage] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [chosenServings, setChosenServings] = useState<number | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);

  const baseServingCount = useMemo(() => recipe ? parseServingCount(recipe.servings) : null, [recipe]);
  const activeServings = chosenServings ?? baseServingCount;
  const servingMultiplier = (activeServings && baseServingCount) ? activeServings / baseServingCount : 1;

  const isFromMealPlan = location.state?.fromMealPlan === true;
  const mealPlanItemId = (location.state as any)?.mealPlanItemId as string | undefined;
  const backPath = isFromMealPlan ? '/meal-plans' : '/';
  const backText = isFromMealPlan ? 'Back to Meal Plan' : 'Back to Recipes';

  useEffect(() => {
    loadFromCache();
  }, [id]);

  useEffect(() => {
    if (mealPlanItemId && baseServingCount) {
      const overrides = getServingOverrides();
      const saved = overrides[mealPlanItemId];
      if (saved && saved !== baseServingCount) {
        setChosenServings(saved);
      }
    }
  }, [mealPlanItemId, baseServingCount]);

  function loadFromCache() {
    if (!id) return;

    const cached = cacheGet<Recipe[]>('recipes');
    const match = cached?.find((r) => r.id === id) ?? null;
    setRecipe(match);
    setLoading(false);

    const cachedStats = cacheGet<Record<string, { average: number; count: number }>>('rating-stats');
    if (cachedStats?.[id]) {
      setRatingAverage(cachedStats[id].average);
      setRatingCount(cachedStats[id].count);
    }

    const cachedUser = cacheGet<{ id: string }>('auth-user');
    setCurrentUserId(cachedUser?.id ?? null);

    setIsFavorited(getFavorites().has(id));

    const offlinePlans = getOfflineMealPlans();
    if (offlinePlans.length) {
      setMealPlans(offlinePlans);
      const thisWeek = currentWeekStart();
      const initial = offlinePlans.find((p) => p.week_start_date === thisWeek) ?? offlinePlans[0];
      setSelectedMealPlan(initial.id);
    }
  }

  function handleRate(rating: number) {
    setRatingMessage(null);
    if (!currentUserId) {
      navigate('/auth');
      return;
    }
    if (!id) return;

    const myCache = cacheGet<Record<string, number>>('my-ratings') || {};
    myCache[id] = rating;
    cacheSet('my-ratings', myCache);

    enqueueRating({
      user_id: currentUserId,
      recipe_id: id,
      rating,
      updated_at: new Date().toISOString(),
    });
    markDirty();

    const stats = cacheGet<Record<string, { average: number; count: number }>>('rating-stats') || {};
    const existing = stats[id] || { average: 0, count: 0 };
    const newCount = existing.count + 1;
    const newAverage = (existing.average * existing.count + rating) / newCount;
    stats[id] = { average: newAverage, count: newCount };
    cacheSet('rating-stats', stats);
    setRatingAverage(newAverage);
    setRatingCount(newCount);

    setRatingMessage('Rating saved! It will sync in the background.');
    void flushWrites();
  }

  function handleToggleFavorite() {
    if (!currentUserId) {
      navigate('/auth');
      return;
    }
    if (!id) return;
    const nowFav = !isFavorited;
    setIsFavorited(nowFav);
    if (nowFav) {
      setFavorite(id);
    } else {
      removeFavorite(id);
    }
    void toggleFavoriteRemote(id, nowFav);
  }

  function addToMealPlan() {
    if (!selectedMealPlan || selectedDayIndex === '' || !id) return;

    setAddedMessage(null);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    enqueueMealPlanOp({
      kind: 'add',
      tempId,
      mealPlanId: selectedMealPlan,
      recipeId: id,
      dayOfWeek: selectedDayIndex as number,
      createdAt: new Date().toISOString(),
    });
    markDirty();

    const cachedPlans = cacheGet<any[]>('meal-plans');
    if (cachedPlans) {
      const plan = cachedPlans.find((p: any) => p.id === selectedMealPlan);
      if (plan && plan.items) {
        const day = selectedDayIndex as number;
        const cachedRecipes = cacheGet<Recipe[]>('recipes');
        const match = cachedRecipes?.find((r) => r.id === id);
        plan.items[day].entries.push({
          itemId: tempId,
          recipe: match ?? { id, title: recipe?.title ?? '' },
        });
        cacheSet('meal-plans', cachedPlans);
      }
    }

    if (activeServings && baseServingCount && activeServings !== baseServingCount) {
      setServingOverride(tempId, activeServings);
    }

    setShowMealPlanModal(false);
    setSelectedDayIndex('');
    setAddedMessage('Added to meal plan!');
    void flushWrites();
  }

  function formatDayOption(weekStart: string, offset: number): string {
    const [y, m, d] = weekStart.split('-').map(Number);
    const date = new Date(y, m - 1, d + offset);
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][offset];
    return `${dayName}, ${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading recipe...</div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Recipe not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 py-6 sm:py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate(backPath)}
          className="flex items-center gap-2 text-teal-600 hover:text-teal-700 mb-4 sm:mb-6 font-medium text-sm sm:text-base"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          {backText}
        </button>

        <div className="bg-white rounded-lg shadow-lg p-5 sm:p-8 mb-6">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4 sm:mb-6 break-words">{recipe.title}</h1>

          <div className="mb-6 sm:mb-8 flex items-center gap-3">
            <button
              onClick={() => setShowMealPlanModal(true)}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition text-sm sm:text-base flex-1 sm:flex-none justify-center"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              Add to Meal Plan
            </button>
            <button
              onClick={handleToggleFavorite}
              className={`flex items-center gap-2 px-4 py-2.5 sm:py-3 rounded-lg font-medium transition text-sm sm:text-base border ${
                isFavorited
                  ? 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${isFavorited ? 'fill-rose-500 text-rose-500' : ''}`} />
              <span className="hidden sm:inline">{isFavorited ? 'Favorited' : 'Favorite'}</span>
            </button>
            {addedMessage && (
              <p className="text-sm text-green-600">{addedMessage}</p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-gray-200">
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-gray-600 uppercase">Prep Time</h3>
              <p className="text-base sm:text-lg font-bold text-gray-900">{parseISO8601Duration(recipe.prep_time)}</p>
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-gray-600 uppercase">Cook Time</h3>
              <p className="text-base sm:text-lg font-bold text-gray-900">{parseISO8601Duration(recipe.cook_time)}</p>
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-gray-600 uppercase">Servings</h3>
              {baseServingCount ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next = (activeServings ?? baseServingCount) - 1;
                      if (next >= 1) setChosenServings(next === baseServingCount ? null : next);
                    }}
                    disabled={(activeServings ?? baseServingCount) <= 1}
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-teal-200 bg-teal-50 text-teal-600 hover:bg-teal-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-base sm:text-lg font-bold text-gray-900 min-w-[2rem] text-center tabular-nums">
                    {activeServings ?? baseServingCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = (activeServings ?? baseServingCount) + 1;
                      setChosenServings(next === baseServingCount ? null : next);
                    }}
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-teal-200 bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-base sm:text-lg font-bold text-gray-900">{recipe.servings}</p>
              )}
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-gray-600 uppercase">Rating</h3>
              <div className="mt-1">
                <StarRating
                  value={ratingAverage}
                  count={ratingCount}
                  onRate={handleRate}
                  readOnly={false}
                  size="md"
                />
              </div>
              {!currentUserId && (
                <p className="mt-1 text-xs text-gray-500">
                  <button
                    type="button"
                    onClick={() => navigate('/auth')}
                    className="text-teal-600 hover:text-teal-700 font-medium"
                  >
                    Sign in
                  </button>{' '}
                  to rate.
                </p>
              )}
              {ratingMessage && (
                <p className="mt-1 text-xs text-green-600">{ratingMessage}</p>
              )}
            </div>
          </div>

          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-3 mb-3 sm:mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Ingredients</h2>
              {servingMultiplier !== 1 && (
                <span className="text-xs font-medium bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                  Adjusted for {activeServings} servings
                </span>
              )}
            </div>
            <ul className="space-y-2">
              {recipe.ingredients.map((ingredient, idx) => {
                const scaled = scaleIngredient(ingredient, servingMultiplier);
                return scaled ? (
                  <li key={idx} className="flex items-start gap-3 text-gray-700">
                    <span className="text-teal-600 font-bold mt-1">&#8226;</span>
                    <span>{scaled}</span>
                  </li>
                ) : null;
              })}
            </ul>
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">Instructions</h2>
            <ol className="space-y-3 sm:space-y-4">
              {recipe.instructions.map((instruction, idx) => (
                <li key={idx} className="flex gap-3 sm:gap-4">
                  <span className="flex-shrink-0 flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-teal-100 text-teal-600 font-bold text-sm sm:text-base">
                    {idx + 1}
                  </span>
                  <p className="text-sm sm:text-base text-gray-700 pt-0.5 sm:pt-1">{instruction.replace(/<[^>]*>/g, '')}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {id && <RecipeComments recipeId={id} />}
      </div>

      {showMealPlanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Add to Meal Plan</h2>
              <button
                onClick={() => {
                  setShowMealPlanModal(false);
                  setSelectedDayIndex('');
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                &times;
              </button>
            </div>

            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Meal Plan
                </label>
                <select
                  value={selectedMealPlan}
                  onChange={(e) => {
                    setSelectedMealPlan(e.target.value);
                    setSelectedDayIndex('');
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {mealPlans.map((plan) => {
                    const [y, m, d] = plan.week_start_date.split('-').map(Number);
                    const dt = new Date(y, m - 1, d);
                    return (
                      <option key={plan.id} value={plan.id}>
                        Week of {dt.toLocaleDateString()}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Day
                </label>
                <select
                  value={selectedDayIndex === '' ? '' : String(selectedDayIndex)}
                  onChange={(e) =>
                    setSelectedDayIndex(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  disabled={!selectedMealPlan}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white disabled:bg-gray-100"
                >
                  <option value="">Choose a day...</option>
                  {selectedMealPlan &&
                    (() => {
                      const plan = mealPlans.find((p) => p.id === selectedMealPlan);
                      if (!plan) return null;
                      return [0, 1, 2, 3, 4, 5, 6].map((offset) => (
                        <option key={offset} value={offset}>
                          {formatDayOption(plan.week_start_date, offset)}
                        </option>
                      ));
                    })()}
                </select>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setShowMealPlanModal(false);
                    setSelectedDayIndex('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={addToMealPlan}
                  disabled={selectedDayIndex === ''}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            </>
          </div>
        </div>
      )}
    </div>
  );
}
