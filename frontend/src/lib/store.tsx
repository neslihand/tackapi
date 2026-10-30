import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { achievements, discover, emptyProgress, parseProgress, recordGame, type Progress } from './progress';
import type { GameKind, GameLevel } from './games';
import { buildQuests, questRoutes } from './quests';
import { answerableArtifacts } from './quiz';
import { useContent } from './contentStore';
import { accountApi, useAccount } from './account';
import { track } from './analytics';
import { t } from './i18n';

// `previous` is the best result before this one; `unlocked` names the medals this result opened. The game shows both
// inside its dialog, where the page toast does not reach screen readers.
export type GameOutcome = { previous?: number; unlocked: string[] };
type Store = { progress: Progress; markDiscovered: (id: string) => void; toggleFavorite: (id: string) => void; finishQuiz: (score: number) => void; answerCorrect: (artifactId: string) => void; finishGame: (game: GameKind, id: string, level: GameLevel, result: number) => GameOutcome; notify: (message: string) => void; toast: string; storageAvailable: boolean };
const Context = createContext<Store | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { artifacts, progressStorageKey, seasons, quizQuestions } = useContent();
  const known = useRef(artifacts); known.current = artifacts;
  const [progress, setProgress] = useState<Progress>(() => {
    try { return parseProgress(localStorage.getItem(progressStorageKey), artifacts.map(a => a.id)); }
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
  const latest = useRef(progress); latest.current = progress;
  useEffect(() => {
    try { localStorage.setItem(progressStorageKey, JSON.stringify(progress)); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
    const old = achievements(previous.current, known.current);
    const unlocked = achievements(progress, known.current).filter((a, i) => a.value >= a.required && old[i].value < old[i].required);
    // A quest is complete when every step's record is in progress; announce the ones this change completed.
    const routes = questRoutes(seasons, known.current);
    const answerable = answerableArtifacts(quizQuestions, known.current);
    const wasDone = new Set(buildQuests(routes, known.current, previous.current, answerable).filter(q => q.complete).map(q => q.id));
    const quests = buildQuests(routes, known.current, progress, answerable).filter(q => q.complete && !wasDone.has(q.id));
    const news = [...(unlocked.length ? [`${t('Yeni madalyon', 'New medallion')}: ${unlocked.map(a => a.name).join(' · ')}`] : []), ...(quests.length ? [`${t('Görev tamamlandı', 'Quest complete')}: ${quests.map(q => q.title).join(' · ')}`] : [])];
    if (news.length) notify(news.join(' · '));
    previous.current = progress;
  }, [progress, notify, progressStorageKey]);
  // Hesap: kullanıcı belli olunca (açılışta, girişte) bu tarayıcıdaki ilerleme sunucudakiyle birleştirilir; sonra her
  // değişiklik kısa bir gecikmeyle hesaba yazılır. Hesap yoksa pasaport yalnızca bu tarayıcıdadır.
  const { user } = useAccount();
  const synced = useRef('');
  useEffect(() => {
    if (!user) { synced.current = ''; return; }
    let alive = true;
    accountApi.syncProgress(latest.current).then(r => {
      if (!alive) return;
      const merged = parseProgress(JSON.stringify(r.progress), known.current.map(a => a.id));
      synced.current = JSON.stringify(merged);
      setProgress(merged);
    }).catch(() => {});
    return () => { alive = false; };
  }, [user?.id]);
  useEffect(() => {
    if (!user || !synced.current || JSON.stringify(progress) === synced.current) return;
    const t = setTimeout(() => { synced.current = JSON.stringify(progress); accountApi.syncProgress(progress).catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [progress, user]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === progressStorageKey) setProgress(parseProgress(event.newValue, known.current.map(a => a.id)));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [progressStorageKey]);
  return <Context.Provider value={{ progress, toast, storageAvailable, notify,
    markDiscovered: id => { if (known.current.some(a => a.id === id)) { track('stamp', id); setProgress(p => discover(p, id)); } },
    toggleFavorite: id => { if (known.current.some(a => a.id === id)) { track('favorite', id, { on: !latest.current.favorites.includes(id) }); setProgress(p => ({ ...p, favorites: p.favorites.includes(id) ? p.favorites.filter(f => f !== id) : [...p.favorites, id] })); } },
    finishQuiz: score => { track('quiz_finish', undefined, { score }); setProgress(p => ({ ...p, quiz: { completed: p.quiz.completed + 1, best: Math.max(p.quiz.best, score) } })); },
    answerCorrect: id => { if (known.current.some(a => a.id === id)) setProgress(p => p.answered.includes(id) ? p : { ...p, answered: [...p.answered, id] }); },
    finishGame: (game, id, level, result) => {
      const before = latest.current;
      const outcome: GameOutcome = { previous: before.games[game][id]?.[level], unlocked: [] };
      if (!known.current.some(a => a.id === id)) return outcome;
      track('game_finish', id, { game, level, result });
      const next = recordGame(before, game, id, level, result);
      if (next === before) return outcome;
      const old = achievements(before, known.current);
      outcome.unlocked = achievements(next, known.current).filter((a, i) => a.value >= a.required && old[i].value < old[i].required).map(a => a.name);
      latest.current = next;
      setProgress(next);
      return outcome;
    },
  }}>{children}</Context.Provider>;
}
export function useProgress() { const context = useContext(Context); if (!context) throw new Error('ProgressProvider gerekli.'); return context; }
