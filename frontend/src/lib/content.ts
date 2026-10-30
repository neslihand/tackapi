import type { Artifact, QuizQuestion } from '../data/artifacts';
import type { Season } from '../data/collections';
import { normalize } from './progress.ts';
import { t } from './i18n.ts';

// Local admin edits live in the browser only. Each key replaces the matching base list as a whole.
export const CONTENT_KEY = 'esik:content:v1';
export const PLACEHOLDER_IMAGE = '/images/placeholder.svg';
export type Content = { artifacts: Artifact[]; quizQuestions: QuizQuestion[]; seasons: Season[] };
export type ContentOverrides = Partial<Content>;

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose => typeof value === 'object' && value !== null && !Array.isArray(value);
const filled = (value: unknown, max = 4000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const httpsUrl = (value: unknown) => { try { return typeof value === 'string' && new URL(value).protocol === 'https:'; } catch { return false; } };

export function slugify(value: string) {
  return normalize(value).replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export function artifactIssues(artifact: Artifact, others: Artifact[] = []): string[] {
  const issues: string[] = [];
  if (!filled(artifact.name, 120)) issues.push('Eser adı gerekli.');
  if (!/^[a-z0-9-]{2,60}$/.test(artifact.id) || artifact.id !== artifact.slug) issues.push('Bağlantı adı yalnızca küçük harf, rakam ve tire içermeli.');
  if (others.some(other => other.id === artifact.id)) issues.push('Bu bağlantı adıyla başka bir eser var.');
  for (const [field, label] of [['city', 'Şehir'], ['period', 'Dönem'], ['category', 'Eser türü'], ['year', 'Tarih'], ['architect', 'Mimar / usta']] as const) if (!filled(artifact[field], 120)) issues.push(`${label} gerekli.`);
  if (!filled(artifact.description, 400)) issues.push('Kısa açıklama gerekli (en fazla 400 karakter).');
  const [lat, lng] = Array.isArray(artifact.coordinates) ? artifact.coordinates : [NaN, NaN];
  if (!(Number.isFinite(lat) && Number.isFinite(lng) && lat >= 35 && lat <= 43 && lng >= 25 && lng <= 45)) issues.push('Koordinatlar Türkiye sınırları içinde olmalı (enlem 35–43, boylam 25–45).');
  if (typeof artifact.image !== 'string' || !artifact.image.startsWith('/images/')) issues.push('Görsel yerel bir dosya olmalı.');
  if (artifact.imageAlt !== undefined && !filled(artifact.imageAlt, 600)) issues.push('Görsel betimlemesi boş olamaz (en fazla 600 karakter).');
  if (!Array.isArray(artifact.chapters) || artifact.chapters.length !== 4) issues.push('Hikâye dört bölümden oluşmalı.');
  else artifact.chapters.forEach((chapter, i) => { if (!isObject(chapter) || !filled(chapter.title, 120) || !filled(chapter.short) || !filled(chapter.story) || !filled(chapter.child)) issues.push(`Bölüm ${i + 1}: başlık ve üç anlatım biçimi gerekli.`); });
  if (!isObject(artifact.detail) || !filled(artifact.detail.title, 120) || !filled(artifact.detail.text, 600)) issues.push('Mimari ayrıntı başlığı ve metni gerekli.');
  else if (artifact.detail.focus !== undefined && !(Array.isArray(artifact.detail.focus) && artifact.detail.focus.length === 2 && artifact.detail.focus.every(n => Number.isFinite(n) && n >= 0 && n <= 100))) issues.push('Ayrıntı odağı 0–100 arasında iki sayı olmalı.');
  if (!Array.isArray(artifact.sourceReferences) || !artifact.sourceReferences.length) issues.push('En az bir kaynak gerekli.');
  else if (artifact.sourceReferences.some(source => !isObject(source) || !filled(source.title, 200) || !httpsUrl(source.url))) issues.push('Her kaynağın bir başlığı ve https:// ile başlayan bağlantısı olmalı.');
  return issues;
}

export function questionIssues(question: QuizQuestion, artifactIds: string[]): string[] {
  const issues: string[] = [];
  if (!filled(question.id, 80)) issues.push('Soru kimliği eksik.');
  if (!filled(question.question, 240)) issues.push('Soru metni gerekli.');
  if (!Array.isArray(question.options) || question.options.length !== 4 || question.options.some(option => !filled(option, 120))) issues.push('Dört seçeneğin tamamı doldurulmalı.');
  else if (new Set(question.options.map(option => normalize(option.trim()))).size !== 4) issues.push('Seçenekler birbirinden farklı olmalı.');
  if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) issues.push('Doğru cevabı işaretle.');
  if (!filled(question.explanation, 400)) issues.push('Açıklama gerekli.');
  if (!artifactIds.includes(question.artifactId)) issues.push('Sorunun bağlı olduğu eseri seç.');
  return issues;
}

export function seasonIssues(season: Season, artifactIds: string[]): string[] {
  const issues: string[] = [];
  if (!filled(season.id, 80)) issues.push('Sezon kimliği eksik.');
  if (!filled(season.title, 120)) issues.push('Sezon adı gerekli.');
  if (!filled(season.kicker, 60)) issues.push('Kısa etiket gerekli.');
  if (!filled(season.description, 300)) issues.push('Açıklama gerekli.');
  if (!Array.isArray(season.artifactIds) || !season.artifactIds.length || season.artifactIds.some(id => !artifactIds.includes(id))) issues.push('Rotaya en az bir eser ekle.');
  return issues;
}

const uniqueBy = <T,>(items: T[], key: (item: T) => string) => new Set(items.map(key)).size === items.length;

// Invalid or partial lists fall back to the base data rather than breaking the experience.
export function parseOverrides(raw: string | null, base: Content): { content: Content; overrides: ContentOverrides } {
  const overrides: ContentOverrides = {};
  if (!raw) return { content: base, overrides };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { content: base, overrides }; }
  if (!isObject(data) || data.version !== 1) return { content: base, overrides };
  if (Array.isArray(data.artifacts) && data.artifacts.length) {
    const list = data.artifacts as Artifact[];
    if (list.every(artifact => isObject(artifact) && !artifactIssues(artifact).length) && uniqueBy(list, a => a.id) && base.artifacts.every(b => list.some(a => a.id === b.id))) overrides.artifacts = list;
  }
  const artifacts = overrides.artifacts ?? base.artifacts;
  const ids = artifacts.map(a => a.id);
  if (Array.isArray(data.quizQuestions)) {
    const list = (data.quizQuestions as QuizQuestion[]).filter(q => isObject(q) && !questionIssues(q, ids).length);
    if (list.length >= 3 && uniqueBy(list, q => q.id)) overrides.quizQuestions = list;
  }
  if (Array.isArray(data.seasons)) {
    const list = (data.seasons as Season[]).filter(s => isObject(s) && !seasonIssues(s, ids).length);
    if (uniqueBy(list, s => s.id)) overrides.seasons = list;
  }
  return { content: { artifacts, quizQuestions: overrides.quizQuestions ?? base.quizQuestions, seasons: overrides.seasons ?? base.seasons.map(s => ({ ...s, artifactIds: s.artifactIds.filter(id => ids.includes(id)) })).filter(s => s.artifactIds.length) }, overrides };
}

