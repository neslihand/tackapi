import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { artifacts, quizQuestions } from '../data/artifacts';
import { eras, seasons, type Era } from '../data/collections';
import { CONTENT_KEY, parseOverrides, serializeOverrides, type Content, type ContentOverrides } from './content';
import { adaptArtifactFeed } from './artifactAdapter';
import type { ArtifactFeedIssue, DiscoveryArtifact } from './artifactContract';
import { STORAGE_KEY } from './progress';

export const baseContent: Content = { artifacts, quizQuestions, seasons };
type Store = Omit<Content, 'artifacts'> & {
  artifacts: DiscoveryArtifact[];
  eras: Era[];
  readOnly: boolean;
  issues: ArtifactFeedIssue[];
  progressStorageKey: string;
  localContent: Content;
  overrides: ContentOverrides;
  save: (next: ContentOverrides) => boolean;
  replace: (all: ContentOverrides) => boolean;
  reset: (key?: keyof Content) => void;
};
const Context = createContext<Store | null>(null);

function read() {
  try { return parseOverrides(localStorage.getItem(CONTENT_KEY), baseContent); }
  catch { return parseOverrides(null, baseContent); }
}

export function ContentProvider({ children, artifactFeed }: { children: ReactNode; artifactFeed?: unknown }) {
  const [state, setState] = useState(read);
  const readOnly = artifactFeed !== undefined;
  const feed = useMemo(() => readOnly ? adaptArtifactFeed(artifactFeed) : null, [artifactFeed, readOnly]);
  const persist = useCallback((overrides: ContentOverrides) => {
    if (readOnly) return false;
    const raw = Object.keys(overrides).length ? serializeOverrides(overrides) : null;
    const next = parseOverrides(raw, baseContent);
    try { raw ? localStorage.setItem(CONTENT_KEY, raw) : localStorage.removeItem(CONTENT_KEY); } catch { /* storage off: keep the session copy */ }
    setState(next);
    return Object.keys(overrides).every(key => key in next.overrides);
  }, [readOnly]);
  const save = useCallback((next: ContentOverrides) => persist({ ...state.overrides, ...next }), [persist, state.overrides]);
  const reset = useCallback((key?: keyof Content) => {
    if (!key) { persist({}); return; }
    const rest = { ...state.overrides }; delete rest[key]; persist(rest);
  }, [persist, state.overrides]);
  useEffect(() => {
    if (readOnly) return;
    const sync = (event: StorageEvent) => { if (event.key === CONTENT_KEY) setState(read()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [readOnly]);
  const value = useMemo<Store>(() => ({
<<<<<<< HEAD
    ...(feed ? { artifacts: feed.ok ? feed.artifacts : [], quizQuestions: feed.ok ? feed.quizQuestions : [], seasons: feed.ok ? feed.seasons : [] } : state.content),
=======
    ...(feed ? { artifacts: feed.ok ? feed.artifacts : [], quizQuestions: [], seasons: [] } : state.content),
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
    eras, readOnly, issues: feed && !feed.ok ? feed.issues : [],
    progressStorageKey: readOnly ? 'esik:passport:feed:v1' : STORAGE_KEY,
    localContent: state.content, overrides: readOnly ? {} : state.overrides,
    save, replace: persist, reset,
  }), [state, feed, readOnly, save, persist, reset]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useContent() { const context = useContext(Context); if (!context) throw new Error('ContentProvider gerekli.'); return context; }

export function useLocalContent() {
  const context = useContent();
  if (context.readOnly) throw new Error('Bu koleksiyon yerel editörde düzenlenemez.');
  return { ...context, ...context.localContent };
}
