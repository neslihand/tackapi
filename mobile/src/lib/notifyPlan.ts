// Bildirim kuralları (master plan §10.1), the part with no device in it: what goes out on which day. All notifications
// are local, so the rules are applied while scheduling, on the phone's own clock:
//   quiet hours 22:00-09:00; at most one notification a calendar day; on a day with more than one, what the visitor
//   already started (Hatırla, the rhythm) comes before chosen content (Günün Eşiği); three Günün Eşiği left unopened
//   slow it down to once a week, which Ayarlar says plainly, and opening one brings the daily rhythm back.
import { addDays, dayKey } from './passport';
import { dailyRun, weekOf, type Rhythm } from './rhythm';

export const QUIET_START = 22;
export const QUIET_END = 9;
export const RECALL_HOUR = 18;
export const STREAK_HOUR = 19;
export const UNOPENED_LIMIT = 3;
export const PLAN_DAYS = 7;

export const inQuietHours = (hour: number) => hour >= QUIET_START || hour < QUIET_END;
/** An hour saved before the quiet hours existed moves to the first allowed one. */
export const allowedHour = (hour: number) => inQuietHours(hour) ? QUIET_END : hour;

export type PlanInput = {
  daily: { hour: number; slowed: boolean } | null;
  streak: { keptToday: boolean } | null;
  recallDue: string | null;     // the day the next Hatırla card opens
};
export type Planned = { kind: 'recall' | 'streak' | 'daily'; day: string; offset: number; at: Date };

function atHour(day: string, hour: number) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0);
}

/** Günün Eşiği notifications that have come and gone since the last one opened, or since they were turned on. */
export function unopenedDaily(since: number, hour: number, now = new Date()) {
  if (!since) return 0;
  let count = 0;
  for (let day = dayKey(new Date(since)); day <= dayKey(now); day = addDays(day, 1)) {
    const at = atHour(day, allowedHour(hour)).getTime();
    if (at > since && at <= now.getTime()) count += 1;
  }
  return count;
}

/** At most one notification for each of the coming days, the most awaited of that day. */
export function planNotifications(input: PlanInput, now = new Date(), days = PLAN_DAYS): Planned[] {
  const today = dayKey(now);
  const streakDay = input.streak ? (input.streak.keptToday ? addDays(today, 1) : today) : null;
  const plan: Planned[] = [];
  let recallPlaced = false;
  for (let offset = 0; offset <= days; offset++) {
    const day = addDays(today, offset);
    const candidates: Planned[] = [];
    const add = (kind: Planned['kind'], hour: number) => candidates.push({ kind, day, offset, at: atHour(day, hour) });
    if (input.recallDue && !recallPlaced && day >= input.recallDue) add('recall', RECALL_HOUR);
    if (streakDay === day) add('streak', STREAK_HOUR);
    if (input.daily && (!input.daily.slowed || weekOf(day) === day)) add('daily', allowedHour(input.daily.hour));
    // what was due earlier today has gone out already, and that was today's one
    if (offset === 0 && candidates.some(c => c.at <= now)) continue;
    if (!candidates.length) continue;
    plan.push(candidates[0]);
    if (candidates[0].kind === 'recall') recallPlaced = true;
  }
  return plan;
}

export type NotifySettings = { dailyWork: boolean; dailyHour: number; streakReminder: boolean; recallReminder: boolean; notifyOpenedAt: number; rhythm: Rhythm };

export const dailySlowed = (s: Pick<NotifySettings, 'dailyWork' | 'dailyHour' | 'notifyOpenedAt'>, now = new Date()) =>
  s.dailyWork && unopenedDaily(s.notifyOpenedAt, s.dailyHour, now) >= UNOPENED_LIMIT;

/** The settings and the passport in the shape the planner reads. `nextRecall` comes from recall.ts. */
export function planInput(s: NotifySettings, days: readonly string[], nextRecall: string | null, now = new Date()): PlanInput {
  const run = dailyRun(days, now);
  return {
    daily: s.dailyWork ? { hour: s.dailyHour, slowed: dailySlowed(s, now) } : null,
    streak: s.streakReminder && s.rhythm === 'daily' && run.days > 0 ? { keptToday: run.today } : null,
    recallDue: s.recallReminder ? nextRecall : null,
  };
}
