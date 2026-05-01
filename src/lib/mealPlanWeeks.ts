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
  const cached = cacheGet<CachedMealPlanRef[]>('detail-meal-plans') || [];

  const now = new Date();
  const base = startOfWeekSunday(now);

  const allWeeks: string[] = [];

  for (let i = -WEEKS_RETAINED; i <= WEEKS_AHEAD; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i * 7);
    allWeeks.push(toDateString(d));
  }

  const validWeekSet = new Set(allWeeks);

  const normalized: CachedMealPlanRef[] = [];

  const map = new Map<string, CachedMealPlanRef>();

  for (const plan of cached) {
    if (!validWeekSet.has(plan.week_start_date)) continue;

    // ✅ keep only one per week
    if (!map.has(plan.week_start_date)) {
      map.set(plan.week_start_date, plan);
    }
  }

  for (const week of allWeeks) {
    if (!map.has(week)) {
      map.set(week, {
        id: `offline-${week}`,
        week_start_date: week,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.week_start_date.localeCompare(b.week_start_date)
  );
}
