// Saf yardımcılar: etiketler, form doğrulama, değişen alanları bulma. React'e bağlı değildir (node:test ile sınanır).
import type { DateBasis, ImageStatus, Kind, MonumentDetail, MonumentFields, MonumentState } from './types';

export const KIND_LABELS: Record<Kind, string> = {
  complex: 'Külliye', mosque: 'Cami', masjid: 'Mescit', madrasa: 'Medrese', tomb: 'Türbe', imaret: 'İmaret', bath: 'Hamam',
  fountain: 'Çeşme', han: 'Han', bedesten: 'Bedesten', zawiya: 'Zaviye', tekke: 'Tekke', graveyard: 'Hazire', bridge: 'Köprü',
  library: 'Kütüphane', church: 'Kilise', house: 'Ev', other: 'Diğer',
};
export const BASIS_LABELS: Record<DateBasis, string> = {
  inscription: 'Kitâbe', waqfiyya: 'Vakfiye', archive: 'Arşiv belgesi', literature: 'Kaynaklar', style: 'Üslup (tahmin)',
  tradition: 'Rivayet', parent: 'Bağlı olduğu yapı', unknown: 'Belirtilmemiş',
};
export const STATE_LABELS: Record<MonumentState, string> = { standing: 'Ayakta', ruined: 'Harabe', lost: 'Yok olmuş', rebuilt: 'Yeniden yapılmış' };
export const STATUS_LABELS: Record<ImageStatus, string> = { draft: 'Taslak', reviewed: 'Gözden geçirildi', published: 'Yayında', rejected: 'Atıldı' };

/** images.py bağlama yöntemleri → yöneticinin anlayacağı açıklama. */
export function methodLabel(method: string | null | undefined): string {
  if (!method) return 'Panelden yüklendi';
  const base: Record<string, string> = {
    baslik: 'Eser başlığıyla aynı sayfada', onceki_baslik: 'Önceki başlığın devamındaki sayfa',
    acilis: 'Eserin açılış fotoğrafı (başlık karşı sayfada)',
    baslik_coklu: 'Aynı sayfada iki eser başlığı var', giris: 'Kitap girişi (ilk eserden önce)',
    bolum: 'Şehir tarihi / giriş bölümü', baglanmamis: 'Bölüm ayracından sonra, eser başlamadan',
  };
  const key = method.replace(/_aralik_disi$/, '');
  const label = base[key] ?? method;
  return method.endsWith('_aralik_disi') ? `${label} · eserin sayfa aralığı dışında` : label;
}

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** Formdaki metin → sayı ya da null (boş). Geçersizse NaN. */
export function toNumber(value: string): number | null {
  const v = value.trim().replace(',', '.');
  return v === '' ? null : Number(v);
}

/** İstemci tarafı doğrulama (sunucudaki kurallarla aynı); boş liste = kaydedilebilir. */
export function monumentIssues(f: MonumentFields): string[] {
  const out: string[] = [];
  if (f.name_tr !== undefined && (f.name_tr ?? '').trim().length < 2) out.push('Türkçe ad en az 2 karakter olmalı.');
  const yearOk = (y: number | null | undefined) => y === null || y === undefined || (Number.isInteger(y) && y >= 500 && y <= 2100);
  if (!yearOk(f.built_from) || !yearOk(f.built_to)) out.push('Yıllar 500 ile 2100 arasında tam sayı olmalı.');
  if (f.built_from != null && f.built_to != null && f.built_to < f.built_from) out.push('Bitiş yılı başlangıçtan önce olamaz.');
  if (Number.isNaN(f.lat) || Number.isNaN(f.lon) || Number.isNaN(f.built_from) || Number.isNaN(f.built_to)) out.push('Sayı alanlarına yalnızca sayı yazın.');
  if (f.lat != null && !(f.lat >= 35 && f.lat <= 43)) out.push('Enlem Türkiye sınırları içinde olmalı (35–43).');
  if (f.lon != null && !(f.lon >= 25 && f.lon <= 45)) out.push('Boylam Türkiye sınırları içinde olmalı (25–45).');
  if ((f.lat == null) !== (f.lon == null)) out.push('Enlem ve boylam birlikte girilmeli.');
  for (const [key, max] of [['summary_tr', 2000], ['summary_en', 2000], ['current_state', 1000], ['source_note', 500]] as const) {
    if ((f[key] ?? '').length > max) out.push(`${key} en çok ${max} karakter olabilir.`);
  }
  return out;
}

