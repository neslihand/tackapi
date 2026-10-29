// Articles and the glossary (backend/pipeline/articles.py). Reading is public; sending an article or suggesting a
// term needs an account (the session cookie). What visitors send waits for an administrator's approval.
import { call } from './account';
import { currentLang } from './i18n';

export type ArticleKind = 'city_history' | 'heritage' | 'culture';
export type ArticleStatus = 'draft' | 'pending' | 'published' | 'rejected';
export type Cover = { src: string; thumb: string; alt: string; own: boolean } | null;
export type ArticleItem = {
  slug: string; kind: ArticleKind; kind_label: string; title: string; summary: string; lang: 'tr' | 'en';
  city: { slug: string; name: string } | null; cover: Cover; reading_minutes: number; byline: string;
  origin: 'book' | 'editorial' | 'visitor'; featured: boolean; published_at: string | null; monuments_count: number;
};
export type ArticleDetail = ArticleItem & {
  body: string; has_english: boolean; updated_at: string;
  source: { book: string | null; section: string | null; pages: [number, number] | null; note: string | null } | null;
  monuments: { slug: string; name: string; city: string; pilot: boolean; image: { src: string; thumb: string; alt: string } | null }[];
  related: ArticleItem[];
};
export type ArticleList = { enabled: boolean; total: number; page: number; page_size: number; items: ArticleItem[];
  facets: { kinds: { slug: ArticleKind; label: string; n: number }[]; cities: { slug: string; name: string; n: number }[] } };
export type GlossaryTerm = {
  slug: string; term: string; term_en: string | null; definition: string; definition_lang: 'tr' | 'en'; definition_child: string | null;
  category: string | null; category_label: string | null; origin: 'book' | 'editorial' | 'visitor'; initial: string; author: string | null;
};
export type TermDetail = GlossaryTerm & {
  monuments: { slug: string; name: string; city: string; pilot: boolean }[];
  articles: { slug: string; title: string; kind_label: string }[];
};
export type MyArticle = { id: number; slug: string; kind: ArticleKind; title: string; summary: string | null; body: string; city: string | null;
  status: ArticleStatus; reject_reason: string | null; cover: Cover; created_at: string; updated_at: string; published_at: string | null;
  monuments: { slug: string; name: string }[] };
export type MyTerm = { id: number; slug: string; term: string; term_en: string; definition: string; definition_child: string | null;
  category: string | null; status: ArticleStatus; reject_reason: string | null; created_at: string };
export type ArticleForm = { kind: ArticleKind; title: string; summary: string; body: string; city: string; monuments: string[];
  cover_alt: string; file?: File | null; remove_cover_file?: boolean };

const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p.toString() ? `?${p}` : '';
};
function form(f: Partial<ArticleForm>) {
  const out = new FormData();
  for (const k of ['kind', 'title', 'summary', 'body', 'city', 'cover_alt'] as const) if (f[k] !== undefined) out.set(k, f[k] as string);
  if (f.monuments) out.set('monuments', f.monuments.join(','));
  if (f.file) out.set('file', f.file);
  if (f.remove_cover_file) out.set('remove_cover_file', 'true');
  return out;
}

export const articlesApi = {
  list: (f: { kind?: ArticleKind | ''; city?: string; q?: string; page?: number; page_size?: number }) =>
    call<ArticleList>(`/api/articles${qs({ ...f, lang: currentLang() })}`),
  get: (slug: string) => call<ArticleDetail>(`/api/articles/${encodeURIComponent(slug)}${qs({ lang: currentLang() })}`),
  terms: (f: { q?: string; category?: string } = {}) =>
    call<{ enabled: boolean; items: GlossaryTerm[]; categories: { slug: string; label: string; n: number }[] }>(`/api/terms${qs({ ...f, lang: currentLang() })}`),
  term: (slug: string) => call<TermDetail>(`/api/terms/${encodeURIComponent(slug)}${qs({ lang: currentLang(), pilot: true })}`),
  submit: (f: ArticleForm) => call<MyArticle>('/api/articles', { method: 'POST', body: form(f) }),
  update: (id: number, f: Partial<ArticleForm>) => call<MyArticle>(`/api/me/articles/${id}`, { method: 'PATCH', body: form(f) }),
  withdraw: (id: number) => call<void>(`/api/me/articles/${id}`, { method: 'DELETE' }),
  mine: () => call<MyArticle[]>('/api/me/articles'),
  suggestTerm: (body: { term_tr: string; term_en?: string; definition_tr: string; definition_child_tr?: string; category?: string }) =>
    call<MyTerm>('/api/terms', { method: 'POST', body: JSON.stringify(body) }),
  myTerms: () => call<MyTerm[]>('/api/me/terms'),
  withdrawTerm: (id: number) => call<void>(`/api/me/terms/${id}`, { method: 'DELETE' }),
};

// The glossary is small (tens of terms) and every article page marks its terms: it is fetched once per language.
let glossary: Promise<GlossaryTerm[]> | null = null;
let glossaryLang = '';
export function loadGlossary(): Promise<GlossaryTerm[]> {
  if (!glossary || glossaryLang !== currentLang()) {
    glossaryLang = currentLang();
    glossary = articlesApi.terms().then(r => r.items, () => { glossary = null; return []; });
  }
  return glossary;
}
