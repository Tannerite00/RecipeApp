import { cacheGet } from './offlineCache';

const WEEKS_AHEAD = 2;
const WEEKS_RETAINED = 8;

export function startOfWeekSunday(d: Date = new Date()): Date {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function plannableWeekStarts(now: Date = new Date()): string[] {
  const base = startOfWeekSunday(now);
  const weeks: string[] = [];

  for (let i = 0; i <= WEEKS_AHEAD; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i * 7); // ✅ UTC safe
    weeks.push(toDateString(d));
  }
  return weeks;
}

export function cutoffWeekStart(now: Date = new Date()): string {
  const base = startOfWeekSunday(now);
  base.setUTCDate(base.getUTCDate() - 7 * WEEKS_RETAINED);
  return toDateString(base);
}

export function currentWeekStart(now: Date = new Date()): string {
  return toDateString(startOfWeekSunday(now));
}

export interface CachedMealPlanRef {
  id: string;
  week_start_date: string;
}

export function getOfflineMealPlans(): CachedMealPlanRef[] {
  const cached = cacheGet<CachedMealPlanRef[]>('detail-meal-plans');
  const targetWeeks = plannableWeekStarts();
  const cutoff = cutoffWeekStart();

  const plans = cached
    ? cached.filter((p) => p.week_start_date >= cutoff)
    : [];

  const have = new Set(plans.map((p) => p.week_start_date));
  for (const w of targetWeeks) {
    if (!have.has(w)) {
      plans.push({ id: `offline-${w}`, week_start_date: w });
    }
  }

  plans.sort((a, b) => a.week_start_date.localeCompare(b.week_start_date));

  const seen = new Set<string>();
  return plans.filter((p) => {
    if (seen.has(p.week_start_date)) return false;
    seen.add(p.week_start_date);
    return true;
  });
}
