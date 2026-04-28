const PREFIX = 'recipehub:v1:';
const QUEUE_KEY = `${PREFIX}rating-queue`;
const MEAL_PLAN_QUEUE_KEY = `${PREFIX}meal-plan-queue`;
const COMMENT_QUEUE_KEY = `${PREFIX}comment-queue`;

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled — fail silently.
  }
}

// --- Rating queue ---

export interface QueuedRating {
  user_id: string;
  recipe_id: string;
  rating: number;
  updated_at: string;
}

export function readRatingQueue(): QueuedRating[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedRating[]) : [];
  } catch {
    return [];
  }
}

export function writeRatingQueue(queue: QueuedRating[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

export function enqueueRating(entry: QueuedRating): void {
  const queue = readRatingQueue().filter((q) => q.recipe_id !== entry.recipe_id);
  queue.push(entry);
  writeRatingQueue(queue);
}

// --- Meal plan operation queue ---

export interface QueuedMealPlanAdd {
  kind: 'add';
  tempId: string;
  mealPlanId: string;
  recipeId: string;
  dayOfWeek: number;
  createdAt: string;
}

export interface QueuedMealPlanDelete {
  kind: 'delete';
  itemId: string;
  createdAt: string;
}

export type QueuedMealPlanOp = QueuedMealPlanAdd | QueuedMealPlanDelete;

export function readMealPlanQueue(): QueuedMealPlanOp[] {
  try {
    const raw = localStorage.getItem(MEAL_PLAN_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMealPlanOp[]) : [];
  } catch {
    return [];
  }
}

export function writeMealPlanQueue(queue: QueuedMealPlanOp[]): void {
  try {
    localStorage.setItem(MEAL_PLAN_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export function enqueueMealPlanOp(op: QueuedMealPlanOp): void {
  const queue = readMealPlanQueue();
  if (op.kind === 'delete') {
    const addIdx = queue.findIndex(
      (q) => q.kind === 'add' && q.tempId === op.itemId
    );
    if (addIdx !== -1) {
      queue.splice(addIdx, 1);
      writeMealPlanQueue(queue);
      return;
    }
  }
  queue.push(op);
  writeMealPlanQueue(queue);
}

// --- Comment operation queue ---

export interface QueuedCommentAdd {
  kind: 'add';
  tempId: string;
  userId: string;
  recipeId: string;
  userEmail: string;
  content: string;
  createdAt: string;
}

export interface QueuedCommentDelete {
  kind: 'delete';
  commentId: string;
  createdAt: string;
}

export type QueuedCommentOp = QueuedCommentAdd | QueuedCommentDelete;

export function readCommentQueue(): QueuedCommentOp[] {
  try {
    const raw = localStorage.getItem(COMMENT_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedCommentOp[]) : [];
  } catch {
    return [];
  }
}

export function writeCommentQueue(queue: QueuedCommentOp[]): void {
  try {
    localStorage.setItem(COMMENT_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export function enqueueCommentOp(op: QueuedCommentOp): void {
  const queue = readCommentQueue();
  if (op.kind === 'delete') {
    const addIdx = queue.findIndex(
      (q) => q.kind === 'add' && q.tempId === op.commentId
    );
    if (addIdx !== -1) {
      queue.splice(addIdx, 1);
      writeCommentQueue(queue);
      return;
    }
  }
  queue.push(op);
  writeCommentQueue(queue);
}

// --- Serving overrides (itemId -> chosen serving count) ---

export function getServingOverrides(): Record<string, number> {
  return cacheGet<Record<string, number>>('serving-overrides') || {};
}

export function setServingOverride(itemId: string, servings: number): void {
  const overrides = getServingOverrides();
  overrides[itemId] = servings;
  cacheSet('serving-overrides', overrides);
}

export function removeServingOverride(itemId: string): void {
  const overrides = getServingOverrides();
  delete overrides[itemId];
  cacheSet('serving-overrides', overrides);
}

// --- Bundled recipe fallback ---

function seedId(title: string, url: string | undefined): string {
  const input = `${title}|${url ?? ''}`;
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 24);
  return `seed-${hex}`;
}

export async function loadBundledRecipes(): Promise<any[] | null> {
  try {
    const res = await fetch('/recipes.json');
    if (!res.ok) return null;
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    const now = new Date().toISOString();
    return raw.map((r) => ({
      id: seedId(String(r.title ?? ''), r.url as string | undefined),
      title: r.title ?? '',
      type: r.type ?? '',
      cook_time: r.cook_time ?? '',
      prep_time: r.prep_time ?? '',
      servings: r.servings ?? '',
      ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
      instructions: Array.isArray(r.instructions) ? r.instructions : [],
      rating: 0,
      url: r.url ?? '',
      created_at: now,
    }));
  } catch {
    return null;
  }
}
