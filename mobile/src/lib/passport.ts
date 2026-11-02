// The heritage passport. The shape is the site's Progress (frontend/src/lib/progress.ts, key esik:passport:v1), so
// an account can later merge both; the phone adds two fields the site does not have:
//   visits: works stamped on the spot (the phone was near the work), {slug: {date, approximate}}
//   days:   the local days (YYYY-MM-DD) with at least one discovery, for the discovery streak
//   notebook: Keşif Defteri labels per work; each keeps its last change, so one removed on a phone stays removed
//   recall: Hatırla cards, see recall.ts
//   read:   works whose story was really read or heard (75%), {slug: date}; a stamp by button or on the spot is not this
//   hunt:   Detay Avı tries per day; two devices are one player, so tries never come back
import type { GameKind, GameLevel } from './games';
import { t } from './i18n';

export type Visit = { date: string; approximate: boolean };
export type NotebookLabel = 'interested' | 'learned' | 'want_to_go' | 'visited';
export const NOTEBOOK_LABELS: NotebookLabel[] = ['interested', 'learned', 'want_to_go', 'visited'];
export type NotebookMark = { on: boolean; at: string };
export type Notebook = Record<string, Partial<Record<NotebookLabel, NotebookMark>>>;
export type RecallState = { step: number; due: string | null; first: boolean; last: string; at: string };
// work: known once the game has ended and the answer opened; the work's Hatırla card counts from then (recall.ts)
export type HuntState = { attempts: number; solved: boolean; at: string; wrong: number[]; work?: string };
export type Progress = {
  version: 1;
  discovered: Record<string, string>;
  favorites: string[];
  quiz: { completed: number; best: number };
  games: { puzzle: Record<string, Record<string, number>>; detective: Record<string, Record<string, number>> };
  answered: string[];
  visits: Record<string, Visit>;
  days: string[];
  notebook: Notebook;
  recall: Record<string, RecallState>;
  read: Record<string, string>;
  hunt: Record<string, HuntState>;
};
export const STORAGE_KEY = 'esik:passport:v1';
export const emptyProgress = (): Progress => ({ version: 1, discovered: {}, favorites: [], quiz: { completed: 0, best: 0 },
  games: { puzzle: {}, detective: {} }, answered: [], visits: {}, days: [], notebook: {}, recall: {}, read: {}, hunt: {} });

const isDate = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const strings = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
const record = (v: unknown) => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** Saved text → Progress; anything malformed is dropped rather than trusted. */
export function parseProgress(value: string | null): Progress {
  if (!value) return emptyProgress();
  try {
    const data = JSON.parse(value);
    if (data?.version !== 1) return emptyProgress();
    const p = emptyProgress();
    for (const [id, date] of Object.entries(record(data.discovered))) if (isDate(date)) p.discovered[id] = date;
    for (const [id, date] of Object.entries(record(data.read))) if (isDate(date)) p.read[id] = date;
    for (const [id, v] of Object.entries(record(data.visits))) {
      const visit = record(v);
      if (isDate(visit.date)) p.visits[id] = { date: visit.date, approximate: visit.approximate === true };
    }
    p.favorites = strings(data.favorites);
    p.answered = strings(data.answered);
    p.days = strings(data.days).filter(d => isDay(d)).sort();
    for (const [slug, labels] of Object.entries(record(data.notebook))) {
      const kept: Notebook[string] = {};
      for (const label of NOTEBOOK_LABELS) {
        const mark = record(record(labels)[label]);
        if (typeof mark.on === 'boolean' && isDate(mark.at)) kept[label] = { on: mark.on, at: mark.at };
      }
      if (Object.keys(kept).length) p.notebook[slug] = kept;
    }
    for (const [id, v] of Object.entries(record(data.recall))) {
      const c = record(v);
      if (Number.isSafeInteger(c.step) && isDay(c.last) && isDate(c.at) && (c.due === null || isDay(c.due))) p.recall[id] = { step: c.step as number, due: c.due as string | null, first: c.first === true, last: c.last as string, at: c.at as string };
    }
    for (const [day, v] of Object.entries(record(data.hunt))) {
      const h = record(v);
      if (isDay(day) && Number.isSafeInteger(h.attempts) && (h.attempts as number) >= 0 && isDate(h.at)) p.hunt[day] = { attempts: h.attempts as number, solved: h.solved === true, at: h.at as string, wrong: Array.isArray(h.wrong) ? h.wrong.filter((x): x is number => Number.isSafeInteger(x)) : [] , ...(typeof h.work === 'string' && h.work ? { work: h.work } : {}) };
    }
    const quiz = record(data.quiz);
    p.quiz = { completed: Number.isSafeInteger(quiz.completed) ? Math.max(0, quiz.completed as number) : 0,
      best: Number.isFinite(quiz.best) ? Math.min(100, Math.max(0, quiz.best as number)) : 0 };
    p.games = { puzzle: record(record(data.games).puzzle) as Progress['games']['puzzle'], detective: record(record(data.games).detective) as Progress['games']['detective'] };
    return p;
  } catch { return emptyProgress(); }
}

