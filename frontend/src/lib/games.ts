import type { DiscoveryArtifact } from './artifactContract';
import { centuryName, currentLang, t } from './i18n.ts';

// Rules for the two mini games (Kayıp Parçalar, Miras Dedektifi), kept free of React so they can be tested.
// See oyun/oyunlar.md for the design.
export type GameKind = 'puzzle' | 'detective';
export type GameLevel = 'kolay' | 'orta' | 'zor';
// Artifact id → level → best result (fewest moves, or lowest clue + guess cost).
export type GameRecords = Record<string, Partial<Record<GameLevel, number>>>;
export const gameLevels = [['kolay', 'Kolay'], ['orta', 'Orta'], ['zor', 'Zor']] as const;
export const isGameLevel = (value: unknown): value is GameLevel => gameLevels.some(([level]) => level === value);
export const levelName = (level: GameLevel) => level === 'kolay' ? t('Kolay', 'Easy') : level === 'orta' ? t('Orta', 'Medium') : t('Zor', 'Hard');
export const nextLevel = (level: GameLevel): GameLevel | undefined => ({ kolay: 'orta', orta: 'zor', zor: undefined } as const)[level];
export const puzzleSize: Record<GameLevel, number> = { kolay: 3, orta: 4, zor: 5 };
export const detectiveOptions: Record<GameLevel, number> = { kolay: 4, orta: 5, zor: 6 };

