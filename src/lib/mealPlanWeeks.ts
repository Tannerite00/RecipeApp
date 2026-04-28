import { cacheGet } from './offlineCache';

const WEEKS_AHEAD = 2;
const WEEKS_RETAINED = 8;

export function startOfWeekSunday(d: Date = new Date()): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function plannableWeekStarts(now: Date = new Date()): string[] {
  const base = startOfWeekSunday(now);
  const weeks: string[] = [];
  for (let i = 0; i <= WEEKS_AHEAD; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i * 7);
    weeks.push(toDateString(d));
  }
  return weeks;
}

export function cutoffWeekStart(now: Date = new Date()): string {
  const base = startOfWeekSunday(now);
  base.setDate(base.getDate() - 7 * WEEKS_RETAINED);
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
