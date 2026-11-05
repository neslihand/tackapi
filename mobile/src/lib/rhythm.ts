// Esnek seri (master plan M10): the visitor chooses a daily or a weekly rhythm, or none at all. Everything comes from
// the passport's `days`, a set of local days, so an offline replay can never count the same day twice. Words only ever
// say what was done; a missed day is not presented as a loss.
import { t } from './i18n';
import { addDays, dayKey } from './passport';

export type Rhythm = 'daily' | 'weekly' | 'off';

/** The Monday of a day's ISO week. */
export function weekOf(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return addDays(day, -((new Date(y, m - 1, d).getDay() + 6) % 7));
}

/** Days kept in a row, ending today or yesterday. One missed day a week is a rest day and does not end the run; for
 *  now it is taken by itself (whether it should be chosen by hand is left to the experiment in the plan). */
export function dailyRun(days: readonly string[], now = new Date()) {
  const set = new Set(days);
  const today = dayKey(now);
  let day = set.has(today) ? today : addDays(today, -1);
  let count = 0;
  let restedBefore = false;
  const restWeeks = new Set<string>();
  for (;;) {
    if (set.has(day)) { count += 1; restedBefore = false; }
    else {
      if (restedBefore || restWeeks.has(weekOf(day))) break;
      restWeeks.add(weekOf(day)); restedBefore = true;
    }
    day = addDays(day, -1);
  }
  return { days: count, today: set.has(today), restUsedThisWeek: count > 0 && restWeeks.has(weekOf(today)) };
}

/** ISO weeks in a row with at least one day, ending this week or the last. */
export function weeklyRun(days: readonly string[], now = new Date()) {
  const weeks = new Set(days.map(weekOf));
  let week = weekOf(dayKey(now));
  if (!weeks.has(week)) week = addDays(week, -7);
  let count = 0;
  while (weeks.has(week)) { count += 1; week = addDays(week, -7); }
  return count;
}

export const daysThisWeek = (days: readonly string[], now = new Date()) => {
  const week = weekOf(dayKey(now));
  return new Set(days.filter(d => weekOf(d) === week)).size;
};

/** The one line on Keşfet; null when the visitor keeps no rhythm. */
export function rhythmLine(rhythm: Rhythm, days: readonly string[], now = new Date()): string | null {
  if (rhythm === 'off') return null;
  const week = daysThisWeek(days, now);
  const thisWeek = week ? t(` Bu hafta ${week} ayrı gün yeni bir şey öğrendin.`, ` This week you learned something new on ${week} separate ${week === 1 ? 'day' : 'days'}.`) : '';
  if (rhythm === 'weekly') {
    const weeks = weeklyRun(days, now);
    return weeks ? t(`${weeks} haftadır keşfediyorsun.`, `You have been exploring for ${weeks} ${weeks === 1 ? 'week' : 'weeks'}.`) + thisWeek : t('Bu hafta tek bir hikâye ritmini başlatır.', 'One story this week starts your rhythm.');
  }
  const run = dailyRun(days, now).days;
  return run ? t(`${run} günlük keşif ritmin sürüyor.`, `Your ${run}-day discovery rhythm goes on.`) + thisWeek : t('Bir hikâye oku, kendi izini bırak.', 'Read a story and leave your own trace.');
}

export type RhythmState = { count: number; unit: 'day' | 'week'; /** today (daily) or this week (weekly) already counts */ periodDone: boolean };
/** The run for Bugün and the passport; null when the visitor keeps no rhythm. */
export function rhythmState(rhythm: Rhythm, days: readonly string[], now = new Date()): RhythmState | null {
  if (rhythm === 'off') return null;
  if (rhythm === 'weekly') return { count: weeklyRun(days, now), unit: 'week', periodDone: daysThisWeek(days, now) > 0 };
  const run = dailyRun(days, now);
  return { count: run.days, unit: 'day', periodDone: run.today };
}

/** The longest daily run ever, by the same rules (rest days included). */
export function longestDailyRun(days: readonly string[]) {
  return [...new Set(days)].reduce((best, d) => { const [y, m, dd] = d.split('-').map(Number); return Math.max(best, dailyRun(days, new Date(y, m - 1, dd, 12)).days); }, 0);
}
