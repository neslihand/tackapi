import type { Season } from '../data/collections';
import type { DiscoveryArtifact } from './artifactContract';
import { PLACEHOLDER_IMAGE, slugify } from './content.ts';
import type { Progress } from './progress';

// Interactive quests: each discovery route becomes a set of steps across its artifacts — read and stamp every story,
// solve one artifact's puzzle, answer a question about another. Steps can be done in any order; progress comes from
// what is already saved (stamps, puzzle records, answered questions), so nothing quest-specific is stored.
export type QuestStepKind = 'read' | 'puzzle' | 'quiz';
export type QuestStep = { kind: QuestStepKind; artifactId: string; label: string; to: string; done: boolean };
export type Quest = { id: string; kicker: string; title: string; description: string; steps: QuestStep[]; done: number; complete: boolean };
export type QuestRoute = Pick<Season, 'id' | 'kicker' | 'title' | 'description' | 'artifactIds'>;

const known = (value: string | null | undefined): value is string => Boolean(value && value.trim() && value !== 'Bilinmiyor');
const firstYear = (artifact: DiscoveryArtifact) => Number(artifact.year?.match(/\d{3,4}/)?.[0] ?? 9999);

// The editors' discovery seasons are the routes. A collection without seasons (an external feed has none) gets routes
// from its data: one per architect, then one per city, each with at least two works in date order.
export function questRoutes(seasons: readonly Season[], artifacts: readonly DiscoveryArtifact[]): QuestRoute[] {
  if (seasons.length) return [...seasons];
  const groups = (field: 'architect' | 'city') => {
    const map = new Map<string, DiscoveryArtifact[]>();
    for (const artifact of artifacts) if (known(artifact[field])) map.set(artifact[field], [...(map.get(artifact[field]) ?? []), artifact]);
    return [...map].filter(([, list]) => list.length >= 2).map(([value, list]) => [value, [...list].sort((a, b) => firstYear(a) - firstYear(b))] as const);
  };
  return [
    ...groups('architect').map(([architect, list]) => ({ id: `usta-${slugify(architect)}`, kicker: 'USTA ROTASI', title: `Usta rotası: ${architect}`, description: `${architect} ile anılan ${list.length} eser, tarih sırasıyla.`, artifactIds: list.map(a => a.id) })),
    ...groups('city').map(([city, list]) => ({ id: `sehir-${slugify(city)}`, kicker: 'ŞEHİR ROTASI', title: `Şehir rotası: ${city}`, description: `${city} şehrindeki ${list.length} eser.`, artifactIds: list.map(a => a.id) })),
  ].slice(0, 4);
}

// `answerable` holds the artifacts the quiz has a question about; a quiz step is only set where one exists.
export function buildQuests(routes: readonly QuestRoute[], artifacts: readonly DiscoveryArtifact[], progress: Progress, answerable: ReadonlySet<string>): Quest[] {
  return routes.flatMap(route => {
    const stops = route.artifactIds.map(id => artifacts.find(a => a.id === id)).filter((a): a is DiscoveryArtifact => a !== undefined);
    if (!stops.length) return [];
    // The puzzle goes to the first stop with a picture, the question to the last answerable stop (another one if it can).
    const puzzleStop = stops.find(a => a.image !== PLACEHOLDER_IMAGE);
    const fromEnd = [...stops].reverse();
    const quizStop = fromEnd.find(a => answerable.has(a.id) && a.id !== puzzleStop?.id) ?? fromEnd.find(a => answerable.has(a.id));
    const steps: QuestStep[] = [];
    for (const a of stops) {
      const id = encodeURIComponent(a.id);
      steps.push({ kind: 'read', artifactId: a.id, label: `${a.name}: hikâyeyi oku ve pasaportuna mühürle`, to: `/eser/${a.slug}`, done: Boolean(progress.discovered[a.id]) });
      if (a === puzzleStop) steps.push({ kind: 'puzzle', artifactId: a.id, label: `${a.name}: yapbozunu çöz`, to: `/oyun/oyunlar?oyun=yapboz&eser=${id}`, done: progress.games.puzzle[a.id] !== undefined });
      if (a === quizStop) steps.push({ kind: 'quiz', artifactId: a.id, label: `${a.name}: bir soruyu doğru yanıtla`, to: `/oyun/quiz?eser=${id}`, done: progress.answered.includes(a.id) });
    }
    const done = steps.filter(step => step.done).length;
    return [{ id: route.id, kicker: route.kicker, title: route.title, description: route.description, steps, done, complete: done === steps.length }];
  });
}