/** Two devices' passports, by the server's rules (backend/pipeline/users.py merge_progress): discoveries, visits
 *  and favourites are joined (the first date stays), the best scores are kept, the streak days are joined. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const earlier = (x?: string, y?: string) => (!x ? y! : !y ? x : x < y ? x : y);
  const discovered: Progress['discovered'] = {};
  for (const slug of new Set([...Object.keys(a.discovered), ...Object.keys(b.discovered)])) discovered[slug] = earlier(a.discovered[slug], b.discovered[slug]);
  const read: Progress['read'] = {};
  for (const slug of new Set([...Object.keys(a.read), ...Object.keys(b.read)])) read[slug] = earlier(a.read[slug], b.read[slug]);
  const visits: Progress['visits'] = {};
  for (const slug of new Set([...Object.keys(a.visits), ...Object.keys(b.visits)])) {
    const [x, y] = [a.visits[slug], b.visits[slug]];
    visits[slug] = !x ? y : !y ? x : x.date <= y.date ? x : y;
  }
  const games = { puzzle: {}, detective: {} } as Progress['games'];
  for (const game of ['puzzle', 'detective'] as const) {
    for (const slug of new Set([...Object.keys(a.games[game]), ...Object.keys(b.games[game])])) {
      const levels: Record<string, number> = {};
      for (const src of [a.games[game][slug] ?? {}, b.games[game][slug] ?? {}]) for (const [lvl, n] of Object.entries(src)) levels[lvl] = Math.min(n, levels[lvl] ?? n);
      games[game][slug] = levels;
    }
  }
  const notebook: Notebook = {};
  for (const slug of new Set([...Object.keys(a.notebook), ...Object.keys(b.notebook)])) {
    const kept: Notebook[string] = {};
    for (const label of NOTEBOOK_LABELS) {
      const [x, y] = [a.notebook[slug]?.[label], b.notebook[slug]?.[label]];
      const mark = !x ? y : !y ? x : x.at >= y.at ? x : y;
      if (mark) kept[label] = mark;
    }
    notebook[slug] = kept;
  }
  const recall: Progress['recall'] = {};
  for (const id of new Set([...Object.keys(a.recall), ...Object.keys(b.recall)])) {
    const [x, y] = [a.recall[id], b.recall[id]];
    // the last answer decides the schedule; the first attempt counts as right only if it was right on both devices
    recall[id] = !x ? y : !y ? x : { ...(x.at >= y.at ? x : y), first: x.first && y.first };
  }
  const hunt: Progress['hunt'] = {};
  for (const day of new Set([...Object.keys(a.hunt), ...Object.keys(b.hunt)])) {
    const [x, y] = [a.hunt[day], b.hunt[day]];
    const work = x?.work ?? y?.work;
    hunt[day] = !x ? y : !y ? x : { attempts: Math.max(x.attempts, y.attempts), solved: x.solved || y.solved, at: earlier(x.at, y.at), wrong: [...new Set([...x.wrong, ...y.wrong])].sort(), ...(work ? { work } : {}) };
  }
  return { version: 1, discovered, visits, games, notebook, recall, read, hunt,
    favorites: [...new Set([...a.favorites, ...b.favorites])], answered: [...new Set([...a.answered, ...b.answered])],
    quiz: { completed: Math.max(a.quiz.completed, b.quiz.completed), best: Math.max(a.quiz.best, b.quiz.best) },
    days: [...new Set([...a.days, ...b.days])].sort().slice(-400) };
}

/** A comparable form: the same passport gives the same text whatever the order of its keys and lists. */
export function canonical(p: Progress): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? [...v].map(sort).sort() as unknown[]
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(p));
}

/** The device's local day, YYYY-MM-DD. */
export function dayKey(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export const addDays = (key: string, n: number) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };

const withDay = (p: Progress, now: Date) => p.days.includes(dayKey(now)) ? p.days : [...p.days, dayKey(now)].slice(-400);

