import { gameLevels, type GameKind, type GameLevel, type GameRecords } from './games.ts';
import { t } from './i18n.ts';

export type Progress = {
  version: 1;
  discovered: Record<string, string>;
  favorites: string[];
  quiz: { completed: number; best: number };
  // Added later without a version bump: saved data without them reads as no games played, no questions answered.
  games: Record<GameKind, GameRecords>;
  answered: string[]; // artifacts with at least one quiz question answered right (a quest step)
};
export const STORAGE_KEY = 'esik:passport:v1';
export const emptyProgress = (): Progress => ({ version: 1, discovered: {}, favorites: [], quiz: { completed: 0, best: 0 }, games: { puzzle: {}, detective: {} }, answered: [] });

function parseRecords(value: unknown, validIds: string[]): GameRecords {
  const records: GameRecords = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return records;
  for (const [id, entry] of Object.entries(value)) {
    if (!validIds.includes(id) || typeof entry !== 'object' || entry === null) continue;
    const best: Partial<Record<GameLevel, number>> = {};
    for (const [level] of gameLevels) {
      const result = (entry as Record<string, unknown>)[level];
      if (Number.isSafeInteger(result) && (result as number) >= 1 && (result as number) <= 999) best[level] = result as number;
    }
    if (Object.keys(best).length) records[id] = best;
  }
  return records;
}

export function parseProgress(value: string | null, validIds: string[]): Progress {
  if (!value) return emptyProgress();
  try {
    const data = JSON.parse(value);
    if (data.version !== 1) return emptyProgress();
    const discovered: Record<string, string> = {};
    for (const [id, date] of Object.entries(data.discovered || {})) {
      if (validIds.includes(id) && typeof date === 'string' && Number.isFinite(Date.parse(date))) discovered[id] = date;
    }
    const favorites = Array.isArray(data.favorites) ? [...new Set<string>(data.favorites.filter((id: unknown) => typeof id === 'string' && validIds.includes(id)))] : [];
    const completed = Number.isSafeInteger(data.quiz?.completed) && data.quiz.completed >= 0 ? data.quiz.completed : 0;
    const best = Number.isFinite(data.quiz?.best) ? Math.min(100, Math.max(0, data.quiz.best)) : 0;
    const answered = Array.isArray(data.answered) ? [...new Set<string>(data.answered.filter((id: unknown) => typeof id === 'string' && validIds.includes(id)))] : [];
    return { version: 1, discovered, favorites, quiz: { completed, best }, games: { puzzle: parseRecords(data.games?.puzzle, validIds), detective: parseRecords(data.games?.detective, validIds) }, answered };
  } catch { return emptyProgress(); }
}

export function discover(progress: Progress, id: string, date = new Date().toISOString()): Progress {
  if (progress.discovered[id]) return progress;
  return { ...progress, discovered: { ...progress.discovered, [id]: date } };
}

// Keeps the best result per artifact and level (lower is better); returns the same object when nothing improved.
export function recordGame(progress: Progress, game: GameKind, id: string, level: GameLevel, result: number): Progress {
  const previous = progress.games[game][id]?.[level];
  if (previous !== undefined && previous <= result) return progress;
  return { ...progress, games: { ...progress.games, [game]: { ...progress.games[game], [id]: { ...progress.games[game][id], [level]: result } } } };
}

export function distanceKm(a: [number, number], b: [number, number]) {
  const rad = (n: number) => n * Math.PI / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export const normalize = (value: string) => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');

const hard = (records: GameRecords) => Object.values(records).some(best => best.zor !== undefined) ? 1 : 0;
export const gameAchievements = ['puzzler', 'detective', 'sharp'];

export type Achievement = { id: string; name: string; description: string; required: number; value: number; metal: string; symbol: string };
export function achievements(progress: Progress, entries: { id: string; city: string }[]): Achievement[] {
  const count = entries.filter(a => progress.discovered[a.id]).length;
  const cities = new Set(entries.filter(a => progress.discovered[a.id]).map(a => a.city)).size;
  return [
    { id: 'first', name: t('İlk Adım', 'First Step'), description: t('İlk eserinin hikâyesini keşfet ve pasaportuna mühürle.', 'Discover the story of your first work and stamp it in your passport.'), required: 1, value: count, metal: 'bronze', symbol: 'door' },
    { id: 'architect', name: t('Mimari Kâşif', 'Architecture Explorer'), description: t('Üç farklı mimari eseri keşfet.', 'Discover three different works of architecture.'), required: 3, value: count, metal: 'silver', symbol: 'building' },
    { id: 'traveler', name: t('Tarih Yolcusu', 'History Traveller'), description: t('Beş eserin hikâyesini pasaportunda biriktir.', 'Collect the stories of five works in your passport.'), required: 5, value: count, metal: 'gold', symbol: 'compass' },
    { id: 'cities', name: t('Şehir Gezgini', 'City Wanderer'), description: t('Üç farklı şehirdeki eserleri keşfet.', 'Discover works in three different cities.'), required: 3, value: cities, metal: 'silver', symbol: 'map' },
    { id: 'guardian', name: t('Miras Koruyucusu', 'Heritage Guardian'), description: t('İlk koleksiyondaki altı eserin tamamını keşfet.', 'Discover all six works of the first collection.'), required: 6, value: count, metal: 'gold', symbol: 'shield' },
    { id: 'quiz', name: t('Bilgi Avcısı', 'Knowledge Hunter'), description: t('Tarihin İzinde bilgi yarışmasının ilk turunu tamamla.', 'Complete your first round of the On the Trail of History quiz.'), required: 1, value: progress.quiz.completed, metal: 'bronze', symbol: 'sparkles' },
    { id: 'puzzler', name: t('Usta Eller', 'Master Hands'), description: t('Üç farklı eserin yapbozunu tamamla.', 'Complete the puzzles of three different works.'), required: 3, value: Object.keys(progress.games.puzzle).length, metal: 'bronze', symbol: 'puzzle' },
    { id: 'detective', name: t('Dosya Çözücü', 'File Solver'), description: t('Üç farklı eserin gizli dosyasını çöz.', 'Crack the secret files of three different works.'), required: 3, value: Object.keys(progress.games.detective).length, metal: 'silver', symbol: 'search' },
    { id: 'sharp', name: t('Keskin Göz', 'Sharp Eye'), description: t('Zor seviyede bir yapbozu ve bir dosyayı tamamla.', 'Complete a puzzle and a file at the hard level.'), required: 2, value: hard(progress.games.puzzle) + hard(progress.games.detective), metal: 'gold', symbol: 'eye' },
  ];
}
