// Yazar paneli: tipler, etiketler, API çağrıları ve taslak atıflarını ayrıştırma (saf kısımlar node:test ile sınanır).
import { request } from './api.ts';

export type Topic = 'location' | 'history' | 'inscription' | 'architecture' | 'decoration' | 'repairs' | 'today' | 'other';
export type Certainty = 'documented' | 'estimate' | 'tradition' | 'own';
export type SourceKind = 'book' | 'article' | 'archive' | 'waqfiyya' | 'inscription' | 'inventory' | 'field' | 'oral' | 'web' | 'other';
export type WorkStatus = 'research' | 'writing' | 'submitted' | 'changes' | 'approved';
export type DraftLength = 'short' | 'medium' | 'long';
export type DraftStyle = 'inventory' | 'plain';

export const TOPIC_LABELS: Record<Topic, string> = {
  location: 'Konum ve çevre', history: 'Yapım, bânî ve tarihçe', inscription: 'Kitâbe ve vakfiye', architecture: 'Mimari',
  decoration: 'Süsleme ve sanat', repairs: 'Onarımlar', today: 'Günümüzdeki durumu', other: 'Diğer',
};
export const TOPICS = Object.keys(TOPIC_LABELS) as Topic[];
export const CORE_TOPICS: Topic[] = ['location', 'history', 'inscription', 'architecture', 'decoration', 'repairs', 'today'];
export const CERTAINTY_LABELS: Record<Certainty, string> = { documented: 'Belgeye dayalı', estimate: 'Tahmin', tradition: 'Rivayet', own: 'Kendi bilgim / gözlemim' };
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  book: 'Kitap', article: 'Makale', archive: 'Arşiv belgesi', waqfiyya: 'Vakfiye', inscription: 'Kitâbe', inventory: 'Envanter kitabı',
  field: 'Saha çalışması', oral: 'Sözlü kaynak', web: 'Web', other: 'Diğer',
};
export const STATUS_STEPS: { key: WorkStatus; label: string }[] = [
  { key: 'research', label: 'Araştırma' }, { key: 'writing', label: 'Yazım' }, { key: 'submitted', label: 'Editörde' }, { key: 'approved', label: 'Onaylandı' },
];
export const WORK_STATUS_LABELS: Record<WorkStatus, string> = { research: 'Araştırma', writing: 'Yazımda', submitted: 'Editörde', changes: 'Düzeltme istendi', approved: 'Onaylandı' };
export const LENGTH_LABELS: Record<DraftLength, string> = { short: 'Kısa', medium: 'Orta', long: 'Uzun' };
export const STYLE_LABELS: Record<DraftStyle, string> = { inventory: 'Envanter üslubu', plain: 'Sade (genel okur)' };

export type Me = { id: number; name: string; email: string; must_change: boolean };
export type City = { slug: string; name_tr: string };
export type MonumentHit = { slug: string; name_tr: string; city: string; city_tr: string; district: string | null };
export type AuthorWorkRow = {
  id: number; title: string; author: string; city: string | null; city_tr: string | null; monument: string | null; monument_tr: string | null;
  status: WorkStatus; review_note: string | null; reviewed_by: string | null; reviewed_at: string | null;
  submitted_at: string | null; created_at: string; updated_at: string; notes: number; sources: number; drafts: number;
};
export type AuthorSource = { id: number; kind: SourceKind; authors: string | null; year: string | null; title: string; publisher: string | null;
  url: string | null; label: string; entry: string; used: number };
export type AuthorNote = { id: number; no: number; topic: Topic; body: string; source_id: number | null; pages: string | null;
  certainty: Certainty; origin: 'author' | 'book'; created_at: string; updated_at: string };
export type DraftWarning = { kind: 'template' | 'unknown_ref' | 'no_ref' | 'year' | 'name'; text: string; items?: string[]; paragraph?: number };
export type DraftConflict = { about: string; notes: number[]; detail: string };
export type AuthorDraft = { id: number; body: string; ai: boolean; model: string | null; length: DraftLength | null; warnings: DraftWarning[];
  conflicts: DraftConflict[]; gaps: string[]; created_by: string | null; created_at: string; refs?: number[]; rendered?: string };
export type DraftVersion = { id: number; ai: boolean; model: string | null; length: DraftLength | null; created_by: string | null; created_at: string; chars: number };
export type Coverage = { topics: { topic: Topic; label: string; notes: number }[]; missing: string[]; unsourced: number };
export type WorkDetail = { work: AuthorWorkRow; notes: AuthorNote[]; sources: AuthorSource[]; draft: AuthorDraft | null;
  history: DraftVersion[]; coverage: Coverage; model: string; fake: boolean };
