// The hidden "Sunum" section of Ayarlar and its demo location: the phone acts as if it stood at a chosen work. Pure
// functions; the saved state is esik:demo:v1 (demo-state.ts), apart from the passport.
import type { Item } from './api';

export const DEMO_KEY = 'esik:demo:v1';
/** Taps on the version line that open the section. */
export const TAPS_TO_UNLOCK = 7;

/** The coordinates are copied from the chosen work's location so geo.ts needs no collection. */
export type DemoPlace = { slug: string; lat: number; lon: number; approximate: boolean };
export type DemoState = { version: 1; unlocked: boolean; place: DemoPlace | null };

export const emptyDemo = (): DemoState => ({ version: 1, unlocked: false, place: null });

/** Saved text → state; anything malformed leaves the section closed and the location off. */
export function parseDemo(value: string | null): DemoState {
  const state = emptyDemo();
  try {
    const data = JSON.parse(value ?? '{}') ?? {};
    state.unlocked = data.unlocked === true;
    const p = data.place;
    if (state.unlocked && typeof p?.slug === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon))
      state.place = { slug: p.slug, lat: p.lat, lon: p.lon, approximate: p.approximate === true };
  } catch { /* a broken save starts closed */ }
  return state;
}

export const placeOf = (item: Item): DemoPlace | null =>
  item.location ? { slug: item.slug, lat: item.location.lat, lon: item.location.lon, approximate: item.location.approximate } : null;

/** Works that can be a demo location, matched by name (Turkish case-insensitive) and city; at most `limit`. */
export function demoChoices(items: readonly Item[], query: string, city: string | null, limit = 8): Item[] {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  return items.filter(i => i.location && (!city || i.city.slug === city)
    && (!q || [i.name, ...i.alt_names].some(n => n.toLocaleLowerCase('tr-TR').includes(q)))).slice(0, limit);
}
