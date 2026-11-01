// Seyahat modu: the city the visitor is in (nearest located work within 25 km), its routes, and when the welcome
// card was put away. Pure functions; Bugün's TravelCard and the header chip call them.
import type { Item, Season } from './api';
import { byDistance, type Placed } from './explore';

export const TRAVEL_RADIUS_M = 25_000;
export const TRAVEL_SNOOZE_DAYS = 7;

export type CityHere = { city: Item['city']; count: number; nearest: { item: Placed; m: number }[] };

/** The city of the nearest located work when it is within 25 km; how many works it has and its five nearest. */
export function cityHere(items: readonly Item[], here: { lat: number; lon: number }): CityHere | null {
  const sorted = byDistance(items, here);
  const first = sorted[0];
  if (!first || first.m > TRAVEL_RADIUS_M) return null;
  const city = first.item.city;
  return {
    city,
    count: items.filter(i => i.city.slug === city.slug).length,
    nearest: sorted.filter(n => n.item.city.slug === city.slug).slice(0, 5),
  };
}

/** The routes whose stops are mostly in the city, the one with the stop nearest to `here` first. */
export function cityRoutes(seasons: readonly Season[], items: readonly Item[], citySlug: string, here: { lat: number; lon: number }) {
  const bySlug = new Map(items.map(i => [i.slug, i]));
  return seasons.flatMap(route => {
    const stops = route.artifactIds.map(id => bySlug.get(id)).filter((i): i is Item => Boolean(i));
    if (!stops.length || stops.filter(s => s.city.slug === citySlug).length * 2 <= stops.length) return [];
    const near = byDistance(stops, here, 1)[0];
    return [{ route, stops, m: near ? near.m : Infinity }];
  }).sort((a, b) => a.m - b.m);
}

export type TravelDismissed = Record<string, string>;   // city slug → ISO time the card was closed

/** True while the card was closed for this city less than seven days ago. */
export function travelHidden(dismissed: TravelDismissed, citySlug: string, now: Date) {
  const at = dismissed[citySlug] ? Date.parse(dismissed[citySlug]) : NaN;
  return Number.isFinite(at) && now.getTime() - at < TRAVEL_SNOOZE_DAYS * 86_400_000;
}

const FRONT = 'eiöü';
const VOWELS = 'aıoueiöü';
const HARD = 'fstkçşhp';

/** A Turkish place name with its ending: Bursa'ya / Hatay'a (dative), Bursa'da / Kars'ta (locative), Bursa'dasın /
 *  İzmir'desin (you are in). */
export function trSuffix(name: string, kind: 'dative' | 'locative' | 'youAreIn') {
  const lower = name.toLocaleLowerCase('tr-TR');
  const vowel = [...lower].reverse().find(c => VOWELS.includes(c));
  const front = vowel ? FRONT.includes(vowel) : false;
  const last = lower[lower.length - 1] ?? '';
  const a = front ? 'e' : 'a';
  if (kind === 'dative') return `${name}’${VOWELS.includes(last) ? 'y' : ''}${a}`;
  return `${name}’${HARD.includes(last) ? 't' : 'd'}${a}${kind === 'youAreIn' ? (front ? 'sin' : 'sın') : ''}`;
}