export type Random = () => number;
// Small seeded generator (mulberry32), so a test can replay the same rounds.
export function seeded(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(items: readonly T[], random: Random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

// Prefers what has not been solved yet at this level, and never repeats the previous pick when there is a choice.
export function pickNext<T extends { id: string }>(items: readonly T[], solved: (item: T) => boolean, previous?: T, random: Random = Math.random): T | undefined {
  const fresh = items.filter(item => !solved(item));
  const pool = fresh.length ? fresh : items;
  const choices = pool.length > 1 ? pool.filter(item => item.id !== previous?.id) : pool;
  return shuffle(choices, random)[0];
}

/* Kayıp Parçalar */

// order[position] is the piece shown there; piece k belongs at position k.
export const inPlace = (order: readonly number[]) => order.filter((piece, i) => piece === i).length;
// At most half of the pieces start in place, and the board never starts solved.
export function scramble(size: number, random: Random = Math.random) {
  const count = size * size;
  let order: number[];
  do order = shuffle([...Array(count).keys()], random); while (inPlace(order) > Math.floor(count / 2) || inPlace(order) === count);
  return order;
}
// The fewest swaps that solve the board: pieces minus cycles of the permutation.
export function minSwaps(order: readonly number[]) {
  const seen = new Array<boolean>(order.length).fill(false);
  let cycles = 0;
  for (let i = 0; i < order.length; i++) {
    if (seen[i]) continue;
    cycles++;
    for (let j = i; !seen[j]; j = order[j]) seen[j] = true;
  }
  return order.length - cycles;
}
export const puzzleStars = (moves: number, least: number, size: number) => moves <= least ? 3 : moves <= least + size ? 2 : 1;

/* Miras Dedektifi */

export type ClueKind = 'era' | 'detail' | 'chapter' | 'region' | 'architect' | 'place';
export type Clue = { kind: ClueKind; label: string; text: string };
// Kolay keeps the original three clues; the harder levels never name the city and start vaguer.
const clueOrder: Record<GameLevel, ClueKind[]> = {
  kolay: ['era', 'detail', 'place'],
  orta: ['era', 'detail', 'chapter', 'architect'],
  zor: ['era', 'chapter', 'detail', 'region', 'architect'],
};
const known = (value: string | null | undefined): value is string => Boolean(value && value.trim() && !/^(bilinmiyor|unknown)$/i.test(value.trim()));

export const clueCount = (level: GameLevel) => clueOrder[level].length;

export function centuryOf(year: string | null | undefined) {
  const found = year?.match(/\d{3,4}/);
  return found ? Math.floor((Number(found[0]) - 1) / 100) + 1 : null;
}
// Direction from the middle of Türkiye (about 39° N, 35° E), in words.
export function regionOf(coordinates: [number, number] | null) {
  if (!coordinates) return null;
  const [lat, lng] = coordinates;
  const ns = lat - 39 > 1 ? 'north' : lat - 39 < -1 ? 'south' : '', ew = lng - 35 < -3 ? 'west' : lng - 35 > 3 ? 'east' : '';
  if (currentLang() === 'en') return ns || ew ? `In the ${[ns, ew].filter(Boolean).join('-')} of Türkiye` : 'In central Türkiye';
  const direction = (lat - 39 > 1 ? 'kuzey' : lat - 39 < -1 ? 'güney' : '') + (lng - 35 < -3 ? 'batı' : lng - 35 > 3 ? 'doğu' : '');
  if (!direction) return 'Türkiye\'nin iç kesimlerinde';
  const ending = direction.endsWith('batı') ? 'sında' : direction.endsWith('doğu') ? 'sunda' : 'inde';
  return `Türkiye'nin ${direction}${ending}`;
}

// Words that would give the answer away: the distinctive words of the name, and the city unless it is the clue.
// Generic building words ("Camii", "Külliyesi") stay, otherwise a category such as "Külliye" would be hidden too.
const generic = new Set(['cami', 'camii', 'külliye', 'külliyesi', 'darüşşifa', 'darüşşifası', 'medrese', 'medresesi', 'türbe', 'türbesi', 'han', 'hanı', 'hamam', 'hamamı', 'çeşme', 'çeşmesi', 'köprü', 'köprüsü', 'ulu', 'sultan', 'paşa']);
const lower = (text: string) => text.toLocaleLowerCase('tr-TR');
export function revealingWords(artifact: Pick<DiscoveryArtifact, 'name' | 'city'>, withCity: boolean) {
  const words = (text: string) => lower(text).split(/[^\p{L}\p{N}]+/u).filter(word => word.length >= 4 && !generic.has(word));
  const city = words(artifact.city);
  // The city clue keeps its city even when the name contains it ("Bursa Yeşil Külliye").
  return new Set([...words(artifact.name).filter(word => withCity || !city.includes(word)), ...(withCity ? city : [])]);
}
// Replaces each revealing word, with any suffix after an apostrophe, by "[gizli]": "Edirne'ye bir armağan" → "[gizli] bir armağan".
export function maskNames(text: string, artifact: Pick<DiscoveryArtifact, 'name' | 'city'>, withCity = true) {
  const hidden = revealingWords(artifact, withCity);
  return text.replace(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu, token => hidden.has(lower(token.split(/['’]/)[0])) ? t('[gizli]', '[hidden]') : token);
}

function clueFacts(artifact: DiscoveryArtifact): Partial<Record<ClueKind, { label: string; text: string }>> {
  const century = centuryOf(artifact.year);
  const region = regionOf(artifact.coordinates);
  const detail = artifact.detail?.title ?? artifact.chapters[2]?.title;
  const chapter = artifact.chapters[1]?.title ?? artifact.chapters[0]?.title;
  return {
    era: { label: century ? t('Yüzyıl ve tür', 'Century and type') : t('Tür', 'Type'), text: century ? `${centuryName(century)} · ${artifact.category}` : artifact.category },
    detail: detail ? { label: t('Mimari ayrıntı', 'Architectural detail'), text: detail } : undefined,
    chapter: chapter ? { label: t('Hikâyeden bir bölüm', 'A part of the story'), text: chapter } : undefined,
    region: region ? { label: t('Bölge', 'Region'), text: region } : undefined,
    architect: known(artifact.architect) ? { label: 'Usta', text: artifact.architect } : undefined,
    place: { label: known(artifact.architect) ? t('Şehir ve usta', 'City and master') : t('Şehir', 'City'), text: known(artifact.architect) ? `${artifact.city} · ${artifact.architect}` : artifact.city },
  };
}
// Kolay keeps the first clue as it was: "Klasik Osmanlı · Cami · 1568–1575".
function kolayEra(artifact: DiscoveryArtifact) {
  return { label: t('Dönem ve tür', 'Era and type'), text: [artifact.period, artifact.category, known(artifact.year) ? artifact.year : ''].filter(Boolean).join(' · ') };
}

export function detectiveClues(artifact: DiscoveryArtifact, level: GameLevel): Clue[] {
  const facts = clueFacts(artifact);
  return clueOrder[level].flatMap(kind => {
    const fact = level === 'kolay' && kind === 'era' ? kolayEra(artifact) : facts[kind];
    if (!fact) return [];
    // The city clue may name the city; no clue may name the artifact.
    return [{ kind, label: fact.label, text: maskNames(fact.text, artifact, kind !== 'place') }];
  });
}
// An artifact can be the mystery only when it yields at least two clues at this level.
export const canBeMystery = (artifact: DiscoveryArtifact, level: GameLevel) => detectiveClues(artifact, level).length >= 2;

// Once every clue is open, the mystery must differ from an option in at least one of them, so each round can be reasoned out.
export function cluesDistinguish(mystery: DiscoveryArtifact, other: DiscoveryArtifact, level: GameLevel) {
  const a = clueFacts(mystery);
  const b = clueFacts(other);
  return clueOrder[level].some(kind => (level === 'kolay' && kind === 'era' ? kolayEra(mystery).text !== kolayEra(other).text : a[kind]?.text !== b[kind]?.text));
}
export function similarity(a: DiscoveryArtifact, b: DiscoveryArtifact) {
  return (known(a.architect) && a.architect === b.architect ? 2 : 0) + (a.period === b.period ? 1 : 0) + (a.category === b.category ? 1 : 0) + (a.city === b.city ? 1 : 0);
}
// Kolay draws distractors at random; Orta and Zor take the most similar artifacts, so the clues have to be read.
export function pickOptions(mystery: DiscoveryArtifact, artifacts: readonly DiscoveryArtifact[], level: GameLevel, random: Random = Math.random) {
  const others = shuffle(artifacts.filter(a => a.id !== mystery.id && cluesDistinguish(mystery, a, level)), random);
  const ranked = level === 'kolay' ? others : [...others].sort((a, b) => similarity(mystery, b) - similarity(mystery, a));
  return shuffle([mystery, ...ranked.slice(0, detectiveOptions[level] - 1)], random);
}
// Cost of a solved case: clues opened plus wrong guesses.
export const detectiveStars = (cost: number) => cost <= 1 ? 3 : cost <= 3 ? 2 : 1;
