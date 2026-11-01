// The work screen's choices: which tellings a work has, which one to open, and three more works from the same city.
import type { Detail, Item } from './api';
import type { Progress } from './passport';

export type Telling = 'summary' | 'story' | 'child' | 'text';

/** The text of each telling; null when the book or the prepared tellings have none. */
export function tellingTexts(item: Pick<Item, 'summary'> | undefined, detail: Pick<Detail, 'text' | 'narrations'>): Record<Telling, string | null> {
  const clean = (v: string | null | undefined) => v?.trim() || null;
  return { summary: clean(item?.summary), story: clean(detail.narrations.story?.answer), child: clean(detail.narrations.child?.answer), text: clean(detail.text) };
}

const ORDER: Telling[] = ['summary', 'story', 'child', 'text'];
export const availableTellings = (texts: Record<Telling, string | null>) => ORDER.filter(k => texts[k]);

/** The preferred telling when the work has it; otherwise story, summary, the book, the child's telling. */
export function pickTelling(available: readonly Telling[], preferred: Telling): Telling | null {
  return [preferred, 'story', 'summary', 'text', 'child'].find(k => available.includes(k as Telling)) as Telling | undefined ?? null;
}

/** Works from the same city: the same kind first, then the ones without a stamp, then the collection's order. */
export function sameCity(items: readonly Item[], work: Item, progress: Pick<Progress, 'discovered' | 'visits'>, limit = 3): Item[] {
  const stamped = (slug: string) => Boolean(progress.discovered[slug] || progress.visits[slug]);
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.city.slug === work.city.slug && item.slug !== work.slug)
    .sort((a, b) => Number(b.item.kind === work.kind) - Number(a.item.kind === work.kind)
      || Number(stamped(a.item.slug)) - Number(stamped(b.item.slug)) || a.index - b.index)
    .slice(0, limit).map(({ item }) => item);
}