const EDITABLE: (keyof MonumentFields)[] = ['name_tr', 'name_en', 'alt_names', 'kind', 'district', 'neighborhood', 'address', 'lat',
  'lon', 'period', 'parent', 'built_from', 'built_to', 'date_basis', 'status', 'summary_tr', 'summary_en', 'current_state',
  'source_note', 'review_status'];

/** Yalnızca değişen alanlar (PATCH gövdesi). Boş metin null sayılır. */
export function changedFields(original: MonumentDetail, draft: MonumentFields): MonumentFields {
  const norm = (v: unknown) => typeof v === 'string' ? (v.trim() === '' ? null : v.trim())
    : Array.isArray(v) && v.length === 0 ? null : v ?? null;
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (!(key in draft)) continue;
    const a = norm(original[key as keyof MonumentDetail]);
    const b = norm(draft[key]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[key] = b;
  }
  return out as MonumentFields;
}

// Düzenleme formu: bütün alanlar metin olarak tutulur (boş = null), kaydederken tiplerine çevrilir.
export type MonumentForm = Record<'name_tr' | 'name_en' | 'alt_names' | 'kind' | 'district' | 'neighborhood' | 'address' | 'lat' | 'lon'
  | 'period' | 'parent' | 'built_from' | 'built_to' | 'date_basis' | 'status' | 'summary_tr' | 'summary_en' | 'current_state'
  | 'source_note' | 'review_status', string>;

export function formFromDetail(d: MonumentDetail): MonumentForm {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    name_tr: s(d.name_tr), name_en: s(d.name_en), alt_names: (d.alt_names ?? []).join(', '), kind: s(d.kind), district: s(d.district),
    neighborhood: s(d.neighborhood), address: s(d.address), lat: s(d.lat), lon: s(d.lon), period: s(d.period), parent: s(d.parent),
    built_from: s(d.built_from), built_to: s(d.built_to), date_basis: s(d.date_basis), status: s(d.status), summary_tr: s(d.summary_tr),
    summary_en: s(d.summary_en), current_state: s(d.current_state), source_note: s(d.source_note), review_status: s(d.review_status),
  };
}

export function fieldsFromForm(f: MonumentForm): MonumentFields {
  const text = (v: string) => (v.trim() === '' ? null : v.trim());
  const year = (v: string) => { const n = toNumber(v); return n === null ? null : n; };
  return {
    name_tr: f.name_tr.trim(), name_en: text(f.name_en),
    alt_names: f.alt_names.split(',').map(x => x.trim()).filter(Boolean),
    kind: f.kind as MonumentFields['kind'], district: text(f.district), neighborhood: text(f.neighborhood), address: text(f.address),
    lat: toNumber(f.lat), lon: toNumber(f.lon), period: text(f.period), parent: text(f.parent),
    built_from: year(f.built_from), built_to: year(f.built_to), date_basis: (text(f.date_basis) as DateBasis | null),
    status: (text(f.status) as MonumentState | null), summary_tr: text(f.summary_tr), summary_en: text(f.summary_en),
    current_state: text(f.current_state), source_note: text(f.source_note), review_status: f.review_status as MonumentFields['review_status'],
  };
}

/** Yeni eser slug önizlemesi (sunucu aynı kuralla üretir, çakışırsa -2 ekler). */
export function slugPreview(...parts: (string | null | undefined)[]): string {
  const fold = (s: string) => s.replace(/ı/g, 'i').replace(/İ/g, 'I').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return parts.filter(Boolean).map(p => fold(p!).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).filter(Boolean).join('-').slice(0, 120);
}
