// "Detay Avı": the day's close-up puzzle. Pure functions: the same date gives everyone the same work, options and
// close-up; the saved state (esik:hunt:v1, hunt-state.ts) is only read and changed here.
import type { Item } from './api';
import { dailyPicks } from './daily';
import { dayKey, emptyProgress } from './passport';

export const HUNT_KEY = 'esik:hunt:v1';
/** Puzzle #1; every local day after it adds one. */
export const HUNT_START = '2026-11-01';
/** The close-up's zoom: at the start, then after each wrong guess; the last one is the whole photo. */
export const HUNT_SCALES = [4, 2.5, 1.5, 1];
/** Four options: after three wrong guesses only the answer is left, so the puzzle ends there. */
export const HUNT_TRIES = 4;
const MAX_WRONG = HUNT_TRIES - 1;
const KEEP_DAYS = 7;

export type Focus = { x: number; y: number };
export type Hunt = { day: string; number: number; slug: string; options: string[]; focus: Focus };
export type HuntDay = { slug: string; options: string[]; focus: Focus; guesses: string[] };
export type HuntState = { version: 1; days: Record<string, HuntDay> };

// FNV-1a with a final mix (so neighbouring days differ in every bit): a small stable hash, the same on every platform
export function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const byHash = (salt: string) => (a: Item, b: Item) => hash(`${salt}:${a.slug}`) - hash(`${salt}:${b.slug}`) || a.slug.localeCompare(b.slug);
const sameName = (a: Item, b: Item) => a.name.trim().toLocaleLowerCase('tr-TR') === b.name.trim().toLocaleLowerCase('tr-TR');

export const localDays = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
export const fromKey = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };

/** The puzzle number of `date` (a local day): HUNT_START is #1. */
export function huntNumber(date: Date) {
  return localDays(date) - localDays(fromKey(HUNT_START)) + 1;
}
export const huntNumberOf = (key: string) => huntNumber(fromKey(key));

/** The day's puzzle, the same for everyone: a work with a photo, three other works with photos, a close-up spot. */
export function huntFor(items: Item[], date: Date): Hunt | null {
  // one fixed shuffle of the photo pool, walked a day at a time: no work comes back before the pool is used up
  const pool = items.filter(i => i.image?.src).sort(byHash('hunt'));
  if (pool.length < HUNT_TRIES + 1) return null;
  const number = huntNumber(date);
  const at = (n: number) => pool[((n - 1) % pool.length + pool.length) % pool.length];
  // a first-time visitor's Günün Eşiği is never the day's answer (a returning one's is personal, see dailyPicks)
  const threshold = dailyPicks(items, emptyProgress(), date, 1)[0]?.slug;
  const answer = at(number).slug === threshold ? at(number + 1) : at(number);

  const day = dayKey(date);
  const others = pool.filter(i => i.slug !== answer.slug).sort(byHash(day));
  const options: Item[] = [answer];
  // same kind first, then the same city, then any work with a photo; never two options with the same name
  for (const fits of [(i: Item) => i.kind === answer.kind, (i: Item) => i.city.slug === answer.city.slug, () => true]) {
    for (const item of others) {
      if (options.length === HUNT_TRIES) break;
      if (fits(item) && !options.some(o => o.slug === item.slug || sameName(o, item))) options.push(item);
    }
  }
  const h = hash(`focus:${day}`);
  return {
    day, number, slug: answer.slug,
    options: options.sort(byHash(`order:${day}`)).map(o => o.slug),
    focus: { x: 0.3 + (h & 0xffff) / 0xffff * 0.4, y: 0.3 + (h >>> 16) / 0xffff * 0.4 },
  };
}

/** The close-up's centre at `scale`, kept far enough from the edges that the window never leaves the photo. */
export function focusWindow(focus: Focus, scale: number): Focus {
  const half = 1 / (2 * Math.max(1, scale));
  const clamp = (v: number) => Math.min(1 - half, Math.max(half, v));
  return { x: clamp(focus.x), y: clamp(focus.y) };
}

export function outcome(day: HuntDay) {
  const solved = day.guesses.includes(day.slug);
  const wrong = day.guesses.filter(g => g !== day.slug).length;
  return { solved, wrong, over: solved || wrong >= MAX_WRONG, left: solved ? 0 : HUNT_TRIES - 1 - wrong };
}
export const scaleFor = (day: HuntDay) => (outcome(day).over ? 1 : HUNT_SCALES[outcome(day).wrong]);
/** The share card's squares: one per guess, in order. */
export const guessMarks = (day: HuntDay) => day.guesses.map(g => (g === day.slug ? 'right' as const : 'wrong' as const));

export function applyGuess(day: HuntDay, slug: string): HuntDay {
  if (outcome(day).over || day.guesses.includes(slug) || !day.options.includes(slug)) return day;
  return { ...day, guesses: [...day.guesses, slug] };
}

export const emptyHunt = (): HuntState => ({ version: 1, days: {} });

/** Saved text → state; a malformed day is dropped. */
export function parseHunt(value: string | null): HuntState {
  const state = emptyHunt();
  try {
    const days = JSON.parse(value ?? '{}')?.days ?? {};
    for (const [key, d] of Object.entries(days as Record<string, Partial<HuntDay>>)) {
      const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string');
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && typeof d?.slug === 'string' && strings(d.options) && strings(d.guesses)
        && typeof d.focus?.x === 'number' && typeof d.focus?.y === 'number')
        state.days[key] = { slug: d.slug, options: d.options!, focus: { x: d.focus.x, y: d.focus.y }, guesses: d.guesses! };
    }
  } catch { /* a broken save starts over */ }
  return state;
}

/** Today's puzzle is kept as first seen (a refreshed list never changes it); only the last few days are kept. */
export function withHunt(state: HuntState, hunt: Hunt): HuntState {
  if (state.days[hunt.day]) return state;
  const days = { ...state.days, [hunt.day]: { slug: hunt.slug, options: hunt.options, focus: hunt.focus, guesses: [] } };
  return { version: 1, days: Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-KEEP_DAYS)) };
}

export function guessIn(state: HuntState, key: string, slug: string): HuntState {
  const day = state.days[key];
  const next = day && applyGuess(day, slug);
  return !next || next === day ? state : { ...state, days: { ...state.days, [key]: next } };
}
