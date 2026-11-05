import type { Item, Season } from './api';

export const foldSearch = (value: string) => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
export type Filters = { query: string; city: string; period: string; kind: string; season: string; favorites: boolean };
export const emptyFilters: Filters = { query: '', city: '', period: '', kind: '', season: '', favorites: false };

/** Route order is editorial. Filters refine it without sorting its stops. */
export function filterWorks(items: readonly Item[], seasons: readonly Season[], favorites: readonly string[], filters: Filters) {
  const route = seasons.find(s => s.id === filters.season);
  const bySlug = new Map(items.map(item => [item.slug, item]));
  const pool = filters.season ? (route?.artifactIds ?? []).flatMap(id => bySlug.has(id) ? [bySlug.get(id)!] : []) : items;
  const q = foldSearch(filters.query.trim());
  return pool.filter(item => (!filters.city || item.city.slug === filters.city || item.city.name === filters.city)
    && (!filters.period || item.period?.slug === filters.period || item.period?.name === filters.period)
    && (!filters.kind || item.kind === filters.kind)
    && (!filters.favorites || favorites.includes(item.slug))
    && (!q || foldSearch([item.name, ...item.alt_names, item.city.name, item.kind_label, item.district ?? ''].join(' ')).includes(q)));
}

// brief: the short summary, about half a minute. The site's 'short' setting is the book's text here ('text').
export type ReadingMode = 'brief' | 'text' | 'story' | 'child';
/** The visitor's choice if they made one, else the site's default; a telling this work lacks falls back to its text. */
export function readingMode(preference: ReadingMode | null, site: 'short' | 'story' | 'child', available: { brief?: unknown; story?: unknown; child?: unknown }): ReadingMode {
  const mode = preference ?? (site === 'short' ? (available.brief ? 'brief' : 'text') : site);
  return mode === 'text' || available[mode] ? mode : 'text';
}
/** The name /api/events and the panel use for a telling. */
export const modeForEvents = (mode: ReadingMode) => mode === 'text' ? 'short' : mode;
