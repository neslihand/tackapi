// Yazar metinleri (editör tarafı): tipler, etiketler, yönetim uçları ve taslak atıflarını ayrıştırma.
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

export type AuthorWorkRow = {
  id: number; title: string; city: string | null;   // 81 ilden birinin adı; sistemdeki şehir/eser kaydına bağlı değil
  author: string; status: WorkStatus; review_note: string | null; reviewed_by: string | null; reviewed_at: string | null;
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
export type AuthorAccount = { id: number; name: string; email: string; must_change: boolean; active: boolean; created_by: string | null;
  created_at: string; last_login_at: string | null; works: number };

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const base = '/api/admin/author';

// Editör (yönetici) uçları: yazarların metinlerini okur, onaylar ya da düzeltme ister; yazar hesaplarını yönetir.
// Yazarın notlarını ve metnini değiştirmez; yazarlar kendi panelinde (../yazar-paneli) çalışır.
export const authorApi = {
  works: (status: WorkStatus | '' = '') => request<{ enabled: boolean; items: AuthorWorkRow[]; counts: Partial<Record<WorkStatus, number>> }>(
    `${base}/works${status ? `?status=${status}` : ''}`),
  work: (id: number) => request<WorkDetail>(`${base}/works/${id}`),
  exportText: (id: number) => request<{ text: string; filename: string }>(`${base}/works/${id}/export`),
  review: (id: number, decision: 'approved' | 'changes', note?: string) =>
    request<WorkDetail>(`${base}/works/${id}/review`, json('POST', { decision, note: note || null })),
  accounts: () => request<AuthorAccount[]>(`${base}/accounts`),
  createAccount: (name: string, email: string) => request<AuthorAccount & { temp_password: string }>(`${base}/accounts`, json('POST', { name, email })),
  updateAccount: (id: number, body: { name?: string; active?: boolean }) => request<AuthorAccount>(`${base}/accounts/${id}`, json('PATCH', body)),
  resetPassword: (id: number) => request<AuthorAccount & { temp_password: string }>(`${base}/accounts/${id}/reset`, { method: 'POST' }),
};

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
