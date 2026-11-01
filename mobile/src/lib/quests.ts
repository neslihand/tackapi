// Discovery routes as quests, as on the site (frontend/src/lib/quests.ts): read and stamp every stop, answer a
// question about one of them. The phone adds the walk: each stop can also be stamped on the spot, counted apart so a
// quest can be finished at home and walked later. Progress comes from the passport; nothing quest-specific is saved.
import type { Item, Season } from './api';
import { t } from './i18n';
import type { Progress } from './passport';

export type QuestStep = { kind: 'read' | 'quiz'; slug: string; label: string; done: boolean };
export type Quest = { route: Season; stops: Item[]; steps: QuestStep[]; done: number; complete: boolean; visited: number };

/** The quest under way: some steps done, not finished. */
export const questInProgress = (quests: readonly Quest[]) => quests.find(q => q.done > 0 && !q.complete);

/** Bugün's season route: the first unfinished quest that "Devam et" is not already showing. */
export function seasonQuest(quests: readonly Quest[]) {
  const going = questInProgress(quests);
  return quests.find(q => !q.complete && q !== going);
}

export const stepHref = (step: QuestStep) => step.kind === 'quiz' ? `/quiz?eser=${encodeURIComponent(step.slug)}` : `/eser/${step.slug}`;

export function buildQuests(routes: readonly Season[], items: readonly Item[], progress: Progress, canAsk: ReadonlySet<string>): Quest[] {
  const bySlug = new Map(items.map(i => [i.slug, i]));
  return routes.flatMap(route => {
    const stops = route.artifactIds.map(id => bySlug.get(id)).filter((i): i is Item => Boolean(i));
    if (!stops.length) return [];
    const quizStop = [...stops].reverse().find(i => canAsk.has(i.slug));
    const steps: QuestStep[] = [];
    for (const stop of stops) {
      steps.push({ kind: 'read', slug: stop.slug, label: t(`${stop.name}: hikâyeyi oku ve mühürle`, `${stop.name}: read the story and stamp it`), done: Boolean(progress.discovered[stop.slug]) });
      if (stop === quizStop) steps.push({ kind: 'quiz', slug: stop.slug, label: t(`${stop.name}: bir soruyu doğru yanıtla`, `${stop.name}: answer a question right`), done: progress.answered.includes(stop.slug) });
    }
    const done = steps.filter(s => s.done).length;
    return [{ route, stops, steps, done, complete: done === steps.length, visited: stops.filter(s => progress.visits[s.slug]).length }];
  });
}
