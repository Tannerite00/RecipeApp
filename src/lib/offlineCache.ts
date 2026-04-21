const PREFIX = 'recipehub:v1:';
const QUEUE_KEY = `${PREFIX}rating-queue`;

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
