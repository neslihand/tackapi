// Hatırla (master plan M08): short reviews of the works the visitor has already discovered, at 1, 3, 7 and 21 days. A
// card is a question from the quiz pool, so its answer and explanation come from the work's own record. The schedule
// lives in the passport: it works offline and follows the account.
import type { QuizQuestion } from './api';
import { addDays, dayKey, type Progress, type RecallState } from './passport';

export const RECALL_DAYS = [1, 3, 7, 21];
export const DAILY_CARDS = 5;
export type RecallAnswer = 'right' | 'wrong' | 'forgot';

// a work's card: a written question first, then what is hardest to guess; the city is the last resort
const PREFERENCE = ['century', 'period', 'architect', 'city'];
const rank = (q: QuizQuestion) => q.id.startsWith('veri:') ? 1 + PREFERENCE.indexOf(q.id.split(':')[1]) : 0;

/** The one card of each work, whichever way the pool was shuffled. */
export function deck(pool: readonly QuizQuestion[]) {
  const cards = new Map<string, QuizQuestion>();
  for (const q of pool) {
    const held = cards.get(q.artifactId);
    if (!held || rank(q) < rank(held)) cards.set(q.artifactId, q);
  }
  return cards;
}

/** When the visitor first met a work: its stamp, or a finished Detay Avı about it (master plan M07). A game writes no stamp,
 *  but what it taught can still be asked again. */
function metOn(p: Progress) {
  const played = new Map<string, string>();
  for (const h of Object.values(p.hunt)) if (h.work && !(played.get(h.work)! <= h.at)) played.set(h.work, h.at);
  return (slug: string) => p.discovered[slug] ?? played.get(slug);
}

/** Cards due today, the longest waiting first: a work's first card opens the day after the visitor met it. */
export function dueCards(pool: readonly QuizQuestion[], progress: Progress, now = new Date(), limit = DAILY_CARDS) {
  const today = dayKey(now);
  const met = metOn(progress);
  const due: { card: QuizQuestion; since: string; state: RecallState | undefined }[] = [];
  for (const [slug, card] of deck(pool)) {
    const state = progress.recall[card.id];
    const first = met(slug);
    if (!first) continue;
    const since = state ? state.due : addDays(dayKey(new Date(first)), RECALL_DAYS[0]);
    if (since && since <= today && state?.last !== today) due.push({ card, since, state });
  }
  return due.sort((a, b) => a.since.localeCompare(b.since) || a.card.id.localeCompare(b.card.id)).slice(0, limit);
}

/** The day the next card opens, for the Hatırla notification; null when none is waiting. */
export function nextRecallDay(pool: readonly QuizQuestion[], progress: Progress) {
  let next: string | null = null;
  const met = metOn(progress);
  for (const [slug, card] of deck(pool)) {
    const first = met(slug);
    if (!first) continue;
    const state = progress.recall[card.id];
    const day = state ? state.due : addDays(dayKey(new Date(first)), RECALL_DAYS[0]);
    if (day && (!next || day < next)) next = day;
  }
  return next;
}

/** Records an answer: right moves on to the next interval, anything else starts over from tomorrow. After the last
 *  interval the card is finished (due: null). A card answered today stays as it is until its next due day. */
export function answerCard(p: Progress, cardId: string, answer: RecallAnswer, now = new Date()): Progress {
  const today = dayKey(now);
  const held = p.recall[cardId];
  if (held?.last === today) return p;
  const step = answer === 'right' ? (held?.step ?? 0) + 1 : 0;
  const state: RecallState = { step, due: answer !== 'right' ? addDays(today, RECALL_DAYS[0]) : step < RECALL_DAYS.length ? addDays(today, RECALL_DAYS[step]) : null,
    first: held ? held.first : answer === 'right', last: today, at: now.toISOString() };
  return { ...p, recall: { ...p.recall, [cardId]: state } };
}
