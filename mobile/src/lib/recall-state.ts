// Hatırla as saved on the phone (esik:recall:v1, apart from the passport). Read again whenever a screen comes into
// focus, so Bugün's card and the review screen count the same cards.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useLang } from './i18n';
import { dayKey } from './passport';
import { loadTerms, type GlossaryTerm } from './reading';
import { answerCard, dueCards, endSession, parseRecall, pickSession, RECALL_KEY, termCards, withTerm, workCards, type Candidate, type CardId, type RecallState } from './recall';
import { useContent, usePassport } from './store';

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
  const state = parseRecall(await AsyncStorage.getItem(RECALL_KEY).catch(() => null));
  const next = withTerm(state, slug, new Date());
  if (next !== state) await AsyncStorage.setItem(RECALL_KEY, JSON.stringify(next)).catch(() => {});
}

export type RecallView = {
  ready: boolean; state: RecallState | null;
  /** Every card that exists, due or not, and the ones due today. */
  candidates: Candidate[]; due: Candidate[]; session: Candidate[];
  glossary: GlossaryTerm[] | null;
  /** Opened terms that cannot be asked now: the glossary is not on the device. */
  termsMissing: boolean;
  answer: (id: CardId, correct: boolean) => RecallState | null;
  finish: () => void;
};

export function useRecall(): RecallView {
  const { items, loading } = useContent();
  const { progress, ready: passportReady, markActiveDay } = usePassport();
  const { lang } = useLang();
  const [state, setState] = useState<RecallState | null>(null);
  const [terms, setTerms] = useState<GlossaryTerm[] | null | undefined>(undefined);
  const latest = useRef<RecallState | null>(null);
  latest.current = state;
  const day = dayKey(new Date());

  useFocusEffect(useCallback(() => {
    let live = true;
    AsyncStorage.getItem(RECALL_KEY).then(v => { if (live) setState(parseRecall(v)); }, () => { if (live) setState(parseRecall(null)); });
    glossary(lang).then(list => { if (live) setTerms(list); });
    return () => { live = false; };
  }, [lang]));

  const save = useCallback((next: RecallState) => {
    latest.current = next; setState(next);
    AsyncStorage.setItem(RECALL_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const candidates = useMemo(() => (state ? [...workCards(progress, items), ...termCards(state, terms ?? null)] : []), [state, progress, items, terms]);
  const due = useMemo(() => (state ? dueCards(state, candidates, new Date()) : []), [state, candidates, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const session = useMemo(() => (state ? pickSession(state, due) : []), [state, due]);

  const answer = useCallback((id: CardId, correct: boolean) => {
    if (!latest.current) return null;
    const next = answerCard(latest.current, id, correct, new Date());
    save(next);
    return next;
  }, [save]);
  // a session with at least one answer counts once: the next one is a full one, and today keeps the streak
  const finish = useCallback(() => {
    if (!latest.current) return;
    save(endSession(latest.current));
    markActiveDay();
  }, [save, markActiveDay]);

  return {
    ready: state !== null && terms !== undefined && !loading && passportReady, state, candidates, due, session,
    glossary: terms ?? null, termsMissing: terms === null && Object.keys(state?.terms ?? {}).length > 0, answer, finish,
  };
}
