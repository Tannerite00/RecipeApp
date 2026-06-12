import { supabase } from './supabase';
import {
  cacheGet,
  cacheSet,
  readRatingQueue,
  writeRatingQueue,
  readMealPlanQueue,
  writeMealPlanQueue,
  readCommentQueue,
  writeCommentQueue,
} from './offlineCache';
import { plannableWeekStarts, cutoffWeekStart } from './mealPlanWeeks';

// Increased from 15 min — recipes/ratings change infrequently; serve from cache longer.
const SYNC_INTERVAL = 60 * 60 * 1000; // 60 minutes
const LAST_SYNC_KEY = 'recipehub:v1:last-sync-at';
const DIRTY_KEY = 'recipehub:v1:dirty';

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

// --- Dirty flag ---

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

// --- Read pulls ---

async function pullRecipes(): Promise<void> {
  try {
    let all: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('title')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    cacheSet('recipes', all);
    cacheSet(
      'meal-plan-recipes',
      all.map((r: any) => ({ id: r.id, title: r.title }))
    );
  } catch {}
}

// Server-side aggregation: one row per recipe instead of one row per rating.
// Cuts egress by orders of magnitude as the ratings table grows.
async function pullRatingStats(): Promise<void> {
  try {
    const { data, error } = await supabase
      .rpc('get_recipe_rating_stats');
    if (error) throw error;

    const stats: Record<string, { average: number; count: number }> = {};
    (data || []).forEach((r: any) => {
      stats[r.recipe_id] = { average: Number(r.average_rating), count: Number(r.rating_count) };
    });
    cacheSet('rating-stats', stats);
  } catch {
    // Fall back to client-side aggregation if the RPC isn't available yet
    try {
      const { data } = await supabase
        .from('recipe_ratings')
        .select('recipe_id, rating');
      if (!data) return;

      const acc: Record<string, { total: number; count: number }> = {};
      data.forEach((r: any) => {
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
}

function isValidSunday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCDay() === 0;
}

async function pullMealPlans(): Promise<void> {
  try {
    const targetWeeks = plannableWeekStarts();
    const cutoff = cutoffWeekStart();

    // Single query — reused for both cleanup logic and the final pull.
    const { data: existing } = await supabase
      .from('meal_plans')
      .select('id, week_start_date')
      .gte('week_start_date', cutoff);

    if (existing) {
      const have = new Set(existing.map((p: any) => p.week_start_date));
      const toCreate = targetWeeks.filter((w) => !have.has(w));
      if (toCreate.length) {
        await supabase.from('meal_plans').insert(toCreate.map((w) => ({ week_start_date: w })));
      }

      // Remove invalid-Sunday rows
      const badIds = existing
        .filter((p: any) => !isValidSunday(p.week_start_date))
        .map((p: any) => p.id);
      if (badIds.length > 0) {
        await supabase.from('meal_plans').delete().in('id', badIds);
      }

      // Remove duplicate rows (keep first per week)
      const byWeek = new Map<string, string[]>();
      for (const p of existing) {
        const ids = byWeek.get(p.week_start_date) || [];
        ids.push(p.id);
        byWeek.set(p.week_start_date, ids);
      }
      const dupIds: string[] = [];
      for (const ids of byWeek.values()) {
        if (ids.length > 1) dupIds.push(...ids.slice(1));
      }
      if (dupIds.length > 0) {
        await supabase.from('meal_plans').delete().in('id', dupIds);
      }
    }

    // Pull valid plans within the plannable window
    const { data: plans, error } = await supabase
      .from('meal_plans')
      .select('id, week_start_date, created_at, user_id')
      .gte('week_start_date', cutoff)
      .order('week_start_date', { ascending: true });
    if (error) throw error;

    const seenWeeks = new Set<string>();
    const uniquePlans = (plans || [])
      .filter((p: any) => isValidSunday(p.week_start_date))
      .filter((p: any) => {
        if (seenWeeks.has(p.week_start_date)) return false;
        seenWeeks.add(p.week_start_date);
        return true;
      });

    const planIds = uniquePlans.map((p: any) => p.id);

    // Fetch meal plan items without embedding full recipe objects.
    // Recipe data is already in the 'recipes' cache — join client-side.
    const { data: items } = await supabase
      .from('meal_plan_items')
      .select('id, day_of_week, meal_plan_id, recipe_id')
      .in('meal_plan_id', planIds);

    // Resolve recipe details from cache (no extra DB round-trip)
    const cachedRecipes = cacheGet<any[]>('recipes') || [];
    const recipeMap = new Map(cachedRecipes.map((r: any) => [r.id, r]));

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
            if (seen.has(item.recipe_id)) {
              dupItemIds.push(item.id);
            } else {
              seen.add(item.recipe_id);
              deduped.push(item);
            }
          }
          return {
            day_of_week: day,
            entries: deduped.map((i: any) => ({
              itemId: i.id,
              recipe: recipeMap.get(i.recipe_id) ?? { id: i.recipe_id, title: '' },
            })),
          };
        });
      return { ...plan, items: groupedDays };
    });

    if (dupItemIds.length > 0) {
      await supabase.from('meal_plan_items').delete().in('id', dupItemIds);
    }

    cacheSet('meal-plans', grouped);
    cacheSet('detail-meal-plans', uniquePlans.map((p: any) => ({ id: p.id, week_start_date: p.week_start_date })));
    cacheSet('grocery-meal-plans', uniquePlans);
  } catch {}
}

