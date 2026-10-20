import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { artifacts, quizQuestions } from '../data/artifacts';
import { eras, seasons, type Era } from '../data/collections';
import { CONTENT_KEY, parseOverrides, serializeOverrides, type Content, type ContentOverrides } from './content';

export const baseContent: Content = { artifacts, quizQuestions, seasons };
type Store = Content & { eras: Era[]; overrides: ContentOverrides; save: (next: ContentOverrides) => boolean; replace: (all: ContentOverrides) => boolean; reset: (key?: keyof Content) => void };
const Context = createContext<Store | null>(null);

function read() {
  try { return parseOverrides(localStorage.getItem(CONTENT_KEY), baseContent); }
  catch { return parseOverrides(null, baseContent); }
}

export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(read);
  const persist = useCallback((overrides: ContentOverrides) => {
    const raw = Object.keys(overrides).length ? serializeOverrides(overrides) : null;
    const next = parseOverrides(raw, baseContent);
    try { raw ? localStorage.setItem(CONTENT_KEY, raw) : localStorage.removeItem(CONTENT_KEY); } catch { /* storage off: keep the session copy */ }
    setState(next);
    return Object.keys(overrides).every(key => key in next.overrides);
  }, []);
  const save = useCallback((next: ContentOverrides) => persist({ ...state.overrides, ...next }), [persist, state.overrides]);
  const reset = useCallback((key?: keyof Content) => {
    if (!key) { persist({}); return; }
    const rest = { ...state.overrides }; delete rest[key]; persist(rest);
  }, [persist, state.overrides]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === CONTENT_KEY) setState(read()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const value = useMemo(() => ({ ...state.content, eras, overrides: state.overrides, save, replace: persist, reset }), [state, save, persist, reset]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useContent() { const context = useContext(Context); if (!context) throw new Error('ContentProvider gerekli.'); return context; }
