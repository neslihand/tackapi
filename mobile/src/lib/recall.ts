// "Hatırla": spaced-repetition cards for discovered works and opened glossary terms (Leitner boxes 1-3-7-21 days).
// Pure functions; the saved state (esik:recall:v1, recall-state.ts) keeps only ids, boxes and days, never text.
import type { Item, QuizQuestion } from './api';
import { fromKey, hash, localDays } from './hunt';
import { dayKey, type Progress } from './passport';
import { questionsFor, type Random } from './quiz';
import type { GlossaryTerm } from './reading';

export const RECALL_KEY = 'esik:recall:v1';
/** Days until the next review, for boxes 1..4; a card stays in the last box once it gets there. */
export const BOXES = [1, 3, 7, 21];
export const SESSION_MAX = 5;
export const FIRST_SESSION = 3;
const LAST_BOX = BOXES.length;

/** work:<slug>:<city|architect|century|period> or term:<slug> */
export type CardId = string;
export type Box = 1 | 2 | 3 | 4;
export type CardState = { box: Box; due: string };
export type RecallState = { version: 1; cards: Record<CardId, CardState>; terms: Record<string, string>; sessions: number };
/** A card that can be asked: `first` is the day the work was discovered or the term opened. */
export type Candidate = { id: CardId; kind: 'work' | 'term'; slug: string; first: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const addDays = (key: string, n: number) => { const d = fromKey(key); return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
/** Whole local days from `now` until `key` (negative when past). */
export const daysUntil = (key: string, now: Date) => localDays(fromKey(key)) - localDays(now);
// discovery times are ISO instants; a bare day is taken as it is
const dayOf = (when: string) => (DAY.test(when) ? when : dayKey(new Date(when)));

export function parseCardId(id: CardId): { kind: 'work'; slug: string; field: string } | { kind: 'term'; slug: string } | null {
  const work = id.match(/^work:(.+):(city|architect|century|period)$/);
  if (work) return { kind: 'work', slug: work[1], field: work[2] };
  const term = id.match(/^term:(.+)$/);
  return term ? { kind: 'term', slug: term[1] } : null;
}

export const emptyRecall = (): RecallState => ({ version: 1, cards: {}, terms: {}, sessions: 0 });

/** Saved text → state; a malformed card or term is dropped. */
export function parseRecall(value: string | null): RecallState {
  const state = emptyRecall();
  try {
    const data = JSON.parse(value ?? '{}') ?? {};
    for (const [id, c] of Object.entries((data.cards ?? {}) as Record<string, Partial<CardState>>))
      if (parseCardId(id) && typeof c?.box === 'number' && Number.isInteger(c.box) && c.box >= 1 && c.box <= LAST_BOX && typeof c.due === 'string' && DAY.test(c.due))
        state.cards[id] = { box: c.box as Box, due: c.due };
    for (const [slug, day] of Object.entries((data.terms ?? {}) as Record<string, unknown>))
      if (typeof day === 'string' && DAY.test(day)) state.terms[slug] = day;
    if (Number.isInteger(data.sessions) && data.sessions > 0) state.sessions = data.sessions;
  } catch { /* a broken save starts over */ }
  return state;
}

/** An opened term becomes a card; the first opening day is kept. */
export function withTerm(state: RecallState, slug: string, now: Date): RecallState {
  return state.terms[slug] ? state : { ...state, terms: { ...state.terms, [slug]: dayKey(now) } };
}

/** One card per question quiz.ts can ask about a discovered work; works no longer in the list are skipped. */
export function workCards(progress: Progress, items: readonly Item[]): Candidate[] {
  const bySlug = new Map(items.map(i => [i.slug, i]));
  const out: Candidate[] = [];
  for (const [slug, when] of Object.entries(progress.discovered)) {
    const item = bySlug.get(slug);
    if (!item) continue;
    // whether a question exists does not depend on the shuffle
    for (const q of questionsFor(item, items, () => 0)) out.push({ id: `work:${slug}:${q.id.split(':')[1]}`, kind: 'work', slug, first: dayOf(when) });
  }
  return out;
}

/** Opened terms still in the glossary; without the glossary (offline, never loaded) there are none. */
export function termCards(state: RecallState, glossary: readonly GlossaryTerm[] | null): Candidate[] {
  if (!glossary) return [];
  const known = new Set(glossary.map(g => g.slug));
  return Object.entries(state.terms).filter(([slug]) => known.has(slug)).map(([slug, day]) => ({ id: `term:${slug}`, kind: 'term', slug, first: day }));
}

/** A new card is first asked the day after its discovery; then on its saved day. */
export const dueDay = (state: RecallState, card: Candidate) => state.cards[card.id]?.due ?? addDays(card.first, 1);

/** The cards whose day has come: the longest-waiting first, then a fixed order for the day. */
export function dueCards(state: RecallState, candidates: readonly Candidate[], now: Date): Candidate[] {
  const today = dayKey(now);
  return candidates.filter(c => daysUntil(dueDay(state, c), now) <= 0)
    .sort((a, b) => dueDay(state, a).localeCompare(dueDay(state, b)) || hash(`${today}:${a.id}`) - hash(`${today}:${b.id}`) || a.id.localeCompare(b.id));
}

/** The soonest day any card comes back, or null with no cards. */
export function nextDue(state: RecallState, candidates: readonly Candidate[]): string | null {
  return candidates.map(c => dueDay(state, c)).sort()[0] ?? null;
}

export const sessionSize = (state: RecallState) => (state.sessions === 0 ? FIRST_SESSION : SESSION_MAX);

/** At most 3 cards the first time, 5 after; different works (and terms) first, a second card of one only to fill up. */
export function pickSession(state: RecallState, due: readonly Candidate[]): Candidate[] {
  const size = sessionSize(state);
  const picked: Candidate[] = [];
  const covered = new Set<string>();
  for (const c of due) if (picked.length < size && !covered.has(`${c.kind}:${c.slug}`)) { picked.push(c); covered.add(`${c.kind}:${c.slug}`); }
  for (const c of due) if (picked.length < size && !picked.includes(c)) picked.push(c);
  return picked;
}

/** Right → one box up (the last box keeps it), wrong → box 1; the next day follows from the box. */
export function answerCard(state: RecallState, id: CardId, correct: boolean, now: Date): RecallState {
  const from = state.cards[id]?.box ?? 1;
  const box = (correct ? Math.min(from + 1, LAST_BOX) : 1) as Box;
  return { ...state, cards: { ...state.cards, [id]: { box, due: addDays(dayKey(now), BOXES[box - 1]) } } };
}

export const endSession = (state: RecallState): RecallState => ({ ...state, sessions: state.sessions + 1 });

/** mulberry32 seeded from the text: the same card on the same day gives the same order everywhere. */
export function seededRandom(seed: string): Random {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** A work card's question, built now in the current language; its options keep their order all day. */
export function questionFor(id: CardId, items: readonly Item[], now: Date): QuizQuestion | null {
  const card = parseCardId(id);
  if (card?.kind !== 'work') return null;
  const item = items.find(i => i.slug === card.slug);
  if (!item) return null;
  return questionsFor(item, items, seededRandom(`${id}:${dayKey(now)}`)).find(q => q.id === `veri:${card.field}:${card.slug}`) ?? null;
}
