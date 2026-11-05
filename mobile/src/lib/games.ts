// Rules for the two mini games (Kayıp Parçalar, Miras Dedektifi), the same as the site's (frontend/src/lib/games.ts; a
// test compares the two). Free of React and of the phone, so they can be tested. A work gives only what its record says:
// a clue it has no data for is simply not there.
import type { Item } from './api';
import { currentLang, t } from './i18n';

export type GameKind = 'puzzle' | 'detective';
export type GameLevel = 'kolay' | 'orta' | 'zor';
export const GAME_LEVELS: GameLevel[] = ['kolay', 'orta', 'zor'];
export const isGameLevel = (value: unknown): value is GameLevel => GAME_LEVELS.includes(value as GameLevel);
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
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
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

export type GameWork = { id: string; name: string; city: string; period: string; category: string; year: string | null; architect: string | null; coordinates: [number, number] | null };
export const toGameWork = (item: Item): GameWork => ({ id: item.slug, name: item.name, city: item.city.name, period: item.period?.name ?? t('Dönemi belirtilmemiş', 'Era not given'), category: item.kind_label,
  year: item.built.label, architect: item.architect?.trim() || item.builder?.trim() || null, coordinates: item.location ? [item.location.lat, item.location.lon] : null });

export type ClueKind = 'era' | 'region' | 'architect' | 'place';
export type Clue = { kind: ClueKind; label: string; text: string };
// The site's list also has a chapter and an architectural detail, which only its hand-written works carry; the
// backend's records do not, so here as there those clues never appear. Kolay names the city; the harder levels never do.
const clueOrder: Record<GameLevel, ClueKind[]> = {
  kolay: ['era', 'place'],
  orta: ['era', 'architect'],
  zor: ['era', 'region', 'architect'],
};
const known = (value: string | null | undefined): value is string => Boolean(value && value.trim() && !/^(bilinmiyor|unknown)$/i.test(value.trim()));

export const clueCount = (level: GameLevel) => clueOrder[level].length;

export function centuryOf(year: string | null | undefined) {
  const found = year?.match(/\d{3,4}/);
  return found ? Math.floor((Number(found[0]) - 1) / 100) + 1 : null;
}
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const centuryName = (n: number) => t(`${n}. yüzyıl`, `${ordinal(n)} century`);
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
export function revealingWords(work: Pick<GameWork, 'name' | 'city'>, withCity: boolean) {
  const words = (text: string) => lower(text).split(/[^\p{L}\p{N}]+/u).filter(word => word.length >= 4 && !generic.has(word));
  const city = words(work.city);
  // The city clue keeps its city even when the name contains it ("Bursa Yeşil Külliye").
  return new Set([...words(work.name).filter(word => withCity || !city.includes(word)), ...(withCity ? city : [])]);
}
// Replaces each revealing word, with any suffix after an apostrophe, by "[gizli]": "Edirne'ye bir armağan" → "[gizli] bir armağan".
export function maskNames(text: string, work: Pick<GameWork, 'name' | 'city'>, withCity = true) {
  const hidden = revealingWords(work, withCity);
  return text.replace(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu, token => hidden.has(lower(token.split(/['’]/)[0])) ? t('[gizli]', '[hidden]') : token);
}

function clueFacts(work: GameWork): Partial<Record<ClueKind, { label: string; text: string }>> {
  const century = centuryOf(work.year);
  const region = regionOf(work.coordinates);
  return {
    era: { label: century ? t('Yüzyıl ve tür', 'Century and type') : t('Tür', 'Type'), text: century ? `${centuryName(century)} · ${work.category}` : work.category },
    region: region ? { label: t('Bölge', 'Region'), text: region } : undefined,
    architect: known(work.architect) ? { label: t('Usta', 'Master'), text: work.architect } : undefined,
    place: { label: known(work.architect) ? t('Şehir ve usta', 'City and master') : t('Şehir', 'City'), text: known(work.architect) ? `${work.city} · ${work.architect}` : work.city },
  };
}
// Kolay keeps the first clue plain: "Klasik Osmanlı · Cami · 1568–1575".
function kolayEra(work: GameWork) {
  return { label: t('Dönem ve tür', 'Era and type'), text: [work.period, work.category, known(work.year) ? work.year : ''].filter(Boolean).join(' · ') };
}

export function detectiveClues(work: GameWork, level: GameLevel): Clue[] {
  const facts = clueFacts(work);
  return clueOrder[level].flatMap(kind => {
    const fact = level === 'kolay' && kind === 'era' ? kolayEra(work) : facts[kind];
    if (!fact) return [];
    // The city clue may name the city; no clue may name the work.
    return [{ kind, label: fact.label, text: maskNames(fact.text, work, kind !== 'place') }];
  });
}
// A work can be the mystery only when it yields at least two clues at this level.
export const canBeMystery = (work: GameWork, level: GameLevel) => detectiveClues(work, level).length >= 2;

// Once every clue is open, the mystery must differ from an option in at least one of them, so each round can be reasoned out.
export function cluesDistinguish(mystery: GameWork, other: GameWork, level: GameLevel) {
  const a = clueFacts(mystery);
  const b = clueFacts(other);
  return clueOrder[level].some(kind => (level === 'kolay' && kind === 'era' ? kolayEra(mystery).text !== kolayEra(other).text : a[kind]?.text !== b[kind]?.text));
}
export function similarity(a: GameWork, b: GameWork) {
  return (known(a.architect) && a.architect === b.architect ? 2 : 0) + (a.period === b.period ? 1 : 0) + (a.category === b.category ? 1 : 0) + (a.city === b.city ? 1 : 0);
}
// Kolay draws distractors at random; Orta and Zor take the most similar works, so the clues have to be read.
export function pickOptions(mystery: GameWork, works: readonly GameWork[], level: GameLevel, random: Random = Math.random) {
  const others = shuffle(works.filter(a => a.id !== mystery.id && cluesDistinguish(mystery, a, level)), random);
  const ranked = level === 'kolay' ? others : [...others].sort((a, b) => similarity(mystery, b) - similarity(mystery, a));
  return shuffle([mystery, ...ranked.slice(0, detectiveOptions[level] - 1)], random);
}
// Cost of a solved case: clues opened plus wrong guesses.
export const detectiveStars = (cost: number) => cost <= 1 ? 3 : cost <= 3 ? 2 : 1;
