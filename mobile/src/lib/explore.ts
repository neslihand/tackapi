// Keşfet's search and filters, and the distance order used by "Yakınımda" and Bugün. Pure functions.
import type { Item, Location } from './api';
import { distanceM, normalize } from './passport';

export type Placed = Item & { location: Location };
export type Filter = { query: string; city: string | null; kind: string | null };

/** Each work's searchable text, normalised once so typing stays fast over the whole collection. */
export const searchIndex = (items: readonly Item[]) =>
  new Map(items.map(i => [i.slug, normalize([i.name, ...i.alt_names, i.kind_label, i.city.name, i.district ?? ''].join(' '))]));

export function filterWorks(items: readonly Item[], index: ReadonlyMap<string, string>, { query, city, kind }: Filter) {
  const q = normalize(query.trim());
  return items.filter(i => (!city || i.city.slug === city) && (!kind || i.kind === kind) && (!q || (index.get(i.slug) ?? '').includes(q)));
}

/** [slug, name] pairs in first-seen order, for the filter chips. */
export const cityOptions = (items: readonly Item[]) => [...new Map(items.map(i => [i.city.slug, i.city.name]))];
export const kindOptions = (items: readonly Item[], city: string | null) =>
  [...new Map(items.filter(i => !city || i.city.slug === city).map(i => [i.kind, i.kind_label]))];

export const placed = (items: readonly Item[]) => items.filter((i): i is Placed => Boolean(i.location));

/** The located works by distance from `here`, nearest first. */
export function byDistance(items: readonly Item[], here: { lat: number; lon: number }, limit?: number) {
  const sorted = placed(items).map(item => ({ item, m: distanceM(here, item.location) })).sort((a, b) => a.m - b.m);
  return limit === undefined ? sorted : sorted.slice(0, limit);
}
