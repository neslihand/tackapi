// The Vakıf Eserleri backend (backend/pipeline/api.py), the same public endpoints the site uses. The app lists every
// published work. Every successful GET is kept on the device, so a work opened once still opens without a connection
// (the photos are kept by expo-image's disk cache).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { currentLang, t } from './i18n';

// The address typed in Ayarlar (an installed APK at the demo: the laptop's address changes with the Wi-Fi).
let serverOverride: string | null = null;
export const setServerOverride = (url: string | null) => { serverOverride = url?.trim().replace(/\/+$/, '') || null; };

/** The Ayarlar address, then EXPO_PUBLIC_API_URL, otherwise the computer running the Expo dev server, on port 8000. */
export function apiBase(): string {
  if (serverOverride) return serverOverride;
  const own = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (own) return own.replace(/\/+$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || '127.0.0.1'}:8000`;
}
export const mediaUrl = (src: string | null | undefined) => (!src ? null : /^https?:/.test(src) ? src : `${apiBase()}${src}`);

export type Location = { lat: number; lon: number; approximate: boolean; radius_m: number | null };
export type Image = { src: string; thumb: string; alt: string | null; width: number | null; height: number | null };
export type Item = {
  slug: string; name: string; alt_names: string[]; kind: string; kind_label: string; city: { slug: string; name: string };
  district: string | null; neighborhood: string | null; period: { slug: string; name: string } | null;
  built: { from: number | null; to: number | null; label: string | null };
  summary: string | null; image: Image | null; source: { book: string | null; pages: [number, number] | null };
  location?: Location | null; architect?: string | null; builder?: string | null;
};
export type Narration = { answer: string; sources: { book: string; pages: string; heading: string | null }[] } | null;
export type Detail = {
  text: string | null; text_note: string | null;
  narrations: { story: Narration; child: Narration };
  images: (Image & { caption: string | null; source: { book: string; page: number | null } | null })[];
  location: Location | null;
  source: { book: string | null; pages: [number | null, number | null]; credits: { authors?: string[] | null; editor?: string | null; translator?: string | null } | null };
};
export type Season = { id: string; kicker: string; title: string; description: string; artifactIds: string[] };
// written in the panel (GET /api/quiz); answer is the index of the right option
export type QuizQuestion = { id: string; question: string; options: string[]; answer: number; explanation: string; artifactId: string };
export type Feed = { items: Item[]; seasons: Season[]; quiz: QuizQuestion[]; stale: boolean };

export const makers = (item: Pick<Item, 'architect' | 'builder'>) => item.architect?.trim() || item.builder?.trim() || null;
export function sourceTitle(source: Item['source']): string {
  const book = source.book?.trim() || 'Vakıf Katılım şehir envanteri';
  const [from, to] = source.pages ?? [null, null];
  return from ? `${book}, s. ${from}${to && to !== from ? `–${to}` : ''}` : book;
}

export class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }

// The account's session key (account.tsx sets it); sent as a Bearer header, the phone has no cookie session.
let sessionKey: string | null = null;
export const setSessionKey = (key: string | null) => { sessionKey = key; };

// React Native's fetch has no timeout on Android: an unreachable server (another Wi-Fi, a dropped packet) would keep the
// spinner forever instead of falling back to the device copy. Reads should be quick; chat, photo search and uploads may not.
const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 120_000;

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const headers: Record<string, string> = { accept: 'application/json', ...(init?.headers as Record<string, string> | undefined) };
  if (typeof init?.body === 'string' && !headers['content-type']) headers['content-type'] = 'application/json';
  if (sessionKey) headers.authorization = `Bearer ${sessionKey}`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), !init?.method || init.method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  try { response = await fetch(`${apiBase()}${path}`, { ...init, headers, signal: abort.signal }); }
  catch {
    throw new ApiError(abort.signal.aborted
      ? t('Sunucu yanıt vermedi. Ayarlar’daki sunucu adresini ve aynı Wi-Fi’de olduğunu kontrol et.', 'The server did not answer. Check the server address in Settings and that you are on the same Wi-Fi.')
      : t('Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.', 'Could not reach the server. Check your connection.'), 0);
  }
  finally { clearTimeout(timer); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = typeof body?.detail === 'string' ? body.detail
      : Array.isArray(body?.detail) ? t('Lütfen alanları kontrol et.', 'Please check the fields.') : t(`Sunucu ${response.status} döndü.`, `The server returned ${response.status}.`);
    throw new ApiError(detail, response.status);
  }
  return (response.status === 204 ? undefined : response.json()) as Promise<T>;
}

export const cacheKey = (path: string) => `esik:cache:${path}`;

/** GET with the device copy as the fallback; `stale` says the answer came from the copy. */
export async function cachedGet<T>(path: string): Promise<{ data: T; stale: boolean }> {
  try {
    const data = await request<T>(path);
    AsyncStorage.setItem(cacheKey(path), JSON.stringify(data)).catch(() => {});
    return { data, stale: false };
  } catch (error) {
    // a 404 is an answer (the work was taken down), not a missing connection
    if (error instanceof ApiError && error.status !== 0 && error.status < 500) throw error;
    const saved = await AsyncStorage.getItem(cacheKey(path)).catch(() => null);
    if (saved) return { data: JSON.parse(saved) as T, stale: true };
    throw error;
  }
}

const PAGE_SIZE = 200; // the API's largest page

/** Every published work, page by page; the device keeps the whole list under one key so it is never half there. */
async function loadAllWorks(lang: string): Promise<{ data: Item[]; stale: boolean }> {
  const key = cacheKey(`/api/monuments?all&lang=${lang}`);
  try {
    const page = (n: number) => request<{ total: number; items: Item[] }>(`/api/monuments?page=${n}&page_size=${PAGE_SIZE}&lang=${lang}`);
    const first = await page(1);
    const rest = await Promise.all(Array.from({ length: Math.ceil(first.total / PAGE_SIZE) - 1 }, (_, i) => page(i + 2)));
    const data = [first, ...rest].flatMap(p => p.items);
    AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
    return { data, stale: false };
  } catch (error) {
    if (error instanceof ApiError && error.status !== 0 && error.status < 500) throw error;
    const saved = await AsyncStorage.getItem(key).catch(() => null);
    if (saved) return { data: JSON.parse(saved) as Item[], stale: true };
    throw error;
  }
}

export async function loadFeed(): Promise<Feed> {
  const lang = currentLang();
  // routes and written questions are optional: without them the collection still opens
  const [list, routes, quiz] = await Promise.all([
    loadAllWorks(lang),
    // routes stay on the pilot works: unfiltered, a city route lists every work in the city (372 stops in Bursa), and
    // only the pilot works have a location to walk to
    cachedGet<Season[]>('/api/routes?pilot=true').catch(() => ({ data: [] as Season[], stale: true })),
    cachedGet<QuizQuestion[]>('/api/quiz').catch(() => ({ data: [] as QuizQuestion[], stale: true })),
  ]);
  return { items: list.data, seasons: routes.data, quiz: quiz.data, stale: list.stale };
}

export const loadMonument = (slug: string) => cachedGet<Detail>(`/api/monuments/${encodeURIComponent(slug)}?lang=${currentLang()}`);

// ------------------------------------------------------------------------------------------------- Esere Sor
export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type ChatMode = 'standard' | 'story' | 'child';

/** The answer's source marks ([S1, F0], [T]) refer to the model's context; the source list below the answer says it. */
export const stripCitations = (text: string) =>
  text.replace(/\s*\[(?:[SFT]\d*)(?:\s*,\s*[SFT]\d*)*\]/g, '').replace(/[ \t]+([.,;:!?])/g, '$1').trim();

export async function askWork(slug: string, question: string, mode: ChatMode, history: ChatTurn[]) {
  const data = await request<{ answer: string; sources?: { book?: string; pages?: string }[] }>('/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, question: question.trim().slice(0, 1000), mode, lang: currentLang(),
      history: history.slice(-20).map(m => ({ role: m.role, content: m.content.slice(0, 4000) })) }),
  });
  const pages = (p?: string) => p && (/^s\.\s/.test(p) ? p : `s. ${p}`);
  const sources = [...new Set((data.sources ?? []).map(s => [s.book, pages(s.pages)].filter(Boolean).join(', ')).filter(Boolean))];
  return { answer: stripCitations(data.answer), sources };
}

// ------------------------------------------------------------------------------------------------- Kamera
export type VisualResult = { confident: boolean; match: string | null; candidates: { slug: string; name: string; score: number; photo: string }[] };

/** POST /api/visual-search. Not confident: the closest works are offered as "not sure", never as one answer. */
export async function findByPhoto(uri: string, mimeType = 'image/jpeg'): Promise<VisualResult> {
  const form = new FormData();
  // React Native's FormData takes a file as {uri, name, type}
  form.append('file', { uri, name: 'foto.jpg', type: mimeType } as unknown as Blob);
  form.append('lang', currentLang());
  const data = await request<{ confident: boolean; match: Item | null; candidates: { item: Item; score: number; photo: { thumb: string } }[] }>(
    '/api/visual-search', { method: 'POST', body: form });
  return {
    confident: data.confident, match: data.match?.slug ?? null,
    candidates: data.candidates.map(c => ({ slug: c.item.slug, name: c.item.name, score: c.score, photo: c.photo.thumb })),
  };
}
