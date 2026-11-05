// "Tarihin İzinde" quiz, as on the site (frontend/src/lib/quiz.ts). The panel's written questions come first; the
// rest are built from the works' own records: the right answer is the work's value, the wrong ones are other works'
// values for the same field, never made up. A question needs at least three distinct choices, otherwise it is not asked.
import { makers, type Item, type QuizQuestion } from './api';
import { currentLang, t } from './i18n';
import { normalize } from './passport';
import { ROUND_SIZE } from './quizRound';

export type Random = () => number;
const MAX_OPTIONS = 4;
const MIN_OPTIONS = 3;

export function shuffle<T>(items: readonly T[], random: Random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

const known = (value: string | null | undefined): value is string => Boolean(value && value.trim() && !/^(bilinmiyor|unknown|dönemi belirtilmemiş)$/i.test(value.trim()));
const centuryOf = (year: string | null | undefined) => { const found = year?.match(/\d{3,4}/); return found ? Math.floor((Number(found[0]) - 1) / 100) + 1 : null; };
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const centuryName = (n: number) => t(`${n}. yüzyıl`, `${ordinal(n)} century`);

type Template = { kind: string; value: (a: Item) => string | null; question: (a: Item) => string; explanation: (a: Item, answer: string) => string };
const templates: Template[] = [
  { kind: 'city', value: a => known(a.city.name) ? a.city.name : null, question: a => t(`${a.name} hangi şehirde yer alır?`, `In which city is ${a.name}?`), explanation: (a, city) => t(`${a.name}, ${city} şehrindedir.`, `${a.name} is in ${city}.`) },
  { kind: 'architect', value: a => { const who = makers(a); return known(who) ? who : null; }, question: a => t(`${a.name} hangi mimarın ya da ustanın eseridir?`, `Which architect or master built ${a.name}?`), explanation: (a, who) => t(`Envanter kitabına göre ${a.name} eserinin mimarı ya da ustası ${who}.`, `According to the inventory book, the architect or master of ${a.name} is ${who}.`) },
  { kind: 'century', value: a => { const c = centuryOf(a.built.label); return c ? centuryName(c) : null; }, question: a => t(`${a.name} hangi yüzyıla tarihlenir?`, `To which century does ${a.name} date?`), explanation: (a, century) => t(`${a.name} için verilen tarih ${a.built.label}; bu, ${century}a denk gelir.`, `The date given for ${a.name} is ${a.built.label}, which falls in the ${century}.`) },
  { kind: 'period', value: a => known(a.period?.name) ? a.period!.name : null, question: a => t(`${a.name} hangi döneme aittir?`, `Which era does ${a.name} belong to?`), explanation: (a, period) => t(`Envanter kitabına göre ${a.name} eserinin dönemi: ${period}.`, `According to the inventory book, the era of ${a.name} is: ${period}.`) },
];

// Turkish lower-casing is slow and the same few values (cities, centuries, eras) come up thousands of times over the
// whole collection: each distinct value is normalised once
const keys = new Map<string, string>();
const keyOf = (value: string) => { let key = keys.get(value); if (key === undefined) { key = normalize(value); keys.set(value, key); } return key; };

function choices(correct: string, others: string[], random: Random) {
  const seen = new Set([keyOf(correct)]);
  const wrong: string[] = [];
  for (const value of shuffle(others, random)) {
    const key = keyOf(value);
    if (seen.has(key)) continue;
    seen.add(key); wrong.push(value);
    if (wrong.length === MAX_OPTIONS - 1) break;
  }
  if (wrong.length < MIN_OPTIONS - 1) return null;
  const options = shuffle([correct, ...wrong], random);
  return { options, answer: options.indexOf(correct) };
}

/** The questions about one work; the wrong choices come from the other works in `items`. */
export function questionsFor(item: Item, items: readonly Item[], random: Random = Math.random): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  for (const tpl of templates) {
    const correct = tpl.value(item);
    if (!correct) continue;
    const picked = choices(correct, items.filter(a => a.slug !== item.slug).map(tpl.value).filter((v): v is string => Boolean(v)), random);
    if (picked) out.push({ id: `veri:${tpl.kind}:${item.slug}`, question: tpl.question(item), ...picked, explanation: tpl.explanation(item, correct), artifactId: item.slug });
  }
  return out;
}

/** The same questions as questionsFor for every work, with each field read once per work instead of once per pair. */
export function generateQuestions(items: readonly Item[], random: Random = Math.random): QuizQuestion[] {
  const values = templates.map(tpl => items.map(tpl.value));
  return items.flatMap((item, i) => {
    const out: QuizQuestion[] = [];
    templates.forEach((tpl, k) => {
      const correct = values[k][i];
      if (!correct) return;
      const others = values[k].filter((v, j): v is string => j !== i && items[j].slug !== item.slug && Boolean(v));
      const picked = choices(correct, others, random);
      if (picked) out.push({ id: `veri:${tpl.kind}:${item.slug}`, question: tpl.question(item), ...picked, explanation: tpl.explanation(item, correct), artifactId: item.slug });
    });
    return out;
  });
}

// Bugün's cards, Hatırla and the notifications all ask for the same pool: it is built once per collection and language
let lastPool: { written: readonly QuizQuestion[]; items: readonly Item[]; lang: string; pool: QuizQuestion[] } | null = null;

export function quizPool(written: readonly QuizQuestion[], items: readonly Item[], random: Random = Math.random) {
  const lang = currentLang();
  if (random === Math.random && lastPool && lastPool.written === written && lastPool.items === items && lastPool.lang === lang) return lastPool.pool;
  const slugs = new Set(items.map(i => i.slug));
  const pool = [...written.filter(q => slugs.has(q.artifactId)), ...generateQuestions(items, random)];
  if (random === Math.random) lastPool = { written, items, lang, pool };
  return pool;
}

/** Different works where it can; with a focus the round opens with a question about it (a quest step links here). */
export function pickRound(pool: readonly QuizQuestion[], size = ROUND_SIZE, focus?: string, random: Random = Math.random) {
  const shuffled = shuffle(pool, random);
  const round: QuizQuestion[] = [];
  const covered = new Set<string>();
  const first = focus ? shuffled.find(q => q.artifactId === focus) : undefined;
  if (first) { round.push(first); covered.add(first.artifactId); }
  for (const q of shuffled) if (round.length < size && !covered.has(q.artifactId)) { round.push(q); covered.add(q.artifactId); }
  for (const q of shuffled) if (round.length < size && !round.includes(q)) round.push(q);
  return round;
}

/** Works the quiz can ask about (does not depend on the shuffle). */
export const answerable = (written: readonly QuizQuestion[], items: readonly Item[]) => new Set(quizPool(written, items).map(q => q.artifactId));
