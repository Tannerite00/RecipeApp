import { useEffect, useState, useRef } from 'react'; 
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2, Plus, GripVertical } from 'lucide-react';
import { type MealPlan, type Recipe } from '../lib/supabase';
import { cutoffWeekStart, currentWeekStart, plannableWeekStarts } from '../lib/mealPlanWeeks';
import { cacheGet, cacheSet, enqueueMealPlanOp } from '../lib/offlineCache';
import { markDirty, flushWrites } from '../lib/syncManager';

interface MealPlanItemEntry {
  itemId: string;
  recipe: Recipe;
}

interface MealPlanWithItems extends MealPlan {
  items: {
    day_of_week: number;
    entries: MealPlanItemEntry[];
  }[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function emptyWeekItems() {
  return Array(7).fill(null).map((_, day) => ({
    day_of_week: day,
    entries: [] as MealPlanItemEntry[],
  }));
}

function formatWeekStart(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

function ensurePlansHaveCurrentWeeks(plans: MealPlanWithItems[]): MealPlanWithItems[] {
  const cutoff = cutoffWeekStart();
  const target = plannableWeekStarts();
  const result = plans.filter((p) => p.week_start_date >= cutoff);
  const have = new Set(result.map((p) => p.week_start_date));

  for (const w of target) {
    if (!have.has(w)) {
      result.push({
        id: `offline-${w}`,
        user_id: '',
        week_start_date: w,
        created_at: new Date().toISOString(),
        items: emptyWeekItems(),
      });
    }
  }

  result.sort((a, b) => a.week_start_date.localeCompare(b.week_start_date));

  const seen = new Set<string>();
  return result.filter((p) => {
    if (seen.has(p.week_start_date)) return false;
    seen.add(p.week_start_date);
    return true;
  });
}

export function MealPlanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mealPlans, setMealPlans] = useState<MealPlanWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const dragItem = useRef<{ itemId: string; fromDay: number } | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

  useEffect(() => {
    let cached = cacheGet<MealPlanWithItems[]>('meal-plans');
    if (cached && cached.length) {
      cached = ensurePlansHaveCurrentWeeks(cached);
    } else {
      cached = ensurePlansHaveCurrentWeeks([]);
    }
    setMealPlans(cached);
    cacheSet('meal-plans', cached);
    selectCurrentWeek(cached);
    setLoading(false);
  }, []);

  // Handle returning from recipe list with a recipe to add
  useEffect(() => {
    const state = location.state as {
      addRecipeToMealPlan?: boolean;
      mealPlanId?: string;
      dayOfWeek?: number;
      recipeId?: string;
      recipeTitle?: string;
    } | null;

    if (state?.addRecipeToMealPlan && state.mealPlanId && state.recipeId != null && state.dayOfWeek != null) {
      addRecipeToDay(state.mealPlanId, state.recipeId, state.dayOfWeek, state.recipeTitle ?? '');
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  function selectCurrentWeek(plans: MealPlanWithItems[]) {
    if (plans.length === 0) return;
    const thisWeek = currentWeekStart();
    const current = plans.find(p => p.week_start_date === thisWeek);
    setSelectedPlanId((current ?? plans[0]).id);
  }

  function addRecipeToDay(mealPlanId: string, recipeId: string, dayOfWeek: number, recipeTitle: string) {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setMealPlans(prev => {
      const updated = prev.map(plan => {
        if (plan.id !== mealPlanId) return plan;
        const updatedItems = [...plan.items];
        updatedItems[dayOfWeek] = {
          ...updatedItems[dayOfWeek],
          entries: [
            ...updatedItems[dayOfWeek].entries,
            {
              itemId: tempId,
              recipe: { id: recipeId, title: recipeTitle } as Recipe
            }
          ]
        };
        return { ...plan, items: updatedItems };
      });
      cacheSet('meal-plans', updated);
      return updated;
    });

    enqueueMealPlanOp({
      kind: 'add',
      tempId,
      mealPlanId,
      recipeId,
      dayOfWeek,
      createdAt: new Date().toISOString(),
    });
    markDirty();
    void flushWrites();
  }

  function deleteMealPlanItem(itemId: string, mealPlanId: string, dayOfWeek: number) {
    setMealPlans(prev => {
      const updated = prev.map(plan => {
        if (plan.id !== mealPlanId) return plan;
        const updatedItems = [...plan.items];
        updatedItems[dayOfWeek] = {
          ...updatedItems[dayOfWeek],
          entries: updatedItems[dayOfWeek].entries.filter(e => e.itemId !== itemId)
        };
        return { ...plan, items: updatedItems };
      });
      cacheSet('meal-plans', updated);
      return updated;
    });

    enqueueMealPlanOp({ kind: 'delete', itemId, createdAt: new Date().toISOString() });
    markDirty();
    void flushWrites();
  }

  function moveRecipeToDay(itemId: string, mealPlanId: string, fromDay: number, toDay: number) {
    if (fromDay === toDay) return;

    let movedEntry: MealPlanItemEntry | undefined;

    setMealPlans(prev => {
      const updated = prev.map(plan => {
        if (plan.id !== mealPlanId) return plan;
        const updatedItems = [...plan.items];
        movedEntry = updatedItems[fromDay].entries.find(e => e.itemId === itemId);
        if (!movedEntry) return plan;

        updatedItems[fromDay] = {
          ...updatedItems[fromDay],
          entries: updatedItems[fromDay].entries.filter(e => e.itemId !== itemId)
        };
        updatedItems[toDay] = {
          ...updatedItems[toDay],
          entries: [...updatedItems[toDay].entries, movedEntry]
        };
        return { ...plan, items: updatedItems };
      });
      cacheSet('meal-plans', updated);
      return updated;
    });

    if (!movedEntry) return;

    // Queue: delete old + add new
    enqueueMealPlanOp({ kind: 'delete', itemId, createdAt: new Date().toISOString() });
    enqueueMealPlanOp({
      kind: 'add',
      tempId: itemId.startsWith('temp-') ? itemId : `temp-${Date.now()}`,
      mealPlanId,
      recipeId: movedEntry.recipe.id,
      dayOfWeek: toDay,
      createdAt: new Date().toISOString(),
    });
    markDirty();
    void flushWrites();
  }

  function handleDragStart(e: React.DragEvent, itemId: string, fromDay: number) {
    dragItem.current = { itemId, fromDay };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  }

  function handleDragEnd(e: React.DragEvent) {
    (e.currentTarget as HTMLElement).style.opacity = '1';
    dragItem.current = null;
    setDragOverDay(null);
  }

  function handleDragOver(e: React.DragEvent, dayIdx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDay !== dayIdx) setDragOverDay(dayIdx);
  }

  function handleDragLeave() {
    setDragOverDay(null);
  }

  function handleDrop(e: React.DragEvent, toDay: number) {
    e.preventDefault();
    setDragOverDay(null);
    if (!dragItem.current || !selectedPlanId) return;
    const { itemId, fromDay } = dragItem.current;
    dragItem.current = null;
    moveRecipeToDay(itemId, selectedPlanId, fromDay, toDay);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading meal plans...</div>
      </div>
    );
  }

  const selectedPlan = mealPlans.find(p => p.id === selectedPlanId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-6 sm:py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
            Meal Planning
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">
            Total meal plans: {mealPlans.length}
          </p>
        </div>

        {mealPlans.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">No meal plans available</p>
          </div>
        ) : (
          <div className="space-y-6">

            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Week
              </label>

              <select
                value={selectedPlanId || ''}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              >
                {mealPlans.map(plan => (
                  <option key={plan.id} value={plan.id}>
                    Week of {formatWeekStart(plan.week_start_date)}
                  </option>
                ))}
              </select>
            </div>

            {selectedPlan && (
              <div className="bg-white rounded-lg shadow overflow-hidden">

                <div className="bg-blue-600 px-6 py-4">
                  <h2 className="text-white font-bold text-xl">
                    Week of {formatWeekStart(selectedPlan.week_start_date)}
                  </h2>
                </div>

                <div className="divide-y">
                  {DAYS.map((day, idx) => (
                    <div
                      key={idx}
                      className={`p-4 sm:p-6 transition-colors ${
                        dragOverDay === idx ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''
                      }`}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, idx)}
                    >

                      <h3 className="font-bold mb-3">{day}</h3>

                      {selectedPlan.items[idx]?.entries.map(({ itemId, recipe }) => (
                        <div
                          key={itemId}
                          draggable
                          onDragStart={(e) => handleDragStart(e, itemId, idx)}
                          onDragEnd={handleDragEnd}
                          className="flex items-center justify-between bg-blue-50 p-3 mb-2 rounded cursor-grab active:cursor-grabbing group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                            <button
                              onClick={() => navigate(`/recipe/${recipe.id}`)}
                              className="text-blue-600 text-sm truncate"
                            >
                              {recipe.title}
                            </button>
                          </div>

                          <button
                            onClick={() => deleteMealPlanItem(itemId, selectedPlan.id, idx)}
                            className="flex-shrink-0 ml-2"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      ))}

                      <button
                        onClick={() =>
                          navigate('/', {
                            state: {
                              pickRecipeForMealPlan: true,
                              mealPlanId: selectedPlan.id,
                              dayOfWeek: idx,
                              dayName: day,
                              weekStart: selectedPlan.week_start_date,
                            },
                          })
                        }
                        className="text-sm text-blue-600 flex items-center gap-1 mt-2 hover:text-blue-700 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Add Recipe
                      </button>

                    </div>
                  ))}
                </div>

              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}