/** A digital discovery. Only a verified one (the story was really read or heard) also keeps today in the streak. */
export function discover(p: Progress, slug: string, now = new Date(), verified = true): Progress {
  const days = verified ? withDay(p, now) : p.days;
  if (p.discovered[slug] && days === p.days) return p;
  return { ...p, discovered: p.discovered[slug] ? p.discovered : { ...p.discovered, [slug]: now.toISOString() }, days };
}

/** The story was really read or heard. The first date stays. */
export function markRead(p: Progress, slug: string, now = new Date()): Progress {
  return p.read[slug] ? p : { ...p, read: { ...p.read, [slug]: now.toISOString() } };
}

/** A finished mini game: the best (lowest) result per work and level stays. No stamp, no visit, no day in the rhythm. */
export function recordGame(p: Progress, game: GameKind, slug: string, level: GameLevel, result: number): Progress {
  const held = p.games[game][slug]?.[level];
  if (held !== undefined && held <= result) return p;
  return { ...p, games: { ...p.games, [game]: { ...p.games[game], [slug]: { ...p.games[game][slug], [level]: result } } } };
}

/** A question answered right; a quest's step counts it even when the round is left unfinished, as on the site. */
export function answerRight(p: Progress, slug: string): Progress {
  return p.answered.includes(slug) ? p : { ...p, answered: [...p.answered, slug] };
}

/** A guess in the day's Detay Avı. Tries only go up, a found task stays found, a wrong option stays crossed out. */
/** The work the day's task turned out to be about, noted when the answer opens. */
export function noteHuntWork(p: Progress, day: string, slug: string): Progress {
  const held = p.hunt[day];
  return !held || held.work === slug ? p : { ...p, hunt: { ...p.hunt, [day]: { ...held, work: slug } } };
}

export function recordHunt(p: Progress, day: string, attempts: number, solved: boolean, wrong: number | null = null, now = new Date()): Progress {
  const held = p.hunt[day];
  const crossed = wrong === null ? held?.wrong ?? [] : [...new Set([...(held?.wrong ?? []), wrong])].sort();
  return { ...p, hunt: { ...p.hunt, [day]: { attempts: Math.max(attempts, held?.attempts ?? 0), solved: solved || Boolean(held?.solved), at: held?.at ?? now.toISOString(), wrong: crossed } } };
}

/** An on-the-spot stamp; it counts as a discovery too. */
export function visit(p: Progress, slug: string, approximate: boolean, now = new Date()): Progress {
  const found = discover(p, slug, now);
  if (p.visits[slug]) return found;
  return { ...found, visits: { ...found.visits, [slug]: { date: now.toISOString(), approximate } } };
}

/** A qualifying action other than a stamp (a Hatırla card answered) keeps today in the streak. */
export function keepDay(p: Progress, now = new Date()): Progress {
  const days = withDay(p, now);
  return days === p.days ? p : { ...p, days };
}

export const hasLabel = (p: Progress, slug: string, label: NotebookLabel) => Boolean(p.notebook[slug]?.[label]?.on);

/** Sets or clears a Keşif Defteri label. "Öğrendim" never implies "Ziyaret ettim": each label is on its own. */
export function setLabel(p: Progress, slug: string, label: NotebookLabel, on: boolean, now = new Date()): Progress {
  if (hasLabel(p, slug, label) === on) return p;
  return { ...p, notebook: { ...p.notebook, [slug]: { ...p.notebook[slug], [label]: { on, at: now.toISOString() } } } };
}

export function toggleFavorite(p: Progress, slug: string): Progress {
  return { ...p, favorites: p.favorites.includes(slug) ? p.favorites.filter(s => s !== slug) : [...p.favorites, slug] };
}

/** A finished quiz round: the count, the best score (percent) and the works with a question answered right; a right
 *  answer keeps the streak too. */
export function recordQuiz(p: Progress, score: number, rightAbout: string[], now = new Date()): Progress {
  return { ...p, days: rightAbout.length ? withDay(p, now) : p.days, quiz: { completed: p.quiz.completed + 1, best: Math.max(p.quiz.best, Math.min(100, Math.max(0, Math.round(score)))) },
    answered: [...new Set([...p.answered, ...rightAbout])] };
}

/** Metres between two points (haversine). */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (n: number) => n * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/** How near counts as "on the spot": 150 m, plus the uncertainty circle when the location is approximate. */
export const STAMP_RADIUS_M = 150;
export const stampRadius = (loc: { approximate: boolean; radius_m: number | null }) => STAMP_RADIUS_M + (loc.approximate ? loc.radius_m ?? 350 : 0);

