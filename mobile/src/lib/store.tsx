// App state: the collection (from the backend, with the device copy offline), the passport, and the settings.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadFeed, type Feed, type Item } from './api';
import { useLang } from './i18n';
import { discover, emptyProgress, parseProgress, STORAGE_KEY, toggleFavorite, visit, type Progress } from './passport';

// ------------------------------------------------------------------------------------------------ collection
type Content = Feed & { loading: boolean; error: string | null; reload: () => void; bySlug: (slug: string) => Item | undefined };
const ContentContext = createContext<Content | null>(null);

export function ContentProvider({ children }: { children: ReactNode }) {
  const { lang, ready } = useLang();
  const [feed, setFeed] = useState<Feed>({ items: [], seasons: [], stale: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setLoading(true);
    loadFeed().then(f => { if (live) { setFeed(f); setError(null); } }, e => { if (live) setError(String(e?.message ?? e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [lang, ready, round]);
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

// ------------------------------------------------------------------------------------------------ passport
type Passport = {
  progress: Progress; ready: boolean;
  discover: (slug: string) => void; visit: (slug: string, approximate: boolean) => void; toggleFavorite: (slug: string) => void;
};
const PassportContext = createContext<Passport | null>(null);

export function PassportProvider({ children }: { children: ReactNode }) {
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
    discover: slug => update(p => discover(p, slug), true),
    visit: (slug, approximate) => update(p => visit(p, slug, approximate), true),
    toggleFavorite: slug => update(p => toggleFavorite(p, slug)),
  }), [progress, ready, update]);
  return <PassportContext.Provider value={value}>{children}</PassportContext.Provider>;
}
export function usePassport() {
  const ctx = useContext(PassportContext);
  if (!ctx) throw new Error('PassportProvider eksik');
  return ctx;
}

// ------------------------------------------------------------------------------------------------ settings
export type Settings = { dailyWork: boolean; dailyHour: number; streakReminder: boolean };
const SETTINGS_KEY = 'esik:settings:v1';
const defaults: Settings = { dailyWork: false, dailyHour: 9, streakReminder: false };
const SettingsContext = createContext<{ settings: Settings; ready: boolean; change: (s: Partial<Settings>) => void } | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(v => { if (v) setSettings({ ...defaults, ...JSON.parse(v) }); }).catch(() => {}).finally(() => setReady(true));
  }, []);
  const value = useMemo(() => ({
    settings, ready,
    change: (s: Partial<Settings>) => setSettings(prev => {
      const next = { ...prev, ...s };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    }),
  }), [settings, ready]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('SettingsProvider eksik');
  return ctx;
}
