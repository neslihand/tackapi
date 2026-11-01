// Harita's choices together, by the site's rule (frontend/src/pages/MapPage.tsx): city, type, search by a work's or a city's
// name, and, once the location is known, a distance. A distance leaves out works with no location, as it cannot place them.
import { distanceM, normalize } from './passport';

type Place = { name: string; kind: string; city: { slug: string; name: string }; location?: { lat: number; lon: number } | null };

export const RADII_KM = [10, 50, 250];

export function filterPlaces<T extends Place>(items: readonly T[], f: { city: string | null; kind: string | null; search: string }, here: { lat: number; lon: number } | null, radiusKm: number) {
  const q = normalize(f.search.trim());
  return items.filter(i => (!f.city || i.city.slug === f.city) && (!f.kind || i.kind === f.kind)
    && (!q || normalize(`${i.name} ${i.city.name}`).includes(q))
    && (!here || !radiusKm || (Boolean(i.location) && distanceM(here, i.location!) <= radiusKm * 1000)));
}
