import { supabase } from './supabase';
import { readMealPlanQueue, writeMealPlanQueue } from './offlineCache';

let syncing = false;

export async function flushMealPlanQueue(): Promise<void> {
  if (syncing) return;
  const queue = readMealPlanQueue();
  if (queue.length === 0) return;
  syncing = true;

  const remaining = [...queue];

  for (let i = 0; i < remaining.length; i++) {
    const op = remaining[i];
    try {
      if (op.kind === 'add') {
        if (op.mealPlanId.startsWith('offline-')) {
          const weekStart = op.mealPlanId.replace('offline-', '');
          const { data: plans } = await supabase
            .from('meal_plans')
            .select('id')
            .eq('week_start_date', weekStart)
            .limit(1);

          if (!plans || plans.length === 0) {
            const { data: created } = await supabase
              .from('meal_plans')
              .insert({ week_start_date: weekStart })
              .select('id')
              .single();
            if (!created) continue;
            op.mealPlanId = created.id;
          } else {
            op.mealPlanId = plans[0].id;
          }
        }

        await supabase.from('meal_plan_items').insert({
          meal_plan_id: op.mealPlanId,
          recipe_id: op.recipeId,
          day_of_week: op.dayOfWeek,
        });
      } else {
        if (op.itemId.startsWith('temp-')) continue;
        await supabase
          .from('meal_plan_items')
          .delete()
          .eq('id', op.itemId);
      }
      remaining.splice(i, 1);
      i--;
    } catch {
      break;
    }
  }

  writeMealPlanQueue(remaining);
  syncing = false;
}

export function installMealPlanSync(): void {
  window.addEventListener('online', () => {
    void flushMealPlanQueue();
  });
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    void flushMealPlanQueue();
  }
}
