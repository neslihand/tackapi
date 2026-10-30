// Okuma Odası: articles and the glossary (backend/pipeline/articles.py), read-only on the phone. Responses go through
// cachedGet, so an article or the glossary opened once can be read again offline.
// The text helpers are the site's (frontend/src/lib/articleText.ts): a blank line separates paragraphs, a line
// starting with '## ' is a subheading, a paragraph starting with '> ' is a quotation.
import { cachedGet } from './api';
import { currentLang } from './i18n';

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
export type ArticleList = { enabled: boolean; total: number; items: ArticleItem[];
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

// the list is fetched once (the backend's largest page, 60) and filtered on the phone, so filters work offline too
export const loadArticles = () => cachedGet<ArticleList>(`/api/articles${qs({ page_size: 60, lang: currentLang() })}`);
export const loadArticle = (slug: string) => cachedGet<ArticleDetail>(`/api/articles/${encodeURIComponent(slug)}${qs({ lang: currentLang() })}`);
export const loadTerms = () => cachedGet<{ enabled: boolean; items: GlossaryTerm[]; categories: { slug: string; label: string; n: number }[] }>(`/api/terms${qs({ lang: currentLang() })}`);
export const loadTerm = (slug: string) => cachedGet<TermDetail>(`/api/terms/${encodeURIComponent(slug)}${qs({ lang: currentLang(), pilot: true })}`);

// ------------------------------------------------------------------------------------------- text
export type Block = { type: 'h' | 'p' | 'q'; text: string };

export function articleBlocks(body: string): Block[] {
  const out: Block[] = [];
  for (const chunk of (body ?? '').replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    let buf: string[] = [];
    const flush = () => {
      if (!buf.length) return;
      const text = buf.join(' ');
      out.push(text.startsWith('> ') ? { type: 'q', text: text.slice(2).trim() } : { type: 'p', text });
      buf = [];
    };
    for (const raw of chunk.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('## ')) { flush(); out.push({ type: 'h', text: line.slice(3).trim() }); }
      else buf.push(line);
    }
    flush();
  }
  return out;
}

/** 'mukarnas' → 'Mukarnas' (Turkish: 'imaret' → 'İmaret'). */
export const capitalize = (s: string) => s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s;

// Turkish-aware folding that keeps every character in place, so positions in the folded text are positions in the
// original: 'İ' → 'i', 'I' → 'ı', circumflexes dropped ('Bânî' → 'bani').
const CIRCUMFLEX: Record<string, string> = { â: 'a', î: 'i', û: 'u', ê: 'e' };
export function fold(text: string): string {
  let out = '';
  for (const c of text) {
    const lower = c === 'I' ? 'ı' : c === 'İ' ? 'i' : c.toLocaleLowerCase('tr-TR');
    const one = lower.length === c.length ? lower : c;
    out += CIRCUMFLEX[one] ?? one;
  }
  return out;
}

export type Piece = string | { text: string; term: string };

/** Marks glossary terms: only the first occurrence in the article (`seen` is shared by its paragraphs), at the start
 *  of a word (suffixes may follow: 'mukarnaslı'), longest terms first; terms shorter than 3 letters are never marked. */
export function markTerms(text: string, terms: { slug: string; term: string }[], seen: Set<string>): Piece[] {
  const folded = fold(text);
  const candidates = terms.filter(t => t.term.trim().length >= 3 && !seen.has(t.slug))
    .map(t => ({ slug: t.slug, needle: fold(t.term.trim()) })).sort((a, b) => b.needle.length - a.needle.length);
  const hits: { start: number; end: number; slug: string }[] = [];
  for (const c of candidates) {
    let from = 0;
    while (from <= folded.length) {
      const at = folded.indexOf(c.needle, from);
      if (at < 0) break;
      const before = at === 0 ? '' : folded[at - 1];
      const free = !hits.some(h => at < h.end && h.start < at + c.needle.length);
      if (!/\p{L}/u.test(before) && free) { hits.push({ start: at, end: at + c.needle.length, slug: c.slug }); seen.add(c.slug); break; }
      from = at + 1;
    }
  }
  if (!hits.length) return [text];
  hits.sort((a, b) => a.start - b.start);
  const out: Piece[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start > pos) out.push(text.slice(pos, h.start));
    out.push({ text: text.slice(h.start, h.end), term: h.slug });
    pos = h.end;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

/** The glossary's letter groups (the backend already sorts the terms in Turkish order). */
export function letterGroups<T extends { initial: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.initial, [...(groups.get(item.initial) ?? []), item]);
  return [...groups];
}
