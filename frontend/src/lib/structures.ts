import type { Artifact } from '../data/artifacts';
import { buildingFor } from './motifs.ts';

// Keşfet's "Yapı kategorisi" filter: the types of work gathered by what the building was for (a mosque and a masjid are
// both places of worship). The type comes from motifs.ts, so a work without the backend's code is placed by its type's
// name. The phone keeps the same groups (mobile/src/lib/structures.ts).
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

export function structureOf(artifact: Pick<Artifact, 'kind' | 'category'>) {
  const kind = buildingFor(artifact);
  return STRUCTURE_GROUPS.find(g => g.kinds.includes(kind))?.id ?? 'diger';
}

/** [id, label] pairs for the groups the collection has, in the fixed order above. */
export function structureOptions(artifacts: readonly Pick<Artifact, 'kind' | 'category'>[], english = false): [string, string][] {
  const present = new Set(artifacts.map(structureOf));
  return STRUCTURE_GROUPS.filter(g => present.has(g.id)).map(g => [g.id, english ? g.en : g.tr]);
}
