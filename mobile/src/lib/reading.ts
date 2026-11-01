// Okuma Odası: articles and the glossary (backend/pipeline/articles.py), read-only on the phone. Responses go through
// cachedGet, so a list, an article or the glossary opened once can be read again offline. The text rules are in articleText.ts.
import { cachedGet } from './api';
import { currentLang } from './i18n';

export * from './articleText';

export type ArticleKind = 'city_history' | 'heritage' | 'culture';
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

const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};

// the server filters and pages, as for the site; offline only a choice already opened comes back from the device
const PAGE = 12;
export const loadArticles = (f: { kind?: ArticleKind | null; city?: string | null; q?: string; page?: number } = {}) =>
  cachedGet<ArticleList>(`/api/articles${qs({ kind: f.kind, city: f.city, q: f.q, page: f.page ?? 1, page_size: PAGE, lang: currentLang() })}`);
export const loadArticle = (slug: string) => cachedGet<ArticleDetail>(`/api/articles/${encodeURIComponent(slug)}${qs({ lang: currentLang() })}`);
export const loadTerms = () => cachedGet<{ enabled: boolean; items: GlossaryTerm[]; categories: { slug: string; label: string; n: number }[] }>(`/api/terms${qs({ lang: currentLang() })}`);
export const loadTerm = (slug: string) => cachedGet<TermDetail>(`/api/terms/${encodeURIComponent(slug)}${qs({ lang: currentLang(), pilot: true })}`);

export const formatDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(currentLang() === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
