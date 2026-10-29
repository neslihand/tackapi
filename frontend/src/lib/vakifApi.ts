// The Vakıf Eserleri backend (backend/pipeline/api.py). With VITE_VAKIF_API=1 the collection, the monument pages,
// "Esere Sor", the camera and the map come from it; without it the site runs on the six built-in demo artifacts.
// Requests are same-origin (/api, /media): in development vite.config.ts proxies them to VAKIF_API_PROXY.
// For now only the MVP pilot selection is shown (GET /api/monuments?pilot=true).
import type { ArtifactFeed, ArtifactRecord } from './artifactContract.ts';
import { currentLang, t } from './i18n.ts';
import type { ChatRequest } from './chatContract.ts';
import type { Season } from '../data/collections.ts';
import type { QuizQuestion } from '../data/artifacts.ts';

export const vakifApiEnabled = () => ['1', 'true', 'on'].includes(String(import.meta.env?.VITE_VAKIF_API ?? '').trim().toLowerCase());
export const VAKIF_CHAT_ENDPOINT = '/api/chat';

// The parts of the backend's list item (api.list_item) the site reads.
export type VakifLocation = { lat: number; lon: number; approximate: boolean; radius_m: number | null };
export type VakifImage = { src: string; thumb: string; alt: string | null; width: number | null; height: number | null };
export type VakifItem = {
  slug: string; name: string; alt_names: string[]; kind: string; kind_label: string; city: { slug: string; name: string };
  district: string | null; neighborhood: string | null; period: { slug: string; name: string } | null;
  built: { from: number | null; to: number | null; label: string | null; basis: string | null; basis_label: string | null };
  parent: { slug: string; name: string } | null; children_count: number; summary: string | null; status: string | null;
  has_artworks: boolean; image: VakifImage | null; source: { book: string | null; pages: [number, number] | null };
  location?: VakifLocation | null;
  // names in the order the book gives them, comma separated; the patron (bânî) is never shown as the architect
  architect?: string | null; builder?: string | null; patron?: string | null;
};

// Site settings from the admin panel (or computed from visitor data): the default telling and the featured route.
let settings: { default_mode: 'short' | 'story' | 'child'; featured_route: string | null } = { default_mode: 'short', featured_route: null };
export const siteDefaultMode = () => settings.default_mode;

// List items by slug, kept from the feed for the monument page (it needs the card as well as the detail).
const items = new Map<string, VakifItem>();
export const vakifItem = (slug: string) => items.get(slug);

export function sourceTitle(source: VakifItem['source']): string {
  const book = source.book?.trim() || 'Vakıf Katılım şehir envanteri';
  const [from, to] = source.pages ?? [null, null];
  return from ? `${book}, s. ${from}${to && to !== from ? `–${to}` : ''}` : book;
}

/** "MİMAR / USTA": the architects, otherwise the builders (master craftsmen); never the patron. */
export const makers = (item: Pick<VakifItem, 'architect' | 'builder'>) => item.architect?.trim() || item.builder?.trim() || null;

/** Backend list item → the site's feed record. Nothing is invented: a missing value stays missing (null). */
export function toRecord(item: VakifItem): ArtifactRecord {
  const where = [item.district, item.city.name].filter(Boolean).join(', ');
  return {
    id: item.slug, slug: item.slug, name: item.name, city: item.city.name,
    period: item.period?.name ?? 'Dönemi belirtilmemiş', category: item.kind_label,
    // The card needs a sentence; without the book's summary it says only what the record states.
    description: item.summary?.trim() || `${where}: ${item.kind_label.toLocaleLowerCase('tr-TR')}.`,
    year: item.built.label, architect: makers(item),
    coordinates: item.location ? [item.location.lat, item.location.lon] : null,
    coordinatesApproximate: item.location ? item.location.approximate : undefined,
    image: item.image?.src ?? null, imageAlt: item.image?.alt ?? null,
    sourceReferences: [{ title: sourceTitle(item.source) }],
  };
}

// Site health for the admin assistant: failed (5xx, no connection) and slow requests are reported by analytics.ts
// (only with consent). Monument slugs are folded so the same endpoint is counted together.
let reportApi: (endpoint: string, status: number, ms: number) => void = () => {};
export function setApiReporter(fn: typeof reportApi) { reportApi = fn; }
const endpointOf = (url: string) => url.split('?')[0].replace(/^(\/api\/monuments\/)[^/]+/, '$1:slug');

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const started = typeof performance !== 'undefined' ? performance.now() : 0;
  let response: Response;
  try { response = await fetch(url, { headers: { accept: 'application/json' }, ...init }); }
  catch (e) { reportApi(endpointOf(url), 0, 0); throw e; }
  reportApi(endpointOf(url), response.status, typeof performance !== 'undefined' ? Math.round(performance.now() - started) : 0);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    throw new Error(typeof body?.detail === 'string' ? body.detail : t(`Sunucu ${response.status} döndü.`, `The server returned ${response.status}.`));
  }
  return response.json() as Promise<T>;
}

