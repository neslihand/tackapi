// Kademeli madalyonlar (master plan M11): bronze, silver and gold on tracks made only of proven actions. The thresholds
// come from the panel (GET /api/site-settings), never from here. Every track counts works, and works are finite, so
// opening things over and over earns nothing; a stamp by button counts for no track, and on-the-spot goals can only be
// reached on the spot. A step the collection cannot reach is left out instead of being shown out of reach for ever.
import type { MedalTiers } from './api';
import type { Progress } from './passport';

const METALS = ['bronze', 'silver', 'gold'] as const;
export type Metal = (typeof METALS)[number];
export type Track = { id: string; value: number; max: number; metal: Metal | null; next: { metal: Metal; at: number } | null };
export type CityTrack = Track & { city: string; name: string; onSite: number; onSiteGoal: number; master: boolean };
type Work = { slug: string; city: { slug: string; name: string }; location?: unknown };

function track(id: string, value: number, max: number, steps: readonly number[]): Track {
  let metal: Metal | null = null;
  let next: Track['next'] = null;
  for (const [i, at] of steps.entries()) {
    if (at > max) continue;
    if (value >= at) metal = METALS[i];
    else if (!next) next = { metal: METALS[i], at };
  }
  return { id, value, max, metal, next };
}

const share = (percent: number, of: number) => Math.ceil(percent * of / 100);

export function tierTracks(p: Progress, works: readonly Work[], tiers: MedalTiers): { overall: Track[]; cities: CityTrack[] } {
  const read = (w: Work) => Boolean(p.read[w.slug]);
  const stamped = (w: Work) => Boolean(p.visits[w.slug]);
  const placed = works.filter(w => w.location);
  // one card a work; a card once right stays counted, so a forgotten answer does not take a medallion back
  const answered = Object.values(p.recall).filter(c => c.first || c.step >= 1).length;
  const overall = [
    track('read', works.filter(read).length, works.length, tiers.read),
    track('onsite', placed.filter(stamped).length, placed.length, tiers.onsite),
    track('recall', answered, works.length, tiers.recall),
  ];
  const byCity = new Map<string, Work[]>();
  for (const w of works) byCity.set(w.city.slug, [...(byCity.get(w.city.slug) ?? []), w]);
  const cities = [...byCity.entries()].map(([slug, list]) => {
    const steps = tiers.city_read.map(pct => share(pct, list.length));
    const t = track(`city:${slug}`, list.filter(read).length, list.length, steps);
    const here = list.filter(w => w.location);
    const onSite = here.filter(stamped).length;
    const onSiteGoal = share(tiers.master_onsite, here.length);
    // a master has read the city and stood in front of it: gold alone can be earned at home
    return { ...t, city: slug, name: list[0].city.name, onSite, onSiteGoal, master: t.metal === 'gold' && onSiteGoal > 0 && onSite >= onSiteGoal };
  });
  return { overall, cities };
}
