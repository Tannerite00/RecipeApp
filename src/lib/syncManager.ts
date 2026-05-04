import { supabase } from './supabase';
import {
  cacheSet,
  readRatingQueue,
  writeRatingQueue,
  readMealPlanQueue,
  writeMealPlanQueue,
  readCommentQueue,
  writeCommentQueue,
} from './offlineCache';
import { plannableWeekStarts, cutoffWeekStart } from './mealPlanWeeks';

const SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes
const LAST_SYNC_KEY = 'recipehub:v1:last-sync-at';
const DIRTY_KEY = 'recipehub:v1:dirty';

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

// --- Dirty flag: set whenever a local mutation happens ---

export function markDirty(): void {
  try {
    localStorage.setItem(DIRTY_KEY, '1');
  } catch {}
}

function isDirty(): boolean {
  return (
    localStorage.getItem(DIRTY_KEY) === '1' ||
    readRatingQueue().length > 0 ||
    readMealPlanQueue().length > 0 ||
    readCommentQueue().length > 0
  );
}

function clearDirty(): void {
  try {
    localStorage.removeItem(DIRTY_KEY);
  } catch {}
}

function getLastSyncAt(): number {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY);
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

function setLastSyncAt(): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  } catch {}
}

// --- Check if we should sync now ---

function shouldSync(): boolean {
  if (!navigator.onLine) return false;
  const elapsed = Date.now() - getLastSyncAt();
  if (elapsed < SYNC_INTERVAL && !isDirty()) return false;
  return true;
}

// --- Write flushes ---

async function flushRatings(): Promise<void> {
  const queue = readRatingQueue();
  if (queue.length === 0) return;
  try {
    const { error } = await supabase
      .from('recipe_ratings')
      .upsert(queue, { onConflict: 'user_id,recipe_id' });
    if (!error) writeRatingQueue([]);
  } catch {}
}

async function flushMealPlanOps(): Promise<void> {
  const queue = readMealPlanQueue();
  if (queue.length === 0) return;
  const remaining = [...queue];

  for (let i = 0; i < remaining.length; i++) {
    const op = remaining[i];
    try {
      if (op.kind === 'add') {
        let planId = op.mealPlanId;
        if (planId.startsWith('offline-')) {
          const weekStart = planId.replace('offline-', '');
          const { data: plans } = await supabase
            .from('meal_plans')
            .select('id')
            .eq('week_start_date', weekStart)
            .limit(1);
          if (plans && plans.length) {
            planId = plans[0].id;
          } else {
            const { data: created } = await supabase
              .from('meal_plans')
              .insert({ week_start_date: weekStart })
              .select('id')
              .single();
            if (!created) continue;
            planId = created.id;
          }
        }

        // Check for existing identical item to prevent duplicates
        const { data: existing } = await supabase
          .from('meal_plan_items')
          .select('id')
          .eq('meal_plan_id', planId)
          .eq('recipe_id', op.recipeId)
          .eq('day_of_week', op.dayOfWeek);
        if (!existing || existing.length === 0) {
          await supabase.from('meal_plan_items').insert({
            meal_plan_id: planId,
            recipe_id: op.recipeId,
            day_of_week: op.dayOfWeek,
          });
        }
      } else {
        if (!op.itemId.startsWith('temp-')) {
          await supabase.from('meal_plan_items').delete().eq('id', op.itemId);
        }
      }
      remaining.splice(i, 1);
      i--;
    } catch {
      break;
    }
  }
  writeMealPlanQueue(remaining);
}

async function flushCommentOps(): Promise<void> {
  const queue = readCommentQueue();
  if (queue.length === 0) return;
  const remaining = [...queue];

  for (let i = 0; i < remaining.length; i++) {
    const op = remaining[i];
    try {
      if (op.kind === 'add') {
        await supabase.from('recipe_comments').insert({
          user_id: op.userId,
          recipe_id: op.recipeId,
          user_email: op.userEmail,
          content: op.content,
        });
      } else {
        if (!op.commentId.startsWith('temp-')) {
          await supabase.from('recipe_comments').delete().eq('id', op.commentId);
        }
      }
      remaining.splice(i, 1);
      i--;
    } catch {
      break;
    }
  }
  writeCommentQueue(remaining);
}

// --- Read pulls: refresh all caches from DB ---

