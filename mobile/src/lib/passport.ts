// The heritage passport. The shape is the site's Progress (frontend/src/lib/progress.ts, key esik:passport:v1), so
// an account can later merge both; the phone adds two fields the site does not have:
//   visits: works stamped on the spot (the phone was near the work), {slug: {date, approximate}}
//   days:   the local days (YYYY-MM-DD) with at least one streak-keeping action (streak.ts)

export type Visit = { date: string; approximate: boolean };
export type Progress = {
  version: 1;
  discovered: Record<string, string>;
  favorites: string[];
  quiz: { completed: number; best: number };
  games: { puzzle: Record<string, Record<string, number>>; detective: Record<string, Record<string, number>> };
  answered: string[];
  visits: Record<string, Visit>;
  days: string[];
};
export const STORAGE_KEY = 'esik:passport:v1';
export const emptyProgress = (): Progress => ({ version: 1, discovered: {}, favorites: [], quiz: { completed: 0, best: 0 },
  games: { puzzle: {}, detective: {} }, answered: [], visits: {}, days: [] });

const isDate = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
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
    for (const [id, v] of Object.entries(record(data.visits))) {
      const visit = record(v);
      if (isDate(visit.date)) p.visits[id] = { date: visit.date, approximate: visit.approximate === true };
    }
    p.favorites = strings(data.favorites);
    p.answered = strings(data.answered);
    p.days = strings(data.days).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
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
  return { version: 1, discovered, visits, games,
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
const withDay = (p: Progress, now: Date) => p.days.includes(dayKey(now)) ? p.days : [...p.days, dayKey(now)].slice(-400);

/** Today counts for the streak (a stamp, a right answer, a solved puzzle, a review session…). */
export function markActiveDay(p: Progress, now: Date): Progress {
  const days = withDay(p, now);
  return days === p.days ? p : { ...p, days };
}

/** A digital discovery (the story was read); also keeps today in the streak. */
export function discover(p: Progress, slug: string, now = new Date()): Progress {
  const days = withDay(p, now);
  if (p.discovered[slug] && days === p.days) return p;
  return { ...p, discovered: p.discovered[slug] ? p.discovered : { ...p.discovered, [slug]: now.toISOString() }, days };
}

/** An on-the-spot stamp; it counts as a discovery too. */
export function visit(p: Progress, slug: string, approximate: boolean, now = new Date()): Progress {
  const found = discover(p, slug, now);
  if (p.visits[slug]) return found;
  return { ...found, visits: { ...found.visits, [slug]: { date: now.toISOString(), approximate } } };
}

export function toggleFavorite(p: Progress, slug: string): Progress {
  return { ...p, favorites: p.favorites.includes(slug) ? p.favorites.filter(s => s !== slug) : [...p.favorites, slug] };
}

/** A finished quiz round: the count, the best score (percent) and the works with a question answered right; a right
 *  answer keeps the streak too. */
export function recordQuiz(p: Progress, score: number, rightAbout: string[], now: Date): Progress {
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
