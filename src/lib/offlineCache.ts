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
