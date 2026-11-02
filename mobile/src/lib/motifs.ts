// Which line drawing stands in for a work without a photo (components/brand/motifs.tsx draws them). The same rule as
// the web's frontend/src/lib/motifs.ts buildingFor: the backend's type code first, then a word of the type's name.
import { normalize } from './passport';

export const BUILDING_IDS = ['mosque', 'complex', 'masjid', 'madrasa', 'tomb', 'imaret', 'bath', 'fountain', 'han', 'bedesten',
  'zawiya', 'graveyard', 'bridge', 'library', 'church', 'house', 'arch'] as const;
export type BuildingId = typeof BUILDING_IDS[number];

// the backend's codes that differ from a drawing's name (backend/pipeline/finalize.py KIND_RULES)
const CODE_ALIASES: Record<string, BuildingId> = { tekke: 'zawiya' };

const KIND_WORDS: [RegExp, BuildingId][] = [
  [/kulliye|complex/, 'complex'], [/mescit|mescid|masjid/, 'masjid'], [/cami|mosque/, 'mosque'], [/medrese|madrasa|darussifa/, 'madrasa'],
  [/turbe|kumbet|tomb/, 'tomb'], [/imaret/, 'imaret'], [/hamam|bath/, 'bath'], [/cesme|sebil|fountain/, 'fountain'],
  [/kervansaray|caravanserai|\bhan\b|han$|inn/, 'han'], [/bedesten|arasta|carsi/, 'bedesten'], [/zaviye|zawiya|tekke|dergah/, 'zawiya'],
  [/hazire|mezar|graveyard/, 'graveyard'], [/kopru|bridge/, 'bridge'], [/kutuphane|library/, 'library'], [/kilise|church/, 'church'],
  [/ev$|konak|house/, 'house'],
];

/** The drawing for a work: its type code ('mosque', 'tekke'…), else a word of its type name ('Cami ve Darüşşifa'),
 *  else the plain arch. */
export function buildingFor(work: { kind?: string | null; kind_label?: string | null }): BuildingId {
  const code = work.kind ?? '';
  if ((BUILDING_IDS as readonly string[]).includes(code)) return code as BuildingId;
  if (CODE_ALIASES[code]) return CODE_ALIASES[code];
  const name = normalize(work.kind_label ?? '');
  return KIND_WORDS.find(([re]) => re.test(name))?.[1] ?? 'arch';
}
