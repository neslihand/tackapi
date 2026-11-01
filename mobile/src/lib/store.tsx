// App state: the collection (from the backend, with the device copy offline), the passport, and the settings.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { secondsSinceFirstOpen, track } from './analytics';
import { defaultSiteSettings, loadFeed, setServerOverride, type Feed, type Item } from './api';
import type { ReadingMode } from './discovery';
import { mergeFlags } from './flags';
import type { GameKind, GameLevel } from './games';
import type { Intent } from './personal';
import { useLang } from './i18n';
import { buildQuests } from './quests';
import { answerable } from './quiz';
import { answerRight, canonical, discover, emptyProgress, hasLabel, keepDay, markRead, medals, mergeProgress, noteHuntWork, parseProgress, recordGame, recordHunt, recordQuiz, setLabel, STORAGE_KEY, toggleFavorite, visit, type NotebookLabel, type Progress } from './passport';
import { answerCard, type RecallAnswer } from './recall';
import type { Rhythm } from './rhythm';

// ------------------------------------------------------------------------------------------------ collection
type Content = Feed & { loading: boolean; error: string | null; reload: () => void; bySlug: (slug: string) => Item | undefined };
const ContentContext = createContext<Content | null>(null);

export function ContentProvider({ children }: { children: ReactNode }) {
  const { lang, ready: langReady } = useLang();
  // the collection waits for the settings too: they may name another server
  const { settings, ready: settingsReady } = useSettings();
  const ready = langReady && settingsReady;
  const [feed, setFeed] = useState<Feed>({ items: [], seasons: [], quiz: [], stale: false, site: defaultSiteSettings });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const asked = `${lang}|${ready}|${round}|${settings.server}`;
  const [answering, setAnswering] = useState(asked);
  if (asked !== answering) { setAnswering(asked); setLoading(true); }
  useEffect(() => {
    if (!ready) return;
    let live = true;
    loadFeed().then(f => { if (live) { setFeed(f); setError(null); } }, e => { if (live) setError(String(e?.message ?? e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [lang, ready, round, settings.server]);
  const value = useMemo<Content>(() => {
    const map = new Map(feed.items.map(i => [i.slug, i]));
    return { ...feed, loading, error, reload: () => setRound(r => r + 1), bySlug: slug => map.get(slug) };
  }, [feed, loading, error]);
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}
export function useContent() {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error('ContentProvider eksik');
  return ctx;
}

/** The module switches: the app's defaults with what the panel closed. */
export function useFlags() {
  const { site } = useContent();
  return useMemo(() => mergeFlags(site.app_flags), [site.app_flags]);
}

// ------------------------------------------------------------------------------------------------ passport
type Passport = {
  progress: Progress; ready: boolean;
  /** how: 'manual' is the stamp button (no reading behind it, so no streak day); the others were measured. */
  discover: (slug: string, how?: 'manual' | 'read_75' | 'listen_75') => void; visit: (slug: string, approximate: boolean) => void; toggleFavorite: (slug: string) => void;
  label: (slug: string, label: NotebookLabel, on: boolean) => void;
  answerCard: (cardId: string, answer: RecallAnswer) => void;
  /** finished keeps today in the rhythm: playing the day's hunt to its end is a verified action. */
  recordHunt: (day: string, attempts: number, solved: boolean, wrong: number | null, finished: boolean) => void;
  /** The work the day's task was about, once the answer has opened; its Hatırla card counts from then. */
  noteHuntWork: (day: string, slug: string) => void;
  recordQuiz: (score: number, rightAbout: string[]) => void;
  answerRight: (slug: string) => void;
  /** The result of a mini game; says the best before it and the medallions it opened, for the result screen. */
  finishGame: (game: GameKind, slug: string, level: GameLevel, result: number) => GameOutcome;
  /** Takes in a passport from the account (another device's progress); returns the merged one. */
  absorb: (incoming: unknown) => void;
};
const PassportContext = createContext<Passport | null>(null);
export type GameOutcome = { previous?: number; unlocked: string[] };

export function PassportProvider({ children }: { children: ReactNode }) {
  const { items } = useContent();
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => setProgress(parseProgress(v)), () => {}).finally(() => { loaded.current = true; setReady(true); });
  }, []);
  useEffect(() => {
    // never overwrite the saved passport with the empty one shown before it was read
    if (loaded.current) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(progress)).catch(() => {});
  }, [progress]);
  const update = useCallback((fn: (p: Progress) => Progress, feel?: boolean) => setProgress(p => {
    const next = fn(p);
    if (feel && next !== p) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return next;
  }), []);
  const value = useMemo<Passport>(() => ({
    progress, ready,
    discover: (slug, how = 'read_75') => {
      if (!progress.discovered[slug]) track('stamp', slug, { stamp_type: 'learning', verification_method: how,
        ...(Object.keys(progress.discovered).length ? {} : { first_stamp: true, since_first_open_s: secondsSinceFirstOpen() }) }, `stamp:learning:${slug}`);
      update(p => how === 'manual' ? discover(p, slug, undefined, false) : markRead(discover(p, slug), slug), true);
    },
    visit: (slug, approximate) => {
      if (!progress.visits[slug]) track('stamp', slug, { stamp_type: 'onsite', verification_method: 'gps', approximate }, `stamp:onsite:${slug}`);
      update(p => visit(p, slug, approximate), true);
    },
    toggleFavorite: slug => { track('favorite', slug, { on: !progress.favorites.includes(slug) }); update(p => toggleFavorite(p, slug)); },
    label: (slug, label, on) => {
      if (on && !hasLabel(progress, slug, label)) track('item_saved', slug, { label });
      update(p => setLabel(p, slug, label, on));
    },
    answerCard: (cardId, answer) => update(p => keepDay(answerCard(p, cardId, answer))),
    recordHunt: (day, attempts, solved, wrong, finished) => update(p => { const played = recordHunt(p, day, attempts, solved, wrong); return finished ? keepDay(played) : played; }),
    noteHuntWork: (day, slug) => update(p => noteHuntWork(p, day, slug)),
    recordQuiz: (score, rightAbout) => update(p => recordQuiz(p, score, rightAbout)),
    answerRight: slug => update(p => answerRight(p, slug)),
    finishGame: (game, slug, level, result) => {
      const outcome: GameOutcome = { previous: progress.games[game][slug]?.[level], unlocked: [] };
      track('game_finish', slug, { game, level, result });
      const next = recordGame(progress, game, slug, level, result);
      if (next === progress) return outcome;
      const before = medals(progress, items);
      outcome.unlocked = medals(next, items).filter((m, i) => m.value >= m.required && before[i].value < before[i].required).map(m => m.name);
      update(p => recordGame(p, game, slug, level, result), true);
      return outcome;
    },
    absorb: incoming => update(p => {
      const merged = mergeProgress(p, parseProgress(JSON.stringify(incoming)));
      return canonical(merged) === canonical(p) ? p : merged;
    }),
  }), [progress, ready, update, items]);
  return <PassportContext.Provider value={value}>{children}</PassportContext.Provider>;
}
export function usePassport() {
  const ctx = useContext(PassportContext);
  if (!ctx) throw new Error('PassportProvider eksik');
  return ctx;
}

// ------------------------------------------------------------------------------------------------ settings
// server: the backend address typed in Ayarlar ('' = the built-in one)
// onboarded: the first screen was answered or skipped; rhythm: daily, weekly or no streak at all;
// notifyOpenedAt: when a notification was last opened, or Günün Eşiği turned on (notifyPlan.ts counts from there)
// homeCity, interests, personalize: "Sana göre" (personal.ts); personalAsked: the offer on Keşfet was answered
export type { Intent };
export type Settings = { homeCity: string | null; interests: string[]; personalize: boolean; personalAsked: boolean; dailyWork: boolean; dailyHour: number; streakReminder: boolean; recallReminder: boolean; notifyOpenedAt: number; gameLevel: Partial<Record<GameKind, GameLevel>>; server: string; narration: ReadingMode | null; onboarded: boolean; intent: Intent | null; rhythm: Rhythm };
const SETTINGS_KEY = 'esik:settings:v1';
const defaults: Settings = { homeCity: null, interests: [], personalize: true, personalAsked: false, dailyWork: false, dailyHour: 9, streakReminder: false, recallReminder: false, notifyOpenedAt: 0, gameLevel: {}, server: '', narration: null, onboarded: false, intent: null, rhythm: 'daily' };
const SettingsContext = createContext<{ settings: Settings; ready: boolean; change: (s: Partial<Settings>) => void } | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(v => {
      if (!v) return;
      const saved: Settings = { ...defaults, ...JSON.parse(v) };
      setServerOverride(saved.server);
      setSettings(saved);
    }).catch(() => {}).finally(() => setReady(true));
  }, []);
  const value = useMemo(() => ({
    settings, ready,
    change: (s: Partial<Settings>) => setSettings(prev => {
      const next = { ...prev, ...s };
      if (s.server !== undefined) setServerOverride(next.server);
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    }),
  }), [settings, ready]);
  // nothing starts before the settings are read: the address typed in Ayarlar decides where every first request goes
  return <SettingsContext.Provider value={value}>{ready ? children : null}</SettingsContext.Provider>;
}
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('SettingsProvider eksik');
  return ctx;
}

// ------------------------------------------------------------------------------------------------ quests
/** The routes as quests, with the passport's progress. */
export function useQuests() {
  const { items, seasons, quiz } = useContent();
  const { progress } = usePassport();
  const canAsk = useMemo(() => answerable(quiz, items), [quiz, items]);
  return useMemo(() => buildQuests(seasons, items, progress, canAsk), [seasons, items, progress, canAsk]);
}