async function pullRecipes(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .order('title');
    if (error) throw error;
    cacheSet('recipes', data || []);
    cacheSet(
      'meal-plan-recipes',
      (data || []).map((r: any) => ({ id: r.id, title: r.title }))
    );
  } catch {}
}

async function pullRatingStats(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('recipe_ratings')
      .select('recipe_id, rating');
    if (error) throw error;

    const acc: Record<string, { total: number; count: number }> = {};
    (data || []).forEach((r: any) => {
      if (!acc[r.recipe_id]) acc[r.recipe_id] = { total: 0, count: 0 };
      acc[r.recipe_id].total += r.rating;
      acc[r.recipe_id].count += 1;
    });

    const stats: Record<string, { average: number; count: number }> = {};
    Object.entries(acc).forEach(([id, v]) => {
      stats[id] = { average: v.count ? v.total / v.count : 0, count: v.count };
    });
    cacheSet('rating-stats', stats);
  } catch {}
}

function isValidSunday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCDay() === 0;
}

async function pullMealPlans(): Promise<void> {
  try {
    // Ensure week rows exist
    const targetWeeks = plannableWeekStarts();
    const { data: existing } = await supabase
      .from('meal_plans')
      .select('id, week_start_date');
    if (existing) {
      const have = new Set(existing.map((p: any) => p.week_start_date));
      const toCreate = targetWeeks.filter((w) => !have.has(w));
      if (toCreate.length) {
        await supabase.from('meal_plans').insert(toCreate.map((w) => ({ week_start_date: w })));
      }

      // Clean up: delete rows older than cutoff
      const cutoff = cutoffWeekStart();
      await supabase.from('meal_plans').delete().lt('week_start_date', cutoff);

      // Clean up: delete rows whose week_start_date is not a valid Sunday
      const badIds = existing
        .filter((p: any) => !isValidSunday(p.week_start_date))
        .map((p: any) => p.id);
      if (badIds.length > 0) {
        await supabase.from('meal_plans').delete().in('id', badIds);
      }

      // Clean up: deduplicate -- keep only one plan per week_start_date
      const byWeek = new Map<string, string[]>();
      for (const p of existing) {
        const ids = byWeek.get(p.week_start_date) || [];
        ids.push(p.id);
        byWeek.set(p.week_start_date, ids);
      }
      const dupIds: string[] = [];
      for (const ids of byWeek.values()) {
        if (ids.length > 1) {
          dupIds.push(...ids.slice(1));
        }
      }
      if (dupIds.length > 0) {
        await supabase.from('meal_plans').delete().in('id', dupIds);
      }
    }

    // Pull plans + items
    const { data: plans, error } = await supabase
      .from('meal_plans')
      .select('*')
      .order('week_start_date', { ascending: true });
    if (error) throw error;

    const cutoff = cutoffWeekStart();
    const seenWeeks = new Set<string>();
    const uniquePlans = (plans || [])
      .filter((p: any) => p.week_start_date >= cutoff && isValidSunday(p.week_start_date))
      .filter((p: any) => {
        if (seenWeeks.has(p.week_start_date)) return false;
        seenWeeks.add(p.week_start_date);
        return true;
      });

    const planIds = uniquePlans.map((p: any) => p.id);

    const { data: items } = await supabase
      .from('meal_plan_items')
      .select('id, day_of_week, meal_plan_id, recipe_id, recipes(*)')
      .in('meal_plan_id', planIds);

    // Deduplicate meal_plan_items: if the same recipe appears on the same day
    // multiple times, keep only the first and delete the rest from the DB.
    const dupItemIds: string[] = [];
    const grouped = uniquePlans.map((plan: any) => {
      const planItems = (items || []).filter((i: any) => i.meal_plan_id === plan.id);
      const groupedDays = Array(7)
        .fill(null)
        .map((_, day) => {
          const dayItems = planItems.filter((i: any) => i.day_of_week === day);
          const seen = new Set<string>();
          const deduped: any[] = [];
          for (const item of dayItems) {
            const key = item.recipe_id;
            if (seen.has(key)) {
              dupItemIds.push(item.id);
            } else {
              seen.add(key);
              deduped.push(item);
            }
          }
          return {
            day_of_week: day,
            entries: deduped.map((i: any) => ({ itemId: i.id, recipe: i.recipes })),
          };
        });
      return { ...plan, items: groupedDays };
    });

    if (dupItemIds.length > 0) {
      await supabase.from('meal_plan_items').delete().in('id', dupItemIds);
    }

    cacheSet('meal-plans', grouped);
    cacheSet(
      'detail-meal-plans',
      uniquePlans.map((p: any) => ({ id: p.id, week_start_date: p.week_start_date }))
    );
    cacheSet('grocery-meal-plans', uniquePlans);
  } catch {}
}

