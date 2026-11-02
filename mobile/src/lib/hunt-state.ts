// Today's Detay Avı as saved on the phone (esik:hunt:v1, apart from the passport). Read again whenever a screen comes
// into focus, so Bugün's card and the puzzle screen show the same guesses.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Item } from './api';
import { guessIn, HUNT_KEY, huntFor, huntNumberOf, outcome, parseHunt, withHunt, withoutDay, type HuntDay, type HuntState } from './autoHunt';
import { dayKey } from './passport';
import { useContent, usePassport } from './store';

/** Ayarlar → Sunum: today's puzzle starts again the next time it opens. */
export async function resetHuntToday(now: Date) {
  const state = parseHunt(await AsyncStorage.getItem(HUNT_KEY).catch(() => null));
  await AsyncStorage.setItem(HUNT_KEY, JSON.stringify(withoutDay(state, dayKey(now)))).catch(() => {});
}

export type HuntView = {
  ready: boolean; day: string; number: number;
  puzzle: HuntDay | null; answer: Item | null; options: Item[];
  guess: (slug: string) => void;
};

export function useHunt(): HuntView {
  const { items, loading, bySlug } = useContent();
  const { markActiveDay } = usePassport();
  const [state, setState] = useState<HuntState | null>(null);
  const day = dayKey(new Date());
  const hunt = useMemo(() => huntFor(items, new Date()), [items, day]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => {
    let live = true;
    AsyncStorage.getItem(HUNT_KEY).then(v => { if (live) setState(parseHunt(v)); }, () => { if (live) setState(parseHunt(null)); });
    return () => { live = false; };
  }, []));

  const save = useCallback((next: HuntState) => { setState(next); AsyncStorage.setItem(HUNT_KEY, JSON.stringify(next)).catch(() => {}); }, []);
  // the day's puzzle is kept as first seen: added here and saved, so a later change in the list does not change it
  const current = useMemo(() => state && hunt ? withHunt(state, hunt) : state, [state, hunt]);
  useEffect(() => {
    if (current && current !== state) AsyncStorage.setItem(HUNT_KEY, JSON.stringify(current)).catch(() => {});
  }, [current, state]);

  const puzzle = current?.days[day] ?? null;
  const guess = useCallback((slug: string) => {
    if (!current) return;
    const next = guessIn(current, day, slug);
    if (next === current) return;
    save(next);
    // finishing the puzzle, found or not, keeps the streak
    if (outcome(next.days[day]).over) markActiveDay();
  }, [current, day, save, markActiveDay]);

  return {
    ready: state !== null && !loading, day, number: huntNumberOf(day), puzzle,
    answer: puzzle ? bySlug(puzzle.slug) ?? null : null,
    options: puzzle ? puzzle.options.map(s => bySlug(s)).filter((i): i is Item => Boolean(i)) : [],
    guess,
  };
}
