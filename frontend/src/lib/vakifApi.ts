// The Vakıf Eserleri backend (backend/pipeline/api.py). With VITE_VAKIF_API=1 the collection, the monument pages,
// "Esere Sor", the camera and the map come from it; without it the site runs on the six built-in demo artifacts.
// Requests are same-origin (/api, /media): in development vite.config.ts proxies them to VAKIF_API_PROXY.
// For now only the MVP pilot selection is shown (GET /api/monuments?pilot=true).
import type { ArtifactFeed, ArtifactRecord } from './artifactContract.ts';
import type { ChatRequest } from './chatContract.ts';

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
};

// List items by slug, kept from the feed for the monument page (it needs the card as well as the detail).
const items = new Map<string, VakifItem>();
export const vakifItem = (slug: string) => items.get(slug);

export function sourceTitle(source: VakifItem['source']): string {
  const book = source.book?.trim() || 'Vakıf Katılım şehir envanteri';
  const [from, to] = source.pages ?? [null, null];
  return from ? `${book}, s. ${from}${to && to !== from ? `–${to}` : ''}` : book;
}

/** Backend list item → the site's feed record. Nothing is invented: a missing value stays missing (null). */
export function toRecord(item: VakifItem): ArtifactRecord {
  const where = [item.district, item.city.name].filter(Boolean).join(', ');
  return {
    id: item.slug, slug: item.slug, name: item.name, city: item.city.name,
    period: item.period?.name ?? 'Dönemi belirtilmemiş', category: item.kind_label,
    // The card needs a sentence; without the book's summary it says only what the record states.
    description: item.summary?.trim() || `${where}: ${item.kind_label.toLocaleLowerCase('tr-TR')}.`,
    year: item.built.label, architect: null,
    coordinates: item.location ? [item.location.lat, item.location.lon] : null,
    coordinatesApproximate: item.location ? item.location.approximate : undefined,
    image: item.image?.src ?? null, imageAlt: item.image?.alt ?? null,
    sourceReferences: [{ title: sourceTitle(item.source) }],
  };
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { accept: 'application/json' }, ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    throw new Error(typeof body?.detail === 'string' ? body.detail : `Sunucu ${response.status} döndü.`);
  }
  return response.json() as Promise<T>;
}

export async function loadPilotFeed(): Promise<ArtifactFeed> {
  const data = await getJson<{ items: VakifItem[] }>('/api/monuments?pilot=true&page_size=200&lang=tr');
  items.clear();
  data.items.forEach(item => items.set(item.slug, item));
  return { schemaVersion: 1, items: data.items.map(toRecord) };
}

export const fetchMonument = <T,>(slug: string) => getJson<T>(`/api/monuments/${encodeURIComponent(slug)}?lang=tr`);

// ---------------------------------------------------------------------------------------------- "Esere Sor"
// The site's chat request (chatContract) → POST /api/chat {slug, question, mode, lang, history}.
const MODES = { short: 'standard', story: 'story', child: 'child' } as const;
export function toVakifChat(request: ChatRequest) {
  const turns = request.messages.filter(m => m.content.trim());
  const last = turns.length - 1 - [...turns].reverse().findIndex(m => m.role === 'user');
  return {
    slug: request.artifactId, question: (turns[last]?.content ?? '').trim().slice(0, 1000), mode: MODES[request.mode] ?? 'standard',
    lang: 'tr', history: turns.slice(0, Math.max(last, 0)).slice(-20).map(m => ({ role: m.role, content: m.content.slice(0, 4000) })),
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
  form.append('lang', 'tr');
  const data = await getJson<{ confident: boolean; match: VakifItem | null; candidates: { item: VakifItem; score: number; photo: { thumb: string } }[] }>(
    '/api/visual-search', { method: 'POST', body: form });
  return {
    confident: data.confident, match: data.match?.slug ?? null,
    candidates: data.candidates.map(c => ({ slug: c.item.slug, name: c.item.name, score: c.score, photo: c.photo.thumb })),
  };
}