/** For search: case and Turkish letters folded (İ/ı → i, ç → c, …). */
export const normalize = (value: string) => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

export const formatDistance = (m: number) => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString(undefined, { maximumFractionDigits: m < 10000 ? 1 : 0 })} km`;

export type Medal = { id: string; name: string; description: string; required: number; value: number; metal: 'bronze' | 'silver' | 'gold'; mobile?: boolean };
const hardOne = (records: Record<string, Record<string, number>>) => Object.values(records).some(best => best.zor !== undefined) ? 1 : 0;

/** The site's medallions (frontend/src/lib/progress.ts, a test compares them), then the phone's own. */
export function medals(p: Progress, items: { slug: string; city: { slug: string } }[]): Medal[] {
  const found = items.filter(a => p.discovered[a.slug]);
  const cities = new Set(found.map(a => a.city.slug)).size;
  const visits = Object.keys(p.visits).length;
  const best = longestStreak(p.days);
  return [
    { id: 'first', name: t('İlk Adım', 'First Step'), description: t('İlk eserinin hikâyesini keşfet ve pasaportuna mühürle.', 'Discover the story of your first work and stamp it in your passport.'), required: 1, value: found.length, metal: 'bronze' },
    { id: 'architect', name: t('Mimari Kâşif', 'Architecture Explorer'), description: t('Üç farklı mimari eseri keşfet.', 'Discover three different works of architecture.'), required: 3, value: found.length, metal: 'silver' },
    { id: 'traveler', name: t('Tarih Yolcusu', 'History Traveller'), description: t('Beş eserin hikâyesini pasaportunda biriktir.', 'Collect the stories of five works in your passport.'), required: 5, value: found.length, metal: 'gold' },
    { id: 'cities', name: t('Şehir Gezgini', 'City Wanderer'), description: t('Üç farklı şehirdeki eserleri keşfet.', 'Discover works in three different cities.'), required: 3, value: cities, metal: 'silver' },
    { id: 'guardian', name: t('Miras Koruyucusu', 'Heritage Guardian'), description: t('İlk koleksiyondaki altı eserin tamamını keşfet.', 'Discover all six works of the first collection.'), required: 6, value: found.length, metal: 'gold' },
    { id: 'quiz', name: t('Bilgi Avcısı', 'Knowledge Hunter'), description: t('Tarihin İzinde bilgi yarışmasının ilk turunu tamamla.', 'Complete your first round of the On the Trail of History quiz.'), required: 1, value: p.quiz.completed, metal: 'bronze' },
    { id: 'puzzler', name: t('Usta Eller', 'Master Hands'), description: t('Üç farklı eserin yapbozunu tamamla.', 'Complete the puzzles of three different works.'), required: 3, value: Object.keys(p.games.puzzle).length, metal: 'bronze' },
    { id: 'detective', name: t('Dosya Çözücü', 'File Solver'), description: t('Üç farklı eserin gizli dosyasını çöz.', 'Crack the secret files of three different works.'), required: 3, value: Object.keys(p.games.detective).length, metal: 'silver' },
    { id: 'sharp', name: t('Keskin Göz', 'Sharp Eye'), description: t('Zor seviyede bir yapbozu ve bir dosyayı tamamla.', 'Complete a puzzle and a file at the hard level.'), required: 2, value: hardOne(p.games.puzzle) + hardOne(p.games.detective), metal: 'gold' },
    { id: 'witness', name: t('Yerinde Tanık', 'On-the-Spot Witness'), description: t('Bir eserin önünde durup yerinde mühür bas.', 'Stand in front of a work and take its on-the-spot stamp.'), required: 1, value: visits, metal: 'bronze', mobile: true },
    { id: 'pilgrim', name: t('Eşik Gezgini', 'Threshold Walker'), description: t('Beş eseri yerinde ziyaret et.', 'Visit five works on the spot.'), required: 5, value: visits, metal: 'gold', mobile: true },
    { id: 'companion', name: t('Yol Arkadaşı', 'Travel Companion'), description: t('Yedi gün art arda en az bir eser keşfet.', 'Discover at least one work seven days in a row.'), required: 7, value: best, metal: 'silver', mobile: true },
  ];
}

export function longestStreak(days: string[]) {
  let best = 0, run = 0, prev = '';
  for (const d of [...new Set(days)].sort()) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}
