import type { Artifact } from '../data/artifacts';
import { normalize } from './progress.ts';

// Which drawings accompany a work's story (components/StoryMotifs.tsx draws them): a building of its type and the
// ornaments of its era. Kept apart from the drawings so it can be tested without a browser.
export const BUILDING_IDS = ['mosque', 'complex', 'masjid', 'madrasa', 'tomb', 'imaret', 'bath', 'fountain', 'han', 'bedesten',
  'zawiya', 'graveyard', 'bridge', 'library', 'church', 'house', 'arch'];

// Which ornaments speak for an era. Matched on the backend's era code, then on the era's name (the built-in demo works).
const ERA_ORNAMENTS: [RegExp, string[]][] = [
  [/selcuk|beylik|karaman|esref|memluk|mengucek|danisment|artuk/, ['star', 'muqarnas', 'knot', 'palmette']],
  [/erken-osmanli|erken osmanli/, ['tile', 'masonry', 'palmette', 'star']],
  [/klasik|osmanli$|^osmanli/, ['tulip', 'cintamani', 'carnation', 'saz']],
  [/lale|batililasma|tanzimat|son donem|son-donem/, ['scroll', 'shell', 'vase', 'tulip']],
  [/bizans|haclilar|kilise/, ['cross', 'capital', 'laurel', 'knot']],
  [/roma|helenistik|ilk-cag|ilk cag|hitit|frig|tarih-oncesi/, ['capital', 'laurel', 'knot', 'star']],
  [/cumhuriyet|fransiz|hatay-devleti/, ['crescent', 'star', 'masonry', 'laurel']],
];
const DEFAULT_ORNAMENTS = ['star', 'tulip', 'knot', 'palmette'];

// The building drawn for a work: the backend's type code, else a word of the type's name ('Cami ve Darüşşifa' → mosque).
const KIND_WORDS: [RegExp, string][] = [
  [/kulliye|complex/, 'complex'], [/mescit|mescid|masjid/, 'masjid'], [/cami|mosque/, 'mosque'], [/medrese|madrasa|darussifa/, 'madrasa'],
  [/turbe|kumbet|tomb/, 'tomb'], [/imaret/, 'imaret'], [/hamam|bath/, 'bath'], [/cesme|sebil|fountain/, 'fountain'],
  [/kervansaray|han\b|han$|inn/, 'han'], [/bedesten|arasta|carsi/, 'bedesten'], [/zaviye|zawiya|tekke|dergah/, 'zawiya'],
  [/hazire|mezar|graveyard/, 'graveyard'], [/kopru|bridge/, 'bridge'], [/kutuphane|library/, 'library'], [/kilise|church/, 'church'], [/ev$|konak|house/, 'house'],
];
export function buildingFor(artifact: Pick<Artifact, 'kind' | 'category'>) {
  if (artifact.kind && BUILDING_IDS.includes(artifact.kind)) return artifact.kind;
  if (artifact.kind === 'tekke') return 'zawiya';
  const name = normalize(artifact.category ?? '');
  return KIND_WORDS.find(([re]) => re.test(name))?.[1] ?? 'arch';
}
export function ornamentsFor(artifact: Pick<Artifact, 'periodSlug' | 'period'>) {
  const keys = [artifact.periodSlug ?? '', normalize(artifact.period ?? '')];
  return ERA_ORNAMENTS.find(([re]) => keys.some(k => k && re.test(k)))?.[1] ?? DEFAULT_ORNAMENTS;
}

export type Scene = { left: string; right: string };
// The scenes that pass beside the text, one per paragraph: the building and an ornament of its era first, then the
// era's other ornaments and the portal in turn, so neighbouring scenes never repeat a drawing.
export function storyScenes(artifact: Pick<Artifact, 'kind' | 'category' | 'periodSlug' | 'period'>, count: number): Scene[] {
  const building = buildingFor(artifact), ornaments = ornamentsFor(artifact);
  const cycle: Scene[] = [
    { left: building, right: ornaments[0] }, { left: ornaments[1], right: 'arch' }, { left: ornaments[2], right: building },
    { left: 'arch', right: ornaments[3] }, { left: ornaments[0], right: ornaments[1] },
  ].map(s => building === 'arch' && s.left === s.right ? { ...s, right: ornaments[2] } : s);
  return Array.from({ length: Math.max(1, count) }, (_, i) => cycle[i % cycle.length]);
}