async function pullUserData(): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const uid = userData.user.id;
    cacheSet('auth-user', userData.user);

    // Run all three user queries in parallel — independent of each other
    const [ratingsResult, commentsResult, userRecipesResult, favoritesResult] = await Promise.all([
      supabase
        .from('recipe_ratings')
        .select('id, rating, updated_at, recipe:recipes(id, title, type)')
        .eq('user_id', uid)
        .order('updated_at', { ascending: false }),
      supabase
        .from('recipe_comments')
        .select('id, content, created_at, recipe:recipes(id, title)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false }),
      supabase
        .from('recipes')
        .select('*')
        .eq('user_id', uid)
        .eq('is_user_recipe', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('recipe_favorites')
        .select('recipe_id')
        .eq('user_id', uid),
    ]);

    if (ratingsResult.data) cacheSet(`user-ratings:${uid}`, ratingsResult.data);
    if (commentsResult.data) cacheSet(`user-comments:${uid}`, commentsResult.data);
    if (userRecipesResult.data) cacheSet(`user-recipes:${uid}`, userRecipesResult.data);
    if (favoritesResult.data) {
      cacheSet('favorites', favoritesResult.data.map((f: any) => f.recipe_id));
    }
  } catch {}
}

// Comments are fetched on-demand when a recipe detail page is visited (see RecipeComments).
// Removed from the sync cycle — was a full table scan every 15 minutes for all users.

// --- Full sync cycle ---

export async function runSync(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  if (!shouldSync()) return;

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
    ]);

    clearDirty();
    setLastSyncAt();
  } catch {
    // Will retry next cycle
  } finally {
    syncing = false;
  }
}

// Force sync regardless of timer — used on app boot and coming back online.
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
    ]);

    clearDirty();
    setLastSyncAt();
  } catch {} finally {
    syncing = false;
  }
}

// Sync only writes — called immediately after user mutations.
export async function flushWrites(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  try {
    await flushRatings();
    await flushMealPlanOps();
    await flushCommentOps();
    if (!isDirty()) clearDirty();
  } catch {}
}

// --- Favorites (queued for batching rather than immediate per-click calls) ---

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
  if (navigator.onLine) {
    const elapsed = Date.now() - getLastSyncAt();
    if (elapsed >= SYNC_INTERVAL || isDirty()) {
      void forceSync();
    }
  }

  syncTimer = setInterval(() => {
    void runSync();
  }, SYNC_INTERVAL);

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
