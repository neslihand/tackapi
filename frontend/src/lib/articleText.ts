// Pure helpers for the articles and the glossary (backend/pipeline/articles.py uses the same text format):
// paragraphs are separated by a blank line, a line starting with '## ' is a subheading, a paragraph starting with '> '
// is a quotation. No React here, so node:test can check it.

export type Block = { type: 'h' | 'p' | 'q'; text: string; id?: string };

const ASCII: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
export function slugifyHeading(text: string): string {
  return fold(text).replace(/[çğıöşü]/g, c => ASCII[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'bolum';
}

/** Article text → blocks. Subheadings get an id (for the table of contents); repeated ids get a number. */
export function articleBlocks(body: string): Block[] {
  const out: Block[] = [];
  const ids = new Map<string, number>();
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
      if (line.startsWith('## ')) {
        flush();
        const text = line.slice(3).trim();
        const base = slugifyHeading(text), n = (ids.get(base) ?? 0) + 1;
        ids.set(base, n);
        out.push({ type: 'h', text, id: n > 1 ? `${base}-${n}` : base });
      } else buf.push(line);
    }
    flush();
  }
  return out;
}

/** 'mukarnas' → 'Mukarnas' (Turkish: 'imaret' → 'İmaret'); the rest stays as written. */
export const capitalize = (s: string) => s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s;
export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}_]+/gu) ?? []).length;
export const readingMinutes = (text: string) => Math.max(1, Math.round(wordCount(text) / 200));

// Turkish-aware folding that keeps every character in place (one in, one out), so positions found in the folded
// text are positions in the original: 'İ' → 'i', 'I' → 'ı', circumflexes dropped ('Bânî' → 'bani').
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

export type TermLike = { slug: string; term: string };
export type Piece = string | { text: string; term: string };

/**
 * Marks glossary terms in a paragraph: only the first occurrence of each term in the article (`seen` is shared by
 * all its paragraphs), at the start of a word (Turkish suffixes may follow: 'mukarnaslı'), longest terms first so
 * 'kalem işi' wins over 'kalem'. Terms shorter than 3 letters are never marked.
 */
export function markTerms(text: string, terms: TermLike[], seen: Set<string>): Piece[] {
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

/** The glossary's letter groups in Turkish alphabetical order (the backend already sorts the terms). */
export function letterGroups<T extends { initial: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.initial, [...(groups.get(item.initial) ?? []), item]);
  return [...groups];
}
export const TURKISH_ALPHABET = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.split('');

/** Visitor article rules (the same as the backend's): title 5–160, summary up to 400, text 400–40.000 characters. */
export function submissionIssues(f: { title: string; body: string; summary?: string }, t: (tr: string, en: string) => string): string[] {
  const out: string[] = [];
  const title = f.title.trim(), body = f.body.trim();
  if (title.length < 5 || title.length > 160) out.push(t('Başlık 5–160 karakter olmalı.', 'The title must be 5–160 characters.'));
  if ((f.summary ?? '').length > 400) out.push(t('Özet en çok 400 karakter olabilir.', 'The summary can be at most 400 characters.'));
  if (body.length < 400) out.push(t(`Metin en az 400 karakter olmalı (şu an ${body.length}).`, `The text must be at least 400 characters (now ${body.length}).`));
  if (body.length > 40000) out.push(t('Metin en çok 40.000 karakter olabilir.', 'The text can be at most 40,000 characters.'));
  return out;
}
