// Yönetim API'si istemcisi. Anahtar yalnızca bu sekmenin oturumunda (sessionStorage) tutulur; sekme kapanınca silinir.
import type { QuestionRow, QuestionStatus, WeeklyFields, WeeklyItem, WorkDetail, WorkDetailKind, Hunt, HuntFields, Article, ArticleFields, ArticleRow, ArticleSource, ArticleSourceDetail, ArticleStatus, ArticleKind, ArticleOrigin, Term, TermFields, AgentDraft, AgentSuggestion, DraftTone, Overview, Announcement, AnnouncementFields, CalendarDay, CalendarFields, DraftKind, AdminImage, AdminRoute, AutoRoute, Book, City, Contribution, ContributionStatus, Insights, QuizFields, QuizQuestion, SiteSettings, DecisionResult, ImageStatus, Kind, LogRow, MonumentDetail, MonumentFields, MonumentRow, Page,
  PagePhotos, ParaDecision, Period, SegItem, SplitPart, Stats } from './types';
import type { Lang, Narration, NarrationMode, Preview, VisualSearchResult } from '../public/model';

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
  monuments: (f: { q?: string; city?: string; status?: string; has_image?: boolean | null; pilot?: boolean | null; page?: number; page_size?: number }) =>
    request<Page<MonumentRow>>(`/api/admin/monuments${qs(f)}`),
  monument: (slug: string) => request<MonumentDetail>(`/api/admin/monuments/${encodeURIComponent(slug)}`),
  createMonument: (body: MonumentFields & { city: string; name_tr: string; kind: string; text_tr?: string; text_en?: string }) =>
    request<{ slug: string; review_status: string; chunks: number; embedded: number }>('/api/admin/monuments', json('POST', body)),
  updateMonument: (slug: string, body: MonumentFields) =>
    request<{ slug: string; changed: Record<string, unknown> }>(`/api/admin/monuments/${encodeURIComponent(slug)}`, json('PATCH', body)),
  updateText: (slug: string, body: { text_tr: string; text_en?: string | null }) =>
    request<{ slug: string; chunks: number; embedded: number }>(`/api/admin/monuments/${encodeURIComponent(slug)}/text`, json('PUT', body)),
  deleteMonument: (slug: string) => request<void>(`/api/admin/monuments/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  // kaldırma: sitede ve listelerde gizler, veri silinmez; geri getirme taslak olarak döndürür
  removeMonument: (slug: string, reason?: string) =>
    request<{ slug: string; review_status: string }>(`/api/admin/monuments/${encodeURIComponent(slug)}/remove`, json('POST', { reason: reason || null })),
  restoreMonument: (slug: string) =>
    request<{ slug: string; review_status: string }>(`/api/admin/monuments/${encodeURIComponent(slug)}/restore`, { method: 'POST' }),
  images: (f: { status?: ImageStatus | ''; unassigned?: boolean | null; book?: string; monument?: string; page?: number; page_size?: number }) =>
    request<Page<AdminImage>>(`/api/admin/images${qs(f)}`),
  updateImage: (id: number, body: { monument?: string | null; review_status?: ImageStatus; alt_tr?: string; alt_en?: string | null;
    caption_tr?: string | null; sort?: number; is_cover?: boolean; reuse_allowed?: boolean }) =>
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
  setBookReuse: (slug: string, allowed: boolean) => request<{ updated: number }>(`/api/admin/books/${encodeURIComponent(slug)}/reuse`, json('PUT', { allowed })),
  segmentation: (f: { decision?: string; source?: string; book?: string; page?: number; page_size?: number }) =>
    request<Page<SegItem> & { counts: { decision: ParaDecision; n: number }[] }>(`/api/admin/segmentation${qs(f)}`),
  decideFix: (id: number, body: { decision: ParaDecision; target?: string | null }) =>
    request<DecisionResult>(`/api/admin/segmentation/${id}`, json('POST', body)),
  decideParagraph: (slug: string, n: number, body: { decision: ParaDecision; target?: string | null; split_at?: number; split_part?: SplitPart }) =>
    request<DecisionResult>(`/api/admin/monuments/${encodeURIComponent(slug)}/paragraphs/${n}`, json('PUT', body)),
  setHiddenSpans: (slug: string, n: number, spans: [number, number][]) =>
    request<{ hidden_spans: [number, number][]; added: number; kept: number }>(`/api/admin/monuments/${encodeURIComponent(slug)}/paragraphs/${n}/spans`, json('PUT', { hidden_spans: spans })),
  // paragraf aralığını mevcut bir esere (target) ya da bu paragraflardan oluşacak yeni esere (new) taşır
  moveParagraphs: (slug: string, body: { from_para: number; to_para: number; target?: string; first_split_at?: number;
    new?: { name_tr: string; kind: Kind; district?: string | null; neighborhood?: string | null } }) =>
    request<{ slug: string; target: string; created: string | null; moved: number; added: number; kept: number; embedded: number }>(
      `/api/admin/monuments/${encodeURIComponent(slug)}/paragraphs/move`, json('POST', body)),
  preview: (slug: string, lang: 'tr' | 'en', drafts: boolean) =>
    request<Preview>(`/api/admin/preview/${encodeURIComponent(slug)}${qs({ lang, drafts: drafts || null })}`),
  generateNarration: (slug: string, body: { mode: NarrationMode; lang: Lang }) =>
    request<Narration & { mode: NarrationMode; lang: Lang; verification: { unsupported_years: string[]; unsupported_names: string[] } }>(
      `/api/admin/monuments/${encodeURIComponent(slug)}/narrations`, json('POST', body)),
  // eserin kitap sayfalarındaki (± pad) bütün fotoğraflar, hangi esere bağlı olduklarıyla
  pagePhotos: (slug: string, pad = 1) =>
    request<PagePhotos>(`/api/admin/monuments/${encodeURIComponent(slug)}/page-photos${qs({ pad })}`),
  // kitabın basılı sayfasını içeren PDF açılımı; <img> anahtar gönderemediği için blob olarak alınır (URL'yi revoke edin)
  pdfPage: async (book: string, printed: number): Promise<{ url: string; pages: number[]; pdf_page: number }> => {
    const token = getToken();
    let response: Response;
    try { response = await fetch(`/api/admin/books/${encodeURIComponent(book)}/pdf-page${qs({ printed })}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
    catch { throw new ApiError(0, errorMessage(0, null)); }
    if (!response.ok) {
      if (response.status === 401) { setToken(null); onUnauthorized(); }
      throw new ApiError(response.status, errorMessage(response.status, await response.json().catch(() => null)));
    }
    return { url: URL.createObjectURL(await response.blob()), pdf_page: Number(response.headers.get('X-Pdf-Page')),
      pages: (response.headers.get('X-Printed-Pages') ?? '').split(',').filter(Boolean).map(Number) };
  },
  // künyeyi düzeltilmiş metinden yeniden çıkarır (tek Gemini çağrısı)
  reextract: (slug: string) =>
    request<{ persons: number; events: number; artworks: number; notes: number; rejected: number; kept_panel_fields: string[] }>(
      `/api/admin/monuments/${encodeURIComponent(slug)}/reextract`, { method: 'POST' }),
  setArtworkImages: (artworkId: number, imageIds: number[]) =>
    request<{ artwork_id: number; image_ids: number[] }>(`/api/admin/artworks/${artworkId}/images`, json('PUT', { image_ids: imageIds })),
  editNarration: (slug: string, mode: NarrationMode, body: { lang: Lang; answer: string }) =>
    request<{ mode: NarrationMode; lang: Lang; answer: string }>(
      `/api/admin/monuments/${encodeURIComponent(slug)}/narrations/${mode}`, json('PUT', body)),
  // herkese açık uç; panelde deneme sayfası kullanır
  visualSearch: (file: Blob, lang: Lang) => {
    const form = new FormData();
    form.append('file', file);
    form.append('lang', lang);
    return request<VisualSearchResult>('/api/visual-search', { method: 'POST', body: form });
  },
  routes: () => request<{ enabled: boolean; routes: AdminRoute[]; auto: AutoRoute[] }>('/api/admin/routes'),
  createRoute: (body: { title: string; kicker?: string | null; description?: string | null; published?: boolean }) =>
    request<AdminRoute>('/api/admin/routes', json('POST', body)),
  updateRoute: (id: number, body: { title?: string; kicker?: string | null; description?: string | null; sort?: number; published?: boolean; minutes?: number | null; access_note?: string | null }) =>
    request<AdminRoute>(`/api/admin/routes/${id}`, json('PATCH', body)),
  setRouteStops: (id: number, slugs: string[]) => request<{ id: number; stops: string[] }>(`/api/admin/routes/${id}/stops`, json('PUT', { slugs })),
  deleteRoute: (id: number) => request<void>(`/api/admin/routes/${id}`, { method: 'DELETE' }),
  quiz: (monument?: string) => request<{ enabled: boolean; questions: QuizQuestion[] }>(`/api/admin/quiz${qs({ monument })}`),
  createQuiz: (body: Required<Omit<QuizFields, 'published'>> & { published?: boolean }) => request<QuizQuestion>('/api/admin/quiz', json('POST', body)),
  updateQuiz: (id: number, body: QuizFields) => request<QuizQuestion>(`/api/admin/quiz/${id}`, json('PATCH', body)),
  deleteQuiz: (id: number) => request<void>(`/api/admin/quiz/${id}`, { method: 'DELETE' }),
  hunts: () => request<{ enabled: boolean; hunts: Hunt[] }>('/api/admin/hunts'),
  createHunt: (body: HuntFields) => request<Hunt>('/api/admin/hunts', json('POST', body)),
  updateHunt: (id: number, body: HuntFields) => request<Hunt>(`/api/admin/hunts/${id}`, json('PATCH', body)),
  deleteHunt: (id: number) => request<void>(`/api/admin/hunts/${id}`, { method: 'DELETE' }),
  workDetails: (slug: string) => request<{ enabled: boolean; details: WorkDetail[] }>(`/api/admin/monuments/${encodeURIComponent(slug)}/details`),
  saveWorkDetail: (slug: string, kind: WorkDetailKind, body: { body_tr: string; body_en: string | null; source: string; published: boolean }) =>
    request<{ kind: WorkDetailKind }>(`/api/admin/monuments/${encodeURIComponent(slug)}/details/${kind}`, json('PUT', body)),
  deleteWorkDetail: (slug: string, kind: WorkDetailKind) => request<void>(`/api/admin/monuments/${encodeURIComponent(slug)}/details/${kind}`, { method: 'DELETE' }),
  weekly: () => request<{ enabled: boolean; items: WeeklyItem[]; routes: { id: string; title: string }[] }>('/api/admin/weekly'),
  createWeekly: (body: WeeklyFields) => request<WeeklyItem>('/api/admin/weekly', json('POST', body)),
  updateWeekly: (id: number, body: WeeklyFields) => request<WeeklyItem>(`/api/admin/weekly/${id}`, json('PATCH', body)),
  deleteWeekly: (id: number) => request<void>(`/api/admin/weekly/${id}`, { method: 'DELETE' }),
  questions: (status: 'open' | QuestionStatus, page = 1) =>
    request<{ enabled: boolean; items: QuestionRow[]; total: number; counts: { status: QuestionStatus; n: number }[]; median_hours: number | null; oldest_open_hours: number | null }>(`/api/admin/questions${qs({ status, page })}`),
  reviewQuestion: (id: number, body: { status: QuestionStatus; answer: string | null; answer_source: string | null; note: string | null }) =>
    request<{ id: number; followers: number }>(`/api/admin/questions/${id}`, json('PATCH', body)),
  contributions: (status: ContributionStatus | null, page = 1) =>
    request<{ enabled: boolean; total: number; items: Contribution[]; counts: { status: ContributionStatus; n: number }[] }>(
      `/api/admin/contributions${qs({ status: status ?? '', page })}`),
  reviewContribution: (id: number, body: { status: ContributionStatus; reject_reason?: string | null }) =>
    request<{ id: number; status: ContributionStatus }>(`/api/admin/contributions/${id}`, json('PATCH', body)),
  overview: (demo = true) => request<Overview>(`/api/admin/overview${qs({ demo: demo ? null : false })}`),
  insights: (days: number, demo: boolean) => request<Insights>(`/api/admin/insights${qs({ days, demo })}`),
  settings: () => request<Insights['settings']>('/api/admin/settings'),
  saveSettings: (body: Partial<SiteSettings>) => request<Insights['settings']>('/api/admin/settings', json('PUT', body)),
  agent: (status: 'open' | 'closed') => request<{ enabled: boolean; items: AgentSuggestion[]; counts: Record<string, number>;
    last_scan: string | null; model?: string; fake?: boolean }>(`/api/admin/agent${qs({ status })}`),
  agentScan: () => request<{ found: number; new: number; expired: number }>('/api/admin/agent/scan', { method: 'POST' }),
  agentStatus: (id: number, status: 'open' | 'done' | 'dismissed') => request<AgentSuggestion>(`/api/admin/agent/${id}`, json('PATCH', { status })),
  agentDraft: (id: number, kind: DraftKind, tone: DraftTone = 'auto', note?: string) =>
    request<AgentDraft>(`/api/admin/agent/${id}/draft`, json('POST', { kind, tone, note: note?.trim() || null })),
  agentApply: (id: number, kind: DraftKind, draft: Record<string, unknown>) =>
    request<{ id: number; result_ref: string }>(`/api/admin/agent/${id}/apply`, json('POST', { kind, draft })),
  calendar: () => request<{ enabled: boolean; days: CalendarDay[]; horizon?: number }>('/api/admin/calendar'),
  createCalendar: (body: CalendarFields) => request<CalendarDay>('/api/admin/calendar', json('POST', body)),
  updateCalendar: (id: number, body: CalendarFields) => request<CalendarDay>(`/api/admin/calendar/${id}`, json('PATCH', body)),
  deleteCalendar: (id: number) => request<void>(`/api/admin/calendar/${id}`, { method: 'DELETE' }),
  announcements: () => request<{ enabled: boolean; items: Announcement[] }>('/api/admin/announcements'),
  createAnnouncement: (body: AnnouncementFields) => request<Announcement>('/api/admin/announcements', json('POST', body)),
  updateAnnouncement: (id: number, body: AnnouncementFields) => request<Announcement>(`/api/admin/announcements/${id}`, json('PATCH', body)),
  deleteAnnouncement: (id: number) => request<void>(`/api/admin/announcements/${id}`, { method: 'DELETE' }),
  // makaleler (kitaptan içe aktarılan, panelde yazılan ve ziyaretçilerin gönderdiği) ve terimler sözlüğü
  articles: (f: { status?: ArticleStatus | null; kind?: ArticleKind | null; origin?: ArticleOrigin | null; q?: string; page?: number }) =>
    request<{ enabled: boolean; total: number; items: ArticleRow[]; counts: { status: ArticleStatus; n: number }[] }>(`/api/admin/articles${qs(f)}`),
  article: (id: number) => request<Article>(`/api/admin/articles/${id}`),
  createArticle: (body: ArticleFields & { kind: ArticleKind; title_tr: string }) => request<Article>('/api/admin/articles', json('POST', body)),
  updateArticle: (id: number, body: ArticleFields) => request<Article>(`/api/admin/articles/${id}`, json('PATCH', body)),
  deleteArticle: (id: number) => request<void>(`/api/admin/articles/${id}`, { method: 'DELETE' }),
  uploadArticleCover: (id: number, file: File, alt?: string) => {
    const form = new FormData();
    form.set('file', file);
    if (alt !== undefined) form.set('alt', alt);
    return request<Article>(`/api/admin/articles/${id}/cover`, { method: 'POST', body: form });
  },
  removeArticleCover: (id: number) => request<Article>(`/api/admin/articles/${id}/cover`, { method: 'DELETE' }),
  articleSources: () => request<ArticleSource[]>('/api/admin/article-sources'),
  articleSource: (id: number) => request<ArticleSourceDetail>(`/api/admin/article-sources/${id}`),
  importArticle: (body: { section_id: number; from_para: number; to_para: number; title_tr?: string; kind?: ArticleKind }) =>
    request<Article>('/api/admin/articles/import', json('POST', body)),
  terms: (f: { status?: ArticleStatus | null; origin?: ArticleOrigin | null; q?: string }) =>
    request<{ enabled: boolean; items: Term[]; counts: { status: ArticleStatus; n: number }[] }>(`/api/admin/terms${qs(f)}`),
  createTerm: (body: TermFields & { term_tr: string; definition_tr: string }) => request<Term>('/api/admin/terms', json('POST', body)),
  updateTerm: (id: number, body: TermFields) => request<Term>(`/api/admin/terms/${id}`, json('PATCH', body)),
  deleteTerm: (id: number) => request<void>(`/api/admin/terms/${id}`, { method: 'DELETE' }),
  log: (target?: string) => request<LogRow[]>(`/api/admin/log${qs({ target, limit: 200 })}`),
};