async function pullUserData(): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const uid = userData.user.id;
    cacheSet('auth-user', userData.user);

    // User ratings
    const { data: ratings } = await supabase
      .from('recipe_ratings')
      .select('id, rating, updated_at, recipe:recipes(id, title, type)')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false });
    if (ratings) cacheSet(`user-ratings:${uid}`, ratings);

    // User comments
    const { data: comments } = await supabase
      .from('recipe_comments')
      .select('id, content, created_at, recipe:recipes(id, title)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (comments) cacheSet(`user-comments:${uid}`, comments);

    // All comments for recipes user has visited (pull for each cached key)
    // Not worth enumerating all recipes; this will refresh on next page visit via sync
  } catch {}
}

async function pullComments(): Promise<void> {
  // Pull comments for all recipes we have cached
  try {
    const { data, error } = await supabase
      .from('recipe_comments')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const byRecipe: Record<string, any[]> = {};
    (data || []).forEach((c: any) => {
      if (!byRecipe[c.recipe_id]) byRecipe[c.recipe_id] = [];
      byRecipe[c.recipe_id].push(c);
    });
    Object.entries(byRecipe).forEach(([recipeId, comments]) => {
      cacheSet(`comments:${recipeId}`, comments);
    });
  } catch {}
}

async function pullFavorites(): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data, error } = await supabase
      .from('recipe_favorites')
      .select('recipe_id')
      .eq('user_id', userData.user.id);
    if (error) throw error;

    const ids = (data || []).map((f: any) => f.recipe_id);
    cacheSet('favorites', ids);
  } catch {}
}

// --- Full sync cycle ---

export async function runSync(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  if (!shouldSync()) return;

  syncing = true;
  try {
    // 1. Flush all write queues first
    await flushRatings();
    await flushMealPlanOps();
    await flushCommentOps();

    // 2. Pull fresh data from DB
    await Promise.all([
      pullRecipes(),
      pullRatingStats(),
      pullMealPlans(),
      pullUserData(),
      pullComments(),
      pullFavorites(),
    ]);

    clearDirty();
    setLastSyncAt();
  } catch {
    // Will retry next cycle
  } finally {
    syncing = false;
  }
}

// Force a sync regardless of timer (used on first load and coming back online)
export async function forceSync(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    await flushRatings();
    await flushMealPlanOps();
    await flushCommentOps();

    await Promise.all([
      pullRecipes(),
      pullRatingStats(),
      pullMealPlans(),
      pullUserData(),
      pullComments(),
      pullFavorites(),
    ]);

    clearDirty();
    setLastSyncAt();
  } catch {} finally {
    syncing = false;
  }
}

// Sync only writes (no pull), used by user-action write paths for immediate flush attempts
export async function flushWrites(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  try {
    await flushRatings();
    await flushMealPlanOps();
    await flushCommentOps();
    if (!isDirty()) clearDirty();
  } catch {}
}

// --- Favorites ---

export async function toggleFavoriteRemote(recipeId: string, isFavorited: boolean): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    if (isFavorited) {
      await supabase.from('recipe_favorites').insert({
        user_id: userData.user.id,
        recipe_id: recipeId,
      });
    } else {
      await supabase
        .from('recipe_favorites')
        .delete()
        .eq('user_id', userData.user.id)
        .eq('recipe_id', recipeId);
    }
  } catch {}
}

// --- Lifecycle ---

export function installSyncManager(): void {
  // Initial sync on app boot
  if (navigator.onLine) {
    const elapsed = Date.now() - getLastSyncAt();
    if (elapsed >= SYNC_INTERVAL || isDirty()) {
      void forceSync();
    }
  }

  // Periodic timer
  syncTimer = setInterval(() => {
    void runSync();
  }, SYNC_INTERVAL);

  // Sync when coming back online
  window.addEventListener('online', () => {
    void forceSync();
  });
}

export function teardownSyncManager(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
