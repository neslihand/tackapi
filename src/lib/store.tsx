import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { achievements, discover, emptyProgress, parseProgress, STORAGE_KEY, type Progress } from './progress';
import { useContent } from './contentStore';

type Store = { progress: Progress; markDiscovered: (id: string) => void; toggleFavorite: (id: string) => void; finishQuiz: (score: number) => void; notify: (message: string) => void; toast: string; storageAvailable: boolean };
const Context = createContext<Store | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { artifacts } = useContent();
  const known = useRef(artifacts); known.current = artifacts;
  const [progress, setProgress] = useState<Progress>(() => {
    try { return parseProgress(localStorage.getItem(STORAGE_KEY), artifacts.map(a => a.id)); }
    catch { return emptyProgress(); }
  });
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current); setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const previous = useRef(progress);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
    const old = achievements(previous.current, known.current);
    const unlocked = achievements(progress, known.current).filter((a, i) => a.value >= a.required && old[i].value < old[i].required);
    if (unlocked.length) notify(`Yeni madalyon: ${unlocked.map(a => a.name).join(' · ')}`);
    previous.current = progress;
  }, [progress, notify]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setProgress(parseProgress(event.newValue, known.current.map(a => a.id)));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return <Context.Provider value={{ progress, toast, storageAvailable, notify,
    markDiscovered: id => { if (known.current.some(a => a.id === id)) setProgress(p => discover(p, id)); },
    toggleFavorite: id => { if (known.current.some(a => a.id === id)) setProgress(p => ({ ...p, favorites: p.favorites.includes(id) ? p.favorites.filter(f => f !== id) : [...p.favorites, id] })); },
    finishQuiz: score => setProgress(p => ({ ...p, quiz: { completed: p.quiz.completed + 1, best: Math.max(p.quiz.best, score) } })),
  }}>{children}</Context.Provider>;
}
export function useProgress() { const context = useContext(Context); if (!context) throw new Error('ProgressProvider gerekli.'); return context; }
