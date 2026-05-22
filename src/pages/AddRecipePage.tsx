import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet } from '../lib/offlineCache';
import { formatRecipeType } from '../lib/utils';
import type { Recipe } from '../lib/supabase';

export function AddRecipePage() {
  const navigate = useNavigate();

  const recipeTypes = useMemo(() => {
    const cached = cacheGet<Recipe[]>('recipes') ?? [];
    return Array.from(new Set(cached.map((r) => r.type).filter(Boolean))).sort() as string[];
  }, []);

  const [title, setTitle] = useState('');
  const [servings, setServings] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [type, setType] = useState('');
  const [ingredients, setIngredients] = useState<string[]>(['']);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateIngredient(idx: number, value: string) {
    setIngredients((prev) => prev.map((v, i) => (i === idx ? value : v)));
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, '']);
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateInstruction(idx: number, value: string) {
    setInstructions((prev) => prev.map((v, i) => (i === idx ? value : v)));
  }

  function addInstruction() {
    setInstructions((prev) => [...prev, '']);
  }

  function removeInstruction(idx: number) {
    setInstructions((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setError(null);

    if (!title.trim()) {
      setError('Please enter a recipe title.');
      return;
    }

    const cleanIngredients = ingredients.map((s) => s.trim()).filter(Boolean);
    const cleanInstructions = instructions.map((s) => s.trim()).filter(Boolean);

    if (cleanIngredients.length === 0) {
      setError('Please add at least one ingredient.');
      return;
    }
    if (cleanInstructions.length === 0) {
      setError('Please add at least one instruction step.');
      return;
    }

    const cachedUser = cacheGet<{ id: string }>('auth-user');
    if (!cachedUser?.id) {
      navigate('/auth');
      return;
    }

    setSaving(true);

    const { data, error: insertError } = await supabase
      .from('recipes')
      .insert({
        title: title.trim(),
        type: type || null,
        servings: servings.trim() || null,
        prep_time: prepTime.trim() || null,
        cook_time: cookTime.trim() || null,
        ingredients: cleanIngredients,
        instructions: cleanInstructions,
        user_id: cachedUser.id,
        is_user_recipe: true,
      })
      .select()
      .single();

    setSaving(false);

    if (insertError) {
      setError('Failed to save recipe. Please try again.');
      return;
    }

    const cached = cacheGet<Recipe[]>('recipes') ?? [];
    cacheSet('recipes', [...cached, data as Recipe]);

    navigate(`/recipe/${data.id}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 py-6 sm:py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-orange-600 hover:text-orange-700 mb-4 sm:mb-6 font-medium text-sm sm:text-base"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          Back to Recipes
        </button>

        <div className="bg-white rounded-lg shadow-lg p-5 sm:p-8 mb-6">

          {/* Title */}
          <div className="mb-4 sm:mb-6">
            <label className="block text-xs sm:text-sm font-semibold text-gray-600 uppercase mb-1">
              Recipe Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Grandma's Chicken Soup"
              className="w-full text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 placeholder-gray-300 border-b-2 border-gray-200 focus:border-orange-400 focus:outline-none pb-1 bg-transparent"
            />
          </div>

          {/* Save button area */}
          <div className="mb-6 sm:mb-8 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition text-sm sm:text-base"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              {saving ? 'Saving...' : 'Save Recipe'}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-gray-200">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-600 uppercase mb-1">
                Prep Time
              </label>
              <input
                type="text"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="e.g. 15 min"
                className="w-full text-base sm:text-lg font-bold text-gray-900 placeholder-gray-300 border-b-2 border-gray-200 focus:border-orange-400 focus:outline-none pb-0.5 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-600 uppercase mb-1">
                Cook Time
              </label>
              <input
                type="text"
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                placeholder="e.g. 30 min"
                className="w-full text-base sm:text-lg font-bold text-gray-900 placeholder-gray-300 border-b-2 border-gray-200 focus:border-orange-400 focus:outline-none pb-0.5 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-600 uppercase mb-1">
                Servings
              </label>
              <input
                type="text"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="e.g. 4"
                className="w-full text-base sm:text-lg font-bold text-gray-900 placeholder-gray-300 border-b-2 border-gray-200 focus:border-orange-400 focus:outline-none pb-0.5 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-600 uppercase mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full text-base sm:text-lg font-bold text-gray-900 border-b-2 border-gray-200 focus:border-orange-400 focus:outline-none pb-0.5 bg-transparent appearance-none cursor-pointer"
              >
                <option value="">— Select —</option>
                {recipeTypes.map((t) => (
                  <option key={t} value={t}>{formatRecipeType(t)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ingredients */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">Ingredients</h2>
            <ul className="space-y-2">
              {ingredients.map((ingredient, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="text-orange-600 font-bold mt-2.5">&#8226;</span>
                  <input
                    type="text"
                    value={ingredient}
                    onChange={(e) => updateIngredient(idx, e.target.value)}
                    placeholder={`Ingredient ${idx + 1}`}
                    className="flex-1 text-gray-700 placeholder-gray-300 border-b border-gray-200 focus:border-orange-400 focus:outline-none py-1 bg-transparent"
                  />
                  {ingredients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeIngredient(idx)}
                      className="mt-1.5 text-gray-300 hover:text-red-400 transition-colors"
                      aria-label="Remove ingredient"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={addIngredient}
              className="mt-3 flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add ingredient
            </button>
          </div>

          {/* Instructions */}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">Instructions</h2>
            <ol className="space-y-3 sm:space-y-4">
              {instructions.map((instruction, idx) => (
                <li key={idx} className="flex gap-3 sm:gap-4">
                  <span className="flex-shrink-0 flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-orange-100 text-orange-600 font-bold text-sm sm:text-base mt-1">
                    {idx + 1}
                  </span>
                  <div className="flex-1 flex items-start gap-2">
                    <textarea
                      value={instruction}
                      onChange={(e) => updateInstruction(idx, e.target.value)}
                      placeholder={`Step ${idx + 1}`}
                      rows={2}
                      className="flex-1 text-sm sm:text-base text-gray-700 placeholder-gray-300 border-b border-gray-200 focus:border-orange-400 focus:outline-none py-1 bg-transparent resize-none"
                    />
                    {instructions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInstruction(idx)}
                        className="mt-1.5 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                        aria-label="Remove step"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={addInstruction}
              className="mt-3 flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 font-medium ml-10 sm:ml-11"
            >
              <Plus className="w-4 h-4" />
              Add step
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
