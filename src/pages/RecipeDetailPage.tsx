import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { supabase, type Recipe } from '../lib/supabase';
import { parseISO8601Duration } from '../lib/utils';

export function RecipeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMealPlanModal, setShowMealPlanModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [mealPlans, setMealPlans] = useState<any[]>([]);
  const [selectedMealPlan, setSelectedMealPlan] = useState('');

  useEffect(() => {
    fetchRecipe();
    fetchMealPlans();
  }, [id]);

  async function fetchRecipe() {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      setRecipe(data);
    } catch (err) {
      console.error('Error fetching recipe:', err);
    } finally {
      setLoading(false);
    }
  }

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
      }
    } catch (err) {
      console.error('Error fetching meal plans:', err);
    }
  }

  async function addToMealPlan() {
    if (!selectedMealPlan || !selectedDate || !id) return;

    try {
      const dayOfWeek = new Date(selectedDate).getDay();
      const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      const { error } = await supabase
        .from('meal_plan_items')
        .insert({
          meal_plan_id: selectedMealPlan,
          recipe_id: id,
          day_of_week: adjustedDayOfWeek
        });

      if (error) throw error;
      setShowMealPlanModal(false);
      setSelectedDate('');
    } catch (err) {
      console.error('Error adding to meal plan:', err);
    }
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-orange-600 hover:text-orange-700 mb-6 font-medium"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Recipes
        </button>

        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h1 className="text-4xl font-bold text-gray-900 mb-6">{recipe.title}</h1>

          <div className="mb-8">
            <button
              onClick={() => setShowMealPlanModal(true)}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-medium transition"
            >
              <Plus className="w-5 h-5" />
              Add to Meal Plan
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-gray-200">
            <div>
              <h3 className="text-sm font-semibold text-gray-600 uppercase">Prep Time</h3>
              <p className="text-lg font-bold text-gray-900">{parseISO8601Duration(recipe.prep_time)}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-600 uppercase">Cook Time</h3>
              <p className="text-lg font-bold text-gray-900">{parseISO8601Duration(recipe.cook_time)}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-600 uppercase">Servings</h3>
              <p className="text-lg font-bold text-gray-900">{recipe.servings}</p>
            </div>
            {recipe.rating && (
              <div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase">Rating</h3>
                <p className="text-lg font-bold text-gray-900">★ {recipe.rating}</p>
              </div>
            )}
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Ingredients</h2>
            <ul className="space-y-2">
              {recipe.ingredients.map((ingredient, idx) => {
                const cleaned = ingredient.trim().replace(/<[^>]*>/g, '');
                return cleaned ? (
                  <li key={idx} className="flex items-start gap-3 text-gray-700">
                    <span className="text-orange-600 font-bold mt-1">•</span>
                    <span>{cleaned}</span>
                  </li>
                ) : null;
              })}
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Instructions</h2>
            <ol className="space-y-4">
              {recipe.instructions.map((instruction, idx) => (
                <li key={idx} className="flex gap-4">
                  <span className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-orange-100 text-orange-600 font-bold">
                    {idx + 1}
                  </span>
                  <p className="text-gray-700 pt-1">{instruction.replace(/<[^>]*>/g, '')}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {showMealPlanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Add to Meal Plan</h2>
              <button
                onClick={() => {
                  setShowMealPlanModal(false);
                  setSelectedDate('');
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {mealPlans.length === 0 ? (
              <div>
                <p className="text-gray-600 mb-6">
                  You need to create a meal plan first. Go to the Meal Plan page to get started.
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setShowMealPlanModal(false);
                      setSelectedDate('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      navigate('/meal-plans');
                      setShowMealPlanModal(false);
                      setSelectedDate('');
                    }}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
                  >
                    Go to Meal Plans
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Meal Plan
                  </label>
                  <select
                    value={selectedMealPlan}
                    onChange={(e) => setSelectedMealPlan(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {mealPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        Week of {new Date(plan.week_start_date).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Day
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setShowMealPlanModal(false);
                      setSelectedDate('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addToMealPlan}
                    disabled={!selectedDate}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
