// The forgiving streak over progress.days: daily (one missed day a week is a rest day) or weekly (one active day a
// week). Weeks run Monday–Sunday in local time; every function takes the moment it is asked about.
import { dayKey } from './passport';

export type StreakMode = 'daily' | 'weekly';
export type StreakState = {
  count: number;
  unit: 'day' | 'week';
  activeToday: boolean;
  /** Today (daily) or this week (weekly) already counts. */
  periodDone: boolean;
  /** Daily mode: this week's rest day has been spent inside the streak. */
  freezeUsedThisWeek: boolean;
  /** The streak ends if nothing happens today. */
  atRisk: boolean;
};

const parse = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (key: string, n: number) => { const date = parse(key); date.setDate(date.getDate() + n); return dayKey(date); };
const weekday = (key: string) => (parse(key).getDay() + 6) % 7; // Monday 0 … Sunday 6
/** The Monday of the day's week. */
export const weekOf = (key: string) => addDays(key, -weekday(key));

export function streakState(days: string[], mode: StreakMode, now: Date): StreakState {
  const set = new Set(days);
  const today = dayKey(now);
  const activeToday = set.has(today);
  if (mode === 'weekly') {
    const weeks = new Set(days.map(weekOf));
    const thisWeek = weekOf(today);
    const periodDone = weeks.has(thisWeek);
    let week = periodDone ? thisWeek : addDays(thisWeek, -7), count = 0;
    while (weeks.has(week)) { count += 1; week = addDays(week, -7); }
    return { count, unit: 'week', activeToday, periodDone, freezeUsedThisWeek: false, atRisk: count > 0 && !periodDone && weekday(today) === 6 };
  }
  // today is still open, so the walk starts yesterday when it has nothing yet
  const earliest = days.reduce((a, d) => (!a || d < a ? d : a), '');
  const used = new Set<string>();
  let pending: string[] = []; // a missed day is a rest day only once an active day is found before it
  let day = activeToday ? today : addDays(today, -1), count = 0;
  while (earliest && day >= earliest) {
    if (set.has(day)) { count += 1; pending.forEach(w => used.add(w)); pending = []; }
    else {
      const week = weekOf(day);
      if (used.has(week) || pending.includes(week)) break;
      pending.push(week);
    }
    day = addDays(day, -1);
  }
  const freezeUsedThisWeek = used.has(weekOf(today));
  return { count, unit: 'day', activeToday, periodDone: activeToday, freezeUsedThisWeek, atRisk: count > 0 && !activeToday && freezeUsedThisWeek };
}

/** The longest daily streak ever, by the same rules (rest days included). */
export function bestStreak(days: string[]) {
  return [...new Set(days)].reduce((best, d) => Math.max(best, streakState(days, 'daily', parse(d)).count), 0);
}

/** When the evening reminder should go out (today if it is still ahead and nothing counts yet, else tomorrow), or
 *  null when the streak is not at risk then. */
export function nextReminder(days: string[], mode: StreakMode, now: Date, hour: number): { at: Date; state: StreakState } | null {
  const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0);
  const at = !days.includes(dayKey(now)) && now < tonight ? tonight : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, 0, 0);
  const state = streakState(days, mode, at);
  return state.atRisk ? { at, state } : null;
}
