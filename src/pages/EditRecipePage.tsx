import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet } from '../lib/offlineCache';
import { formatRecipeType } from '../lib/utils';
import type { Recipe } from '../lib/supabase';

export function EditRecipePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [servings, setServings] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [type, setType] = useState('');
  const [ingredients, setIngredients] = useState<string[]>(['']);
  const [instructions, setInstructions] = useState<string[]>(['']);

  const recipeTypes = useMemo(() => {
    const cached = cacheGet<Recipe[]>('recipes') ?? [];
    return Array.from(new Set(cached.map((r) => r.type).filter(Boolean))).sort() as string[];
  }, []);

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }

    const cachedUser = cacheGet<{ id: string }>('auth-user');
    if (!cachedUser?.id) { navigate('/auth'); return; }

    // Try cache first
    const cached = cacheGet<Recipe[]>('recipes');
    const fromCache = cached?.find((r) => r.id === id);
    if (fromCache) {
      if (fromCache.user_id !== cachedUser.id) { setForbidden(true); setLoading(false); return; }
      populate(fromCache);
      setLoading(false);
      return;
    }

    // Fallback to DB
    supabase.from('recipes').select('*').eq('id', id).maybeSingle().then(({ data, error: err }) => {
      if (err || !data) { setNotFound(true); setLoading(false); return; }
      if (data.user_id !== cachedUser.id) { setForbidden(true); setLoading(false); return; }
      populate(data as Recipe);
      setLoading(false);
    });
  }, [id, navigate]);

  function populate(r: Recipe) {
    setTitle(r.title);
    setServings(r.servings ?? '');
    setPrepTime(r.prep_time ?? '');
    setCookTime(r.cook_time ?? '');
    setType(r.type ?? '');
    setIngredients(r.ingredients?.length ? r.ingredients : ['']);
    setInstructions(r.instructions?.length ? r.instructions : ['']);
  }

  function updateIngredient(idx: number, value: string) {
    setIngredients((prev) => prev.map((v, i) => (i === idx ? value : v)));
  }
  function addIngredient() { setIngredients((prev) => [...prev, '']); }
  function removeIngredient(idx: number) { setIngredients((prev) => prev.filter((_, i) => i !== idx)); }

  function updateInstruction(idx: number, value: string) {
    setInstructions((prev) => prev.map((v, i) => (i === idx ? value : v)));
  }
  function addInstruction() { setInstructions((prev) => [...prev, '']); }
  function removeInstruction(idx: number) { setInstructions((prev) => prev.filter((_, i) => i !== idx)); }

  async function handleSave() {
    setError(null);

    if (!title.trim()) { setError('Please enter a recipe title.'); return; }

    const cleanIngredients = ingredients.map((s) => s.trim()).filter(Boolean);
    const cleanInstructions = instructions.map((s) => s.trim()).filter(Boolean);

    if (cleanIngredients.length === 0) { setError('Please add at least one ingredient.'); return; }
    if (cleanInstructions.length === 0) { setError('Please add at least one instruction step.'); return; }

    setSaving(true);

    const updates = {
      title: title.trim(),
      type: type || null,
      servings: servings.trim() || null,
      prep_time: prepTime.trim() || null,
      cook_time: cookTime.trim() || null,
      ingredients: cleanIngredients,
      instructions: cleanInstructions,
    };

    const { data, error: updateError } = await supabase
      .from('recipes')
      .update(updates)
      .eq('id', id!)
      .select()
      .single();

    setSaving(false);

    if (updateError) { setError('Failed to save changes. Please try again.'); return; }

    const updatedRecipe = data as Recipe;

    // Update global recipes cache incrementally
    const cachedRecipes = cacheGet<Recipe[]>('recipes') ?? [];
    cacheSet('recipes', cachedRecipes.map((r) => (r.id === id ? updatedRecipe : r)));

    // Update user-recipes cache incrementally
    const cachedUser = cacheGet<{ id: string }>('auth-user');
    if (cachedUser?.id) {
      const userKey = `user-recipes:${cachedUser.id}`;
      const cachedUserRecipes = cacheGet<Recipe[]>(userKey) ?? [];
      cacheSet(userKey, cachedUserRecipes.map((r) => (r.id === id ? updatedRecipe : r)));
    }

    navigate(`/recipe/${id}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Recipe not found.</p>
          <button onClick={() => navigate('/')} className="text-teal-600 font-medium hover:text-teal-700">Back to Recipes</button>
        </div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">You don't have permission to edit this recipe.</p>
          <button onClick={() => navigate(-1)} className="text-teal-600 font-medium hover:text-teal-700">Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 py-6 sm:py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-teal-600 hover:text-teal-700 mb-4 sm:mb-6 font-medium text-sm sm:text-base"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          Back
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
              className="w-full text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 placeholder-gray-300 border-b-2 border-gray-200 focus:border-teal-400 focus:outline-none pb-1 bg-transparent"
            />
          </div>

          {/* Save button */}
          <div className="mb-6 sm:mb-8 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition text-sm sm:text-base"
            >
              <Save className="w-4 h-4 sm:w-5 sm:h-5" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-gray-200">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-600 uppercase mb-1">Prep Time</label>
              <input
                type="text"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="e.g. 15 min"
                className="w-full text-base sm:text-lg font-bold text-gray-900 placeholder-gray-300 border-b-2 border-gray-200 focus:border-teal-400 focus:outline-none pb-0.5 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-600 uppercase mb-1">Cook Time</label>
              <input
                type="text"
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                placeholder="e.g. 30 min"
                className="w-full text-base sm:text-lg font-bold text-gray-900 placeholder-gray-300 border-b-2 border-gray-200 focus:border-teal-400 focus:outline-none pb-0.5 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-600 uppercase mb-1">Servings</label>
              <input
                type="text"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="e.g. 4"
                className="w-full text-base sm:text-lg font-bold text-gray-900 placeholder-gray-300 border-b-2 border-gray-200 focus:border-teal-400 focus:outline-none pb-0.5 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-600 uppercase mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full text-base sm:text-lg font-bold text-gray-900 border-b-2 border-gray-200 focus:border-teal-400 focus:outline-none pb-0.5 bg-transparent appearance-none cursor-pointer"
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
                  <span className="text-teal-600 font-bold mt-2.5">&#8226;</span>
                  <input
                    type="text"
                    value={ingredient}
                    onChange={(e) => updateIngredient(idx, e.target.value)}
                    placeholder={`Ingredient ${idx + 1}`}
                    className="flex-1 text-gray-700 placeholder-gray-300 border-b border-gray-200 focus:border-teal-400 focus:outline-none py-1 bg-transparent"
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
              className="mt-3 flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium"
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
                  <span className="flex-shrink-0 flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-teal-100 text-teal-600 font-bold text-sm sm:text-base mt-1">
                    {idx + 1}
                  </span>
                  <div className="flex-1 flex items-start gap-2">
                    <textarea
                      value={instruction}
                      onChange={(e) => updateInstruction(idx, e.target.value)}
                      placeholder={`Step ${idx + 1}`}
                      rows={2}
                      className="flex-1 text-sm sm:text-base text-gray-700 placeholder-gray-300 border-b border-gray-200 focus:border-teal-400 focus:outline-none py-1 bg-transparent resize-none"
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
              className="mt-3 flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium ml-10 sm:ml-11"
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
