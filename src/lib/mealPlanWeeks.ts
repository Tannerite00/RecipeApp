import { supabase } from './supabase';

const WEEKS_AHEAD = 2;
const WEEKS_RETAINED = 8;

export function startOfWeekMonday(d: Date = new Date()): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + delta);
  return date;
}

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function plannableWeekStarts(now: Date = new Date()): string[] {
  const base = startOfWeekMonday(now);
  const weeks: string[] = [];
  for (let i = 0; i <= WEEKS_AHEAD; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i * 7);
    weeks.push(toDateString(d));
  }
  return weeks;
}

export function cutoffWeekStart(now: Date = new Date()): string {
  const base = startOfWeekMonday(now);
  base.setDate(base.getDate() - 7 * WEEKS_RETAINED);
  return toDateString(base);
}

export function currentWeekStart(now: Date = new Date()): string {
  return toDateString(startOfWeekMonday(now));
}

export async function ensureMealPlanWeeks(): Promise<void> {
  const targetWeeks = plannableWeekStarts();
  const cutoff = cutoffWeekStart();

  const { data: existing, error } = await supabase
    .from('meal_plans')
    .select('week_start_date');
  if (error) return;

  const have = new Set((existing || []).map((p: { week_start_date: string }) => p.week_start_date));
  const toCreate = targetWeeks.filter((w) => !have.has(w));
  if (toCreate.length) {
    await supabase
      .from('meal_plans')
      .insert(toCreate.map((w) => ({ week_start_date: w })));
  }

  await supabase.from('meal_plans').delete().lt('week_start_date', cutoff);
}
