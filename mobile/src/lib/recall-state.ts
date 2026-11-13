// Hatırla on the phone: which glossary terms were opened, and when (tackapi:recall:v1, apart from the passport), and the
// day's cards. The schedule itself is in the passport (recall.ts), so it follows the account. Read again whenever a
// screen comes into focus, so Bugün's card and the review screen count the same cards.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import type { QuizQuestion } from './api';
import { useLang } from './i18n';
import { compareKeys, dayKey, type RecallState } from './passport';
import { quizPool } from './quiz';
import { loadTerms, type GlossaryTerm } from './reading';
import { answerCard, DAILY_CARDS, dueCards, dueTermCards, nextRecallDay, nextTermDay, type RecallAnswer } from './recall';
import { useContent, usePassport } from './store';

export const RECALL_KEY = 'tackapi:recall:v1';
type Saved = { terms: Record<string, string>; forward: string | null };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parse(value: string | null): Saved {
  const saved: Saved = { terms: {}, forward: null };
  try {
    const data = JSON.parse(value ?? '{}') ?? {};
    for (const [slug, day] of Object.entries((data.terms ?? {}) as Record<string, unknown>)) if (typeof day === 'string' && DAY.test(day)) saved.terms[slug] = day;
    if (typeof data.forward === 'string' && DAY.test(data.forward)) saved.forward = data.forward;
  } catch { /* a broken save starts over */ }
  return saved;
}
const read = async () => parse(await AsyncStorage.getItem(RECALL_KEY).catch(() => null));
const write = (saved: Saved) => AsyncStorage.setItem(RECALL_KEY, JSON.stringify(saved)).catch(() => {});

// the glossary is fetched once per language (the device copy when offline); null when neither is there, tried again later
let glossaryCache: { lang: string; promise: Promise<GlossaryTerm[] | null> } | null = null;
function glossary(lang: string) {
  if (glossaryCache?.lang !== lang) {
    const promise = loadTerms().then(r => r.data.items ?? [], () => null);
    glossaryCache = { lang, promise };
    promise.then(list => { if (list === null && glossaryCache?.promise === promise) glossaryCache = null; });
  }
  return glossaryCache.promise;
}

/** The term screen calls this when a term opens: from the next day it comes back as a card. */
export async function rememberTerm(slug: string) {
  const saved = await read();
  if (!saved.terms[slug]) await write({ ...saved, terms: { ...saved.terms, [slug]: dayKey(new Date()) } });
}

/** Ayarlar → Sunum: for the rest of today every card the visitor has is due, whatever its day. Only this phone sees it;
 *  the schedule in the passport is not touched until a card is answered. */
export async function bringRecallForward() {
  await write({ ...(await read()), forward: dayKey(new Date()) });
}

// far enough ahead that every scheduled card has come round
const FAR = new Date(2100, 0, 1);

export type RecallCardView =
  | { kind: 'work'; id: string; slug: string; question: QuizQuestion; state: RecallState | undefined }
  | { kind: 'term'; id: string; slug: string; term: GlossaryTerm; state: RecallState | undefined };

export type RecallView = {
  ready: boolean;
  /** Today's cards, at most DAILY_CARDS, the longest waiting first. */
  session: RecallCardView[];
  /** Whether the visitor has any card at all, due or not. */
  hasCards: boolean;
  /** The day the next card opens, when none is due now. */
  next: string | null;
  /** Opened terms that cannot be asked now: the glossary is not on the device. */
  termsMissing: boolean;
  /** Records an answer and says the card's next day (null: finished). */
  answer: (card: RecallCardView, answer: RecallAnswer) => string | null;
};

export function useRecall(): RecallView {
  const { items, quiz, loading } = useContent();
  const { progress, ready: passportReady, answerCard: answerInPassport } = usePassport();
  const { lang } = useLang();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [terms, setTerms] = useState<GlossaryTerm[] | null | undefined>(undefined);
  const day = dayKey(new Date());

  useFocusEffect(useCallback(() => {
    let live = true;
    read().then(v => { if (live) setSaved(v); });
    glossary(lang).then(list => { if (live) setTerms(list); });
    return () => { live = false; };
  }, [lang]));

  const pool = useMemo(() => quizPool(quiz, items), [quiz, items]);
  const session = useMemo(() => {
    if (!saved) return [];
    const forward = saved.forward === day;
    const when = forward ? FAR : new Date();
    const notToday = (state: RecallState | undefined) => state?.last !== day;
    const byTerm = new Map((terms ?? []).map(g => [g.slug, g]));
    const works = dueCards(pool, progress, when, Number.MAX_SAFE_INTEGER).filter(c => notToday(c.state))
      .map(c => ({ since: c.since, view: { kind: 'work' as const, id: c.card.id, slug: c.card.artifactId, question: c.card, state: c.state } }));
    const termsDue = dueTermCards(saved.terms, new Set(byTerm.keys()), progress, when).filter(c => notToday(c.state))
      .map(c => ({ since: c.since, view: { kind: 'term' as const, id: c.id, slug: c.slug, term: byTerm.get(c.slug)!, state: c.state } }));
    return [...works, ...termsDue].sort((a, b) => compareKeys(a.since, b.since) || compareKeys(a.view.id, b.view.id))
      .slice(0, DAILY_CARDS).map(c => c.view);
  }, [saved, terms, pool, progress, day]);

  const next = useMemo(() => {
    const days = [nextRecallDay(pool, progress), saved ? nextTermDay(saved.terms, progress) : null].filter((d): d is string => Boolean(d)).sort();
    return days[0] ?? null;
  }, [pool, progress, saved]);

  const answer = useCallback((card: RecallCardView, result: RecallAnswer) => {
    answerInPassport(card.id, result);
    return answerCard(progress, card.id, result).recall[card.id]?.due ?? null;
  }, [answerInPassport, progress]);

  return {
    ready: saved !== null && terms !== undefined && !loading && passportReady, session, next, answer,
    hasCards: next !== null || session.length > 0,
    termsMissing: terms === null && Object.keys(saved?.terms ?? {}).length > 0,
  };
}
