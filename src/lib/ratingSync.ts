import { supabase } from './supabase';
import { readRatingQueue, writeRatingQueue } from './offlineCache';

let syncing = false;

export async function flushRatingQueue(): Promise<void> {
  if (syncing) return;
  const queue = readRatingQueue();
  if (queue.length === 0) return;
  syncing = true;
  try {
    const { error } = await supabase
      .from('recipe_ratings')
      .upsert(queue, { onConflict: 'user_id,recipe_id' });
    if (!error) {
      writeRatingQueue([]);
    }
  } catch {
    // leave queue intact; will retry on next online event
  } finally {
    syncing = false;
  }
}

export function installRatingSync(): void {
  window.addEventListener('online', () => {
    void flushRatingQueue();
  });
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    void flushRatingQueue();
  }
}
