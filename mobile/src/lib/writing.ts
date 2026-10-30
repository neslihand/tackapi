// Sending to the Reading Room (backend/pipeline/articles.py): a visitor's article and term suggestions. Both need an
// account (the Bearer session) and wait for an editor's approval; a rejected one comes back with the editor's note
// and can be corrected and sent again; a published article can only be withdrawn.
// The limits are the backend's, checked here first so the visitor sees them before sending.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';
import { request } from './api';
import { t } from './i18n';
import type { ArticleKind, Cover } from './reading';

export type Status = 'draft' | 'pending' | 'published' | 'rejected';
export type MyArticle = { id: number; slug: string; kind: ArticleKind; title: string; summary: string | null; body: string; city: string | null;
  status: Status; reject_reason: string | null; cover: Cover; created_at: string; updated_at: string; published_at: string | null;
  monuments: { slug: string; name: string }[] };
export type MyTerm = { id: number; slug: string; term: string; term_en: string; definition: string; definition_child: string | null;
  category: string | null; status: Status; reject_reason: string | null; created_at: string };
export type Draft = { kind: ArticleKind; title: string; summary: string; body: string; city: string; monuments: string[]; cover_alt: string };
export type TermDraft = { term_tr: string; term_en: string; definition_tr: string; definition_child_tr: string; category: string };

export const EMPTY_DRAFT: Draft = { kind: 'heritage', title: '', summary: '', body: '', city: '', monuments: [], cover_alt: '' };
export const LIMITS = { title: [5, 160], summary: 400, body: [400, 40000], term: [2, 80], definition: [10, 1200], child: 600 } as const;
export const CATEGORIES = ['architecture', 'decoration', 'waqf', 'title', 'daily_life', 'other'] as const;
export const categoryName = (c: string) => ({ architecture: t('Mimari', 'Architecture'), decoration: t('Süsleme', 'Decoration'), waqf: t('Vakıf', 'Waqf'),
  title: t('Unvan ve görev', 'Titles and offices'), daily_life: t('Gündelik hayat', 'Daily life'), other: t('Diğer', 'Other') } as Record<string, string>)[c] ?? c;
export const kindName = (k: ArticleKind) => ({ city_history: t('Şehir tarihi', 'City history'), heritage: t('Vakıf eserleri', 'Foundation works'), culture: t('Vakıf kültürü', 'Waqf culture') })[k];
export const kindNote = (k: ArticleKind) => ({
  city_history: t('Bir şehrin ya da semtin geçmişi, vakıflarla şekillenen hayatı.', 'The past of a city or quarter, its life shaped by foundations.'),
  heritage: t('Bir caminin, hanın, çeşmenin ya da külliyenin hikâyesi.', 'The story of a mosque, han, fountain or complex.'),
  culture: t('Vakıf geleneği, imaret, mahalle dayanışması, gündelik hayat.', 'The waqf tradition, soup kitchens, neighbourhood solidarity, daily life.'),
})[k];
export const statusName = (s: Status) => ({ draft: t('Taslak', 'Draft'), pending: t('Onay bekliyor', 'Awaiting review'), published: t('Yayında', 'Published'), rejected: t('Düzeltme istendi', 'Changes requested') })[s];

export function articleIssues(d: Draft): string[] {
  const out: string[] = [];
  const title = d.title.trim(), body = d.body.trim();
  if (title.length < LIMITS.title[0] || title.length > LIMITS.title[1]) out.push(t('Başlık 5–160 karakter olmalı.', 'The title must be 5–160 characters.'));
  if (d.summary.length > LIMITS.summary) out.push(t('Özet en çok 400 karakter olabilir.', 'The summary can be at most 400 characters.'));
  if (body.length < LIMITS.body[0]) out.push(t(`Metin en az 400 karakter olmalı (şu an ${body.length}).`, `The text must be at least 400 characters (now ${body.length}).`));
  if (body.length > LIMITS.body[1]) out.push(t('Metin en çok 40.000 karakter olabilir.', 'The text can be at most 40,000 characters.'));
  return out;
}

export function termIssues(d: TermDraft): string[] {
  const out: string[] = [];
  const term = d.term_tr.trim(), def = d.definition_tr.trim();
  if (term.length < LIMITS.term[0] || term.length > LIMITS.term[1]) out.push(t('Terim 2–80 karakter olmalı.', 'The term must be 2–80 characters.'));
  if (def.length < LIMITS.definition[0] || def.length > LIMITS.definition[1]) out.push(t('Tanım 10–1.200 karakter olmalı.', 'The definition must be 10–1,200 characters.'));
  if (d.definition_child_tr.length > LIMITS.child) out.push(t('Çocuklar için tanım en çok 600 karakter olabilir.', 'The definition for children can be at most 600 characters.'));
  return out;
}

export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}_]+/gu) ?? []).length;
export const readingMinutes = (text: string) => Math.max(1, Math.round(wordCount(text) / 200));

function articleForm(d: Draft, cover: ImagePickerAsset | null, removeCover: boolean) {
  const form = new FormData();
  form.append('kind', d.kind);
  form.append('title', d.title.trim());
  form.append('summary', d.summary.trim());
  form.append('body', d.body);
  form.append('city', d.city);
  form.append('monuments', d.monuments.join(','));
  form.append('cover_alt', d.cover_alt.trim());
  if (cover) {
    // the browser's picker gives a File; React Native's FormData takes {uri, name, type}
    const file = Platform.OS === 'web' && cover.file ? cover.file
      : { uri: cover.uri, name: cover.fileName ?? 'kapak.jpg', type: cover.mimeType ?? 'image/jpeg' } as unknown as Blob;
    form.append('file', file);
  }
  if (removeCover) form.append('remove_cover_file', 'true');
  return form;
}

export const writingApi = {
  submit: (d: Draft, cover: ImagePickerAsset | null) => request<MyArticle>('/api/articles', { method: 'POST', body: articleForm(d, cover, false) }),
  update: (id: number, d: Draft, cover: ImagePickerAsset | null, removeCover: boolean) =>
    request<MyArticle>(`/api/me/articles/${id}`, { method: 'PATCH', body: articleForm(d, cover, removeCover) }),
  withdraw: (id: number) => request<void>(`/api/me/articles/${id}`, { method: 'DELETE' }),
  mine: () => request<MyArticle[]>('/api/me/articles'),
  suggestTerm: (d: TermDraft) => request<MyTerm>('/api/terms', { method: 'POST', body: JSON.stringify({
    term_tr: d.term_tr.trim(), definition_tr: d.definition_tr.trim(),
    ...(d.term_en.trim() ? { term_en: d.term_en.trim() } : {}), ...(d.definition_child_tr.trim() ? { definition_child_tr: d.definition_child_tr.trim() } : {}),
    ...(d.category ? { category: d.category } : {}) }) }),
  myTerms: () => request<MyTerm[]>('/api/me/terms'),
  withdrawTerm: (id: number) => request<void>(`/api/me/terms/${id}`, { method: 'DELETE' }),
};

// the unsent article is kept on the device while it is written
const DRAFT_KEY = 'esik:article-draft:v1';
export async function readDraft(): Promise<Draft | null> {
  try { const raw = await AsyncStorage.getItem(DRAFT_KEY); return raw ? { ...EMPTY_DRAFT, ...JSON.parse(raw) } : null; } catch { return null; }
}
export function saveDraft(d: Draft | null) {
  (d ? AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(d)) : AsyncStorage.removeItem(DRAFT_KEY)).catch(() => {});
}