export type NoteFields = { body?: string; topic?: Topic; source_id?: number | null; pages?: string | null; certainty?: Certainty };
export type SourceFields = { kind?: SourceKind; authors?: string; year?: string; title?: string; publisher?: string; url?: string };

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const base = '/api/author';
const q = (p: Record<string, string>) => { const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString(); return s ? `?${s}` : ''; };

export const authorApi = {
  login: (email: string, password: string) => request<Me & { token: string; hours: number }>(`${base}/login`, json('POST', { email, password })),
  logout: () => request<void>(`${base}/logout`, { method: 'POST' }),
  me: () => request<Me>(`${base}/me`),
  changePassword: (current: string, next: string) => request<Me>(`${base}/password`, json('POST', { current, new: next })),
  cities: () => request<City[]>('/api/cities'),
  monuments: (query: string, city?: string) => request<MonumentHit[]>(`${base}/monuments${q({ q: query, city: city ?? '' })}`),
  works: () => request<{ items: AuthorWorkRow[] }>(`${base}/works`),
  create: (body: { title: string; city?: string; monument?: string }) => request<WorkDetail>(`${base}/works`, json('POST', body)),
  work: (id: number) => request<WorkDetail>(`${base}/works/${id}`),
  update: (id: number, body: { title?: string; city?: string; monument?: string }) => request<WorkDetail>(`${base}/works/${id}`, json('PATCH', body)),
  remove: (id: number) => request<void>(`${base}/works/${id}`, { method: 'DELETE' }),
  addSource: (id: number, body: SourceFields) => request<WorkDetail & { id: number }>(`${base}/works/${id}/sources`, json('POST', body)),
  updateSource: (sid: number, body: SourceFields) => request<WorkDetail>(`${base}/sources/${sid}`, json('PATCH', body)),
  deleteSource: (sid: number) => request<WorkDetail>(`${base}/sources/${sid}`, { method: 'DELETE' }),
  addNote: (id: number, body: NoteFields) => request<WorkDetail>(`${base}/works/${id}/notes`, json('POST', body)),
  addNotesBulk: (id: number, body: { text: string; topic: Topic; source_id: number | null; pages: string | null; certainty: Certainty }) =>
    request<WorkDetail & { added: number }>(`${base}/works/${id}/notes/bulk`, json('POST', body)),
  updateNote: (nid: number, body: NoteFields) => request<WorkDetail>(`${base}/notes/${nid}`, json('PATCH', body)),
  deleteNote: (nid: number) => request<WorkDetail>(`${base}/notes/${nid}`, { method: 'DELETE' }),
  importBook: (id: number) => request<WorkDetail & { added: number }>(`${base}/works/${id}/import-book`, { method: 'POST' }),
  summarize: (id: number, body: { length: DraftLength; style: DraftStyle; notes?: number[] }) =>
    request<WorkDetail>(`${base}/works/${id}/summarize`, json('POST', body)),
  saveDraft: (id: number, body: string) => request<WorkDetail>(`${base}/works/${id}/draft`, json('PUT', { body })),
  version: (id: number, did: number) => request<AuthorDraft>(`${base}/works/${id}/drafts/${did}`),
  exportText: (id: number) => request<{ text: string; filename: string }>(`${base}/works/${id}/export`),
  submit: (id: number) => request<WorkDetail>(`${base}/works/${id}/submit`, { method: 'POST' }),
  withdraw: (id: number) => request<WorkDetail>(`${base}/works/${id}/withdraw`, { method: 'POST' }),
};

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** Taslak paragrafını metin ve atıf parçalarına ayırır: 'A [N1, N3] b' → [{text:'A '}, {refs:[1,3]}, {text:' b'}]. */
export type Segment = { text: string } | { refs: number[] };
export function segments(paragraph: string): Segment[] {
  const out: Segment[] = [];
  const re = /\[N(\d+)((?:\s*[,;]\s*N?\d+)*)\]/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(paragraph))) {
    if (m.index > last) out.push({ text: paragraph.slice(last, m.index) });
    out.push({ refs: [Number(m[1]), ...(m[2].match(/\d+/g) ?? []).map(Number)] });
    last = m.index + m[0].length;
  }
  if (last < paragraph.length) out.push({ text: paragraph.slice(last) });
  return out;
}
export const paragraphsOf = (body: string) => body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
export const wordsOf = (body: string) => (body.replace(/\[N[\d,;\sN]+\]/g, '').match(/\S+/g) ?? []).filter(w => /[\p{L}\d]/u.test(w)).length;
/** Şifre kuralı (sunucuyla aynı): en az 10 karakter, geçici şifreden farklı. Boş liste = uygun. */
export function passwordIssues(current: string, next: string, again: string): string[] {
  const out: string[] = [];
  if (next.length < 10) out.push('Yeni şifre en az 10 karakter olmalı.');
  if (next && next === current) out.push('Yeni şifre eskisiyle aynı olamaz.');
  if (again !== next) out.push('Yeni şifre iki kutuda aynı olmalı.');
  return out;
}