export async function loadPilotFeed(): Promise<ArtifactFeed> {
  // Routes ("Keşif Sezonları") and written quiz questions are optional: without them the collection still opens.
  const [data, routes, quizQuestions, site] = await Promise.all([
    getJson<{ items: VakifItem[] }>(`/api/monuments?pilot=true&page_size=200&lang=${currentLang()}`),
    getJson<Season[]>('/api/routes?pilot=true').catch(() => [] as Season[]),
    getJson<QuizQuestion[]>('/api/quiz?pilot=true').catch(() => [] as QuizQuestion[]),
    getJson<typeof settings>('/api/site-settings').catch(() => settings),
  ]);
  if (['short', 'story', 'child'].includes(site.default_mode)) settings = site;
  // the featured route (panel setting, or the most opened one) leads the "Keşif Sezonları"
  const featured = routes.find(r => r.id === settings.featured_route);
  const seasons = featured ? [{ ...featured, kicker: t('ÖNE ÇIKAN ROTA', 'FEATURED ROUTE') }, ...routes.filter(r => r !== featured)] : routes;
  items.clear();
  data.items.forEach(item => items.set(item.slug, item));
  return { schemaVersion: 1, items: data.items.map(toRecord), seasons, quizQuestions };
}

export const fetchMonument = <T,>(slug: string) => getJson<T>(`/api/monuments/${encodeURIComponent(slug)}?lang=${currentLang()}`);

// ---------------------------------------------------------------------------------------------- "Esere Sor"
// The site's chat request (chatContract) → POST /api/chat {slug, question, mode, lang, history}.
const MODES = { short: 'standard', story: 'story', child: 'child' } as const;
export function toVakifChat(request: ChatRequest) {
  const turns = request.messages.filter(m => m.content.trim());
  const last = turns.length - 1 - [...turns].reverse().findIndex(m => m.role === 'user');
  return {
    slug: request.artifactId, question: (turns[last]?.content ?? '').trim().slice(0, 1000), mode: MODES[request.mode] ?? 'standard',
    lang: currentLang(), history: turns.slice(0, Math.max(last, 0)).slice(-20).map(m => ({ role: m.role, content: m.content.slice(0, 4000) })),
  };
}

/** The answer's source marks ([S1, F0], [T]) refer to the model's context; on the site the source list says it. */
export const stripCitations = (text: string) =>
  text.replace(/\s*\[(?:[SFT]\d*)(?:\s*,\s*[SFT]\d*)*\]/g, '').replace(/[ \t]+([.,;:!?])/g, '$1').trim();

export function fromVakifChat(data: unknown): { answer: string; sources: { title: string }[] } | null {
  if (typeof data !== 'object' || data === null || typeof (data as { answer?: unknown }).answer !== 'string') return null;
  const { answer, sources } = data as { answer: string; sources?: { book?: string; pages?: string }[] };
  // rag.fmt_pages already writes 's. 75–76'; a bare range gets the prefix
  const pages = (p?: string) => p && (/^s\.\s/.test(p) ? p : `s. ${p}`);
  const titles = [...new Set((Array.isArray(sources) ? sources : []).map(s => [s.book, pages(s.pages)].filter(Boolean).join(', ')).filter(Boolean))];
  return { answer: stripCitations(answer), sources: titles.map(title => ({ title })) };
}

// ---------------------------------------------------------------------------------------------- Kamera
export type VisualCandidate = { slug: string; name: string; score: number; photo: string };
export type VisualResult = { confident: boolean; match: string | null; candidates: VisualCandidate[] };

/** POST /api/visual-search. Not confident: the closest monuments are offered as "not sure", never as one answer. */
export async function findByPhoto(photo: Blob): Promise<VisualResult> {
  const form = new FormData();
  form.append('file', photo, 'foto.jpg');
  form.append('lang', currentLang());
  const data = await getJson<{ confident: boolean; match: VakifItem | null; candidates: { item: VakifItem; score: number; photo: { thumb: string } }[] }>(
    '/api/visual-search', { method: 'POST', body: form });
  return {
    confident: data.confident, match: data.match?.slug ?? null,
    candidates: data.candidates.map(c => ({ slug: c.item.slug, name: c.item.name, score: c.score, photo: c.photo.thumb })),
  };
}
