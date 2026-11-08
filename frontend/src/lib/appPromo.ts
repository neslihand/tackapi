// When the site offers the mobile app (components/AppPromo.tsx): only to a visitor who has shown interest (works stamped
// or kept, a quiz, a game) and come back on another day, at a pause (just after stamping a work, or on the passport),
// and rarely: once a day at most, a week apart, three times in all; "not now" waits two weeks, "don't show again" and
// any step towards the app end it. Kept in this browser only and never sent.
import type { Progress } from './progress.ts';

export type PromoState = { days: string[]; shown: string[]; snoozedUntil?: string; off?: boolean };
export const PROMO_KEY = 'esik:app-promo:v1';
export const PROMO_RULES = { days: 2, interest: 3, shows: 3, gapDays: 7, snoozeDays: 14, keepDays: 30 };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The visitor's local date, YYYY-MM-DD. */
export const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayNumber = (day: string) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const addDays = (day: string, n: number) => new Date((dayNumber(day) + n) * 86400000).toISOString().slice(0, 10);

export function parsePromo(value: string | null): PromoState {
  try {
    const data = JSON.parse(value ?? '{}') as Partial<PromoState>;
    const days = (list: unknown) => Array.isArray(list) ? [...new Set(list.filter((d): d is string => typeof d === 'string' && DAY.test(d)))].sort() : [];
    return { days: days(data.days), shown: days(data.shown), ...(typeof data.snoozedUntil === 'string' && DAY.test(data.snoozedUntil) ? { snoozedUntil: data.snoozedUntil } : {}), ...(data.off === true ? { off: true } : {}) };
  } catch { return { days: [], shown: [] }; }
}

/** Interest: works stamped and kept, quizzes finished and works played, counted together. */
export function interest(progress: Progress) {
  const played = new Set([...Object.keys(progress.games.puzzle), ...Object.keys(progress.games.detective)]);
  return Object.keys(progress.discovered).length + progress.favorites.length + Math.min(progress.quiz.completed, 3) + played.size;
}

/** Today counted as a day the site was opened (the last 30 days are kept). */
export function visit(state: PromoState, today: string): PromoState {
  if (state.days.includes(today)) return state;
  const from = addDays(today, -PROMO_RULES.keepDays);
  return { ...state, days: [...state.days.filter(d => d > from), today].sort() };
}

/** Whether the card may be offered today. */
export function eligible(state: PromoState, score: number, today: string) {
  if (state.off || state.days.length < PROMO_RULES.days || score < PROMO_RULES.interest || state.shown.length >= PROMO_RULES.shows) return false;
  if (state.snoozedUntil && today < state.snoozedUntil) return false;
  const last = state.shown.at(-1);
  return !last || dayNumber(today) - dayNumber(last) >= PROMO_RULES.gapDays;
}

export const markShown = (state: PromoState, today: string): PromoState => state.shown.includes(today) ? state : { ...state, shown: [...state.shown, today] };
export const snooze = (state: PromoState, today: string): PromoState => ({ ...state, snoozedUntil: addDays(today, PROMO_RULES.snoozeDays) });
export const turnOff = (state: PromoState): PromoState => ({ ...state, off: true });
