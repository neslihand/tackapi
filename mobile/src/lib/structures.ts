// Keşfet's "Yapı kategorisi" chips: the types of work gathered by what the building was for. The site keeps the same
// groups (frontend/src/lib/structures.ts). Pure functions.
import type { Item } from './api';
import { t } from './i18n';

export const STRUCTURE_GROUPS: { id: string; tr: string; en: string; kinds: string[] }[] = [
  { id: 'ibadet', tr: 'İbadet yapıları', en: 'Places of worship', kinds: ['mosque', 'masjid', 'church', 'zawiya', 'tekke'] },
  { id: 'kulliye', tr: 'Külliyeler', en: 'Complexes', kinds: ['complex'] },
  { id: 'egitim', tr: 'Eğitim ve kültür', en: 'Learning and culture', kinds: ['madrasa', 'library'] },
  { id: 'kamu', tr: 'Hayır ve kamu yapıları', en: 'Charitable and public works', kinds: ['imaret', 'bath', 'fountain', 'bridge'] },
  { id: 'ticaret', tr: 'Ticaret yapıları', en: 'Trade buildings', kinds: ['han', 'bedesten'] },
  { id: 'mezar', tr: 'Türbe ve hazireler', en: 'Tombs and graveyards', kinds: ['tomb', 'graveyard'] },
  { id: 'sivil', tr: 'Sivil mimari', en: 'Civil architecture', kinds: ['house'] },
  { id: 'diger', tr: 'Diğer yapılar', en: 'Other buildings', kinds: [] },
];

export const structureOf = (kind: string) => STRUCTURE_GROUPS.find(g => g.kinds.includes(kind))?.id ?? 'diger';

/** [id, label] pairs for the groups present among the (city's) works, in the fixed order above. */
export function structureOptions(items: readonly Pick<Item, 'kind' | 'city'>[], city: string | null): [string, string][] {
  const present = new Set(items.filter(i => !city || i.city.slug === city).map(i => structureOf(i.kind)));
  return STRUCTURE_GROUPS.filter(g => present.has(g.id)).map(g => [g.id, t(g.tr, g.en)]);
}