export function serializeOverrides(overrides: ContentOverrides) {
  return JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), ...overrides });
}

// A quiz round asks up to five questions; larger pools are sampled so replays differ.
export function pickRound<T>(pool: T[], size = 5, random = Math.random): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return pool.length <= size ? pool : copy.slice(0, size);
}
// Alt text for an artifact image. Without a description the name is used so the image is never unlabeled.
export const imageAlt = (artifact: { name: string; image: string; imageAlt?: string }) =>
  artifact.image === PLACEHOLDER_IMAGE ? t('Görsel hazırlanıyor', 'Image in preparation') : artifact.imageAlt ?? t(`${artifact.name} görseli`, `Picture of ${artifact.name}`);
export const roundScore = (correct: number, total: number) => total ? Math.round(correct / total * 100) : 0;

export function blankArtifact(name: string): Artifact {
  const slug = slugify(name) || 'yeni-eser';
  return {
    id: slug, slug, name, city: '', period: '', category: '', year: '', architect: '', description: '',
    coordinates: [39, 35], image: PLACEHOLDER_IMAGE, sourceReferences: [{ title: '', url: '' }],
    chapters: ['Eserin doğuşu', 'Geçmişin izleri', 'Mimari sırlar', 'Günümüze yolculuk'].map(title => ({ title, short: '', story: '', child: '' })),
    detail: { title: '', text: '' },
  };
}
