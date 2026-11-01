// Discovery routes as quests, as on the site (frontend/src/lib/quests.ts): read and stamp every stop, solve one stop's
// puzzle, answer a question about another. The phone adds the walk: each stop can also be stamped on the spot, counted
// apart so a quest can be finished at home and walked later. Progress comes from the passport; nothing quest-specific is saved.
import type { Item, Season } from './api';
import { t } from './i18n';
import type { Progress } from './passport';

export type QuestStep = { kind: 'read' | 'puzzle' | 'quiz'; slug: string; label: string; done: boolean };
export type Quest = { route: Season; stops: Item[]; steps: QuestStep[]; done: number; complete: boolean; visited: number };

export function buildQuests(routes: readonly Season[], items: readonly Item[], progress: Progress, canAsk: ReadonlySet<string>): Quest[] {
  const bySlug = new Map(items.map(i => [i.slug, i]));
  return routes.flatMap(route => {
    const stops = route.artifactIds.map(id => bySlug.get(id)).filter((i): i is Item => Boolean(i));
    if (!stops.length) return [];
    // The puzzle goes to the first stop with a picture, the question to the last answerable stop (another one if it can).
    const puzzleStop = stops.find(i => i.image);
    const fromEnd = [...stops].reverse();
    const quizStop = fromEnd.find(i => canAsk.has(i.slug) && i !== puzzleStop) ?? fromEnd.find(i => canAsk.has(i.slug));
    const steps: QuestStep[] = [];
    for (const stop of stops) {
      steps.push({ kind: 'read', slug: stop.slug, label: t(`${stop.name}: hikâyeyi oku ve mühürle`, `${stop.name}: read the story and stamp it`), done: Boolean(progress.discovered[stop.slug]) });
      if (stop === puzzleStop) steps.push({ kind: 'puzzle', slug: stop.slug, label: t(`${stop.name}: yapbozunu çöz`, `${stop.name}: solve its puzzle`), done: progress.games.puzzle[stop.slug] !== undefined });
      if (stop === quizStop) steps.push({ kind: 'quiz', slug: stop.slug, label: t(`${stop.name}: bir soruyu doğru yanıtla`, `${stop.name}: answer a question right`), done: progress.answered.includes(stop.slug) });
    }
    const done = steps.filter(s => s.done).length;
    return [{ route, stops, steps, done, complete: done === steps.length, visited: stops.filter(s => progress.visits[s.slug]).length }];
  });
}
