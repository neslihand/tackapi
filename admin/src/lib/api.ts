// Yönetim API'si istemcisi. Anahtar yalnızca bu sekmenin oturumunda (sessionStorage) tutulur; sekme kapanınca silinir.
import type { AdminImage, Book, City, DecisionResult, ImageStatus, LogRow, MonumentDetail, MonumentFields, MonumentRow, Page,
  ParaDecision, Period, SegItem, Stats } from './types';
import type { ChatReply, Preview } from '../public/model';

export const TOKEN_KEY = 'esik:admin-token';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const memory = new Map<string, string>();
const fallback: Store = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: k => void memory.delete(k) };
function store(): Store {
  try { return globalThis.sessionStorage ?? fallback; } catch { return fallback; }
}
export const getToken = () => store().getItem(TOKEN_KEY);
export const setToken = (token: string | null) => token ? store().setItem(TOKEN_KEY, token) : store().removeItem(TOKEN_KEY);

let onUnauthorized: () => void = () => {};
export function handleUnauthorized(fn: () => void) { onUnauthorized = fn; }

/** FastAPI hata gövdesini okunur Türkçe bir mesaja çevirir (422 doğrulama listeleri dahil). */
export function errorMessage(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(d => {
      const loc = Array.isArray(d?.loc) ? d.loc.filter((x: unknown) => x !== 'body').join('.') : '';
      return loc ? `${loc}: ${d?.msg ?? 'geçersiz değer'}` : String(d?.msg ?? 'geçersiz değer');
    }).join(' · ');
  }
  if (status === 0) return 'Sunucuya ulaşılamadı. Arka uç (uvicorn) çalışıyor mu?';
  return `İstek başarısız oldu (${status}).`;
}

export async function request<T>(path: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response: Response;
  try { response = await fetcher(path, { ...init, headers }); }
  catch { throw new ApiError(0, errorMessage(0, null)); }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) { setToken(null); onUnauthorized(); }
    throw new ApiError(response.status, errorMessage(response.status, body));
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  me: () => request<{ name: string }>('/api/admin/me'),
  stats: () => request<Stats>('/api/admin/stats'),
  monuments: (f: { q?: string; city?: string; status?: string; has_image?: boolean | null; page?: number; page_size?: number }) =>
    request<Page<MonumentRow>>(`/api/admin/monuments${qs(f)}`),
  monument: (slug: string) => request<MonumentDetail>(`/api/admin/monuments/${encodeURIComponent(slug)}`),
  createMonument: (body: MonumentFields & { city: string; name_tr: string; kind: string; text_tr?: string; text_en?: string }) =>
    request<{ slug: string; review_status: string; chunks: number; embedded: number }>('/api/admin/monuments', json('POST', body)),
  updateMonument: (slug: string, body: MonumentFields) =>
    request<{ slug: string; changed: Record<string, unknown> }>(`/api/admin/monuments/${encodeURIComponent(slug)}`, json('PATCH', body)),
  updateText: (slug: string, body: { text_tr: string; text_en?: string | null }) =>
    request<{ slug: string; chunks: number; embedded: number }>(`/api/admin/monuments/${encodeURIComponent(slug)}/text`, json('PUT', body)),
  deleteMonument: (slug: string) => request<void>(`/api/admin/monuments/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  images: (f: { status?: ImageStatus | ''; unassigned?: boolean | null; book?: string; monument?: string; page?: number; page_size?: number }) =>
    request<Page<AdminImage>>(`/api/admin/images${qs(f)}`),
  updateImage: (id: number, body: { monument?: string | null; review_status?: ImageStatus; alt_tr?: string; alt_en?: string | null;
    caption_tr?: string | null; sort?: number; is_cover?: boolean }) =>
    request<AdminImage>(`/api/admin/images/${id}`, json('PATCH', body)),
  bulkImages: (ids: number[], review_status: ImageStatus) =>
    request<{ updated: number }>('/api/admin/images/bulk', json('POST', { ids, review_status })),
  deleteImage: (id: number) => request<void>(`/api/admin/images/${id}`, { method: 'DELETE' }),
  uploadImage: (slug: string, file: File, fields: { alt_tr: string; alt_en?: string; caption_tr?: string; review_status?: 'draft' | 'published' }) => {
    const form = new FormData();
    form.set('file', file);
    for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);
    return request<AdminImage>(`/api/admin/monuments/${encodeURIComponent(slug)}/images`, { method: 'POST', body: form });
  },
  cities: () => request<City[]>('/api/cities'),
  createCity: (body: { slug: string; name_tr: string; name_en: string; lat?: number | null; lon?: number | null }) =>
    request<City>('/api/admin/cities', json('POST', body)),
  periods: () => request<Period[]>('/api/admin/periods'),
  books: () => request<Book[]>('/api/admin/books'),
  segmentation: (f: { decision?: string; source?: string; book?: string; page?: number; page_size?: number }) =>
    request<Page<SegItem> & { counts: { decision: ParaDecision; n: number }[] }>(`/api/admin/segmentation${qs(f)}`),
  decideFix: (id: number, body: { decision: ParaDecision; target?: string | null }) =>
    request<DecisionResult>(`/api/admin/segmentation/${id}`, json('POST', body)),
  decideParagraph: (slug: string, n: number, body: { decision: ParaDecision; target?: string | null }) =>
    request<DecisionResult>(`/api/admin/monuments/${encodeURIComponent(slug)}/paragraphs/${n}`, json('PUT', body)),
  preview: (slug: string, lang: 'tr' | 'en', drafts: boolean) =>
    request<Preview>(`/api/admin/preview/${encodeURIComponent(slug)}${qs({ lang, drafts: drafts || null })}`),
  chat: (body: { slug: string; question: string; mode: 'standard' | 'story' | 'child'; lang: 'tr' | 'en' }) =>
    request<ChatReply>('/api/chat', json('POST', body)),
  log: (target?: string) => request<LogRow[]>(`/api/admin/log${qs({ target, limit: 200 })}`),
};
