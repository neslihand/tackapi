import type { Artifact } from '../data/artifacts';
import type { ArtifactChapter, ArtifactFeedIssue, ArtifactFeedResult, DiscoveryArtifact } from './artifactContract';
import type { Season } from '../data/collections';
import { PLACEHOLDER_IMAGE, questionIssues } from './content.ts';
import { t } from './i18n.ts';
import type { QuizQuestion } from '../data/artifacts';

type ObjectValue = Record<string, unknown>;
const isObject = (value: unknown): value is ObjectValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const filled = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const httpsUrl = (value: unknown): value is string => {
  try { return typeof value === 'string' && new URL(value).protocol === 'https:'; } catch { return false; }
};
const localImage = (value: unknown): value is string => typeof value === 'string' && /^\/images\/[a-zA-Z0-9_-]+\.(svg|png|jpe?g|webp)$/.test(value);
// Photos served by the backend next to the site (/media/books/bursa-1/019-a1.webp); no '..' segments.
const mediaImage = (value: unknown): value is string => typeof value === 'string' && /^\/media\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(png|jpe?g|webp)$/.test(value) && !value.includes('..');

export function adaptArtifactFeed(input: unknown): ArtifactFeedResult {
  const issues: ArtifactFeedIssue[] = [];
  const issue = (path: string, message: string) => { issues.push({ path, message }); };
  if (!isObject(input) || input.schemaVersion !== 1 || !Array.isArray(input.items)) {
    return { ok: false, issues: [{ path: '$', message: 'schemaVersion: 1 ve items dizisi gerekli.' }] };
  }
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const artifacts: DiscoveryArtifact[] = [];
  input.items.forEach((value: unknown, index: number) => {
    const path = `items[${index}]`;
    const start = issues.length;
    if (!isObject(value)) { issue(path, 'Eser bir nesne olmalı.'); return; }
    // IDs remain opaque and stable; they are never regenerated from a title.
    if (!filled(value.id, 200) || value.id !== value.id.trim() || Object.hasOwn(Object.prototype, value.id) || value.id === 'prototype') issue(`${path}.id`, 'Geçerli bir kalıcı eser kimliği gerekli.');
    if (typeof value.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) || value.slug.length > 120) issue(`${path}.slug`, 'Küçük harf, rakam ve tire içeren bir bağlantı adı gerekli.');
    for (const field of ['name', 'city', 'period', 'category'] as const) {
      if (!filled(value[field], 200)) issue(`${path}.${field}`, 'Boş olmayan metin gerekli (en fazla 200 karakter).');
    }
    if (!filled(value.description, 12000)) issue(`${path}.description`, 'Kaynaklı açıklama gerekli (en fazla 12000 karakter).');
    for (const field of ['year', 'architect'] as const) {
      if (value[field] != null && !filled(value[field], 200)) issue(`${path}.${field}`, 'Metin, null veya eksik alan olmalı.');
    }
    const coordinates = value.coordinates;
    if (coordinates != null && !(Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every(n => typeof n === 'number' && Number.isFinite(n)) && coordinates[0] >= 35 && coordinates[0] <= 43 && coordinates[1] >= 25 && coordinates[1] <= 45)) {
      issue(`${path}.coordinates`, 'Türkiye için [enlem, boylam] gerekli; bilinmiyorsa null kullan.');
    }
    if (value.image != null && !localImage(value.image) && !mediaImage(value.image) && !httpsUrl(value.image)) issue(`${path}.image`, 'Yerel /images/ ya da /media/ dosyası veya HTTPS görsel adresi gerekli.');
    if (value.imageAlt != null && !filled(value.imageAlt, 600)) issue(`${path}.imageAlt`, 'Görsel betimlemesi metin, null veya eksik alan olmalı (en fazla 600 karakter).');
    const sources: DiscoveryArtifact['sourceReferences'] = [];
    if (!Array.isArray(value.sourceReferences) || !value.sourceReferences.length) issue(`${path}.sourceReferences`, 'En az bir kaynak gerekli.');
    else value.sourceReferences.forEach((source: unknown, i: number) => {
      if (!isObject(source) || !filled(source.title, 300) || (source.url !== undefined && !httpsUrl(source.url))) issue(`${path}.sourceReferences[${i}]`, 'Kaynak başlığı gerekli; bağlantı varsa HTTPS olmalı.');
      else sources.push({ title: source.title.trim(), ...(source.url !== undefined ? { url: source.url as string } : {}) });
    });
    const chapters: ArtifactChapter[] = [];
    if (value.chapters != null) {
      if (!Array.isArray(value.chapters)) issue(`${path}.chapters`, 'Bölümler bir dizi olmalı.');
      else value.chapters.forEach((chapter: unknown, i: number) => {
        if (!isObject(chapter) || !filled(chapter.title, 200) || !filled(chapter.short, 12000)) {
          issue(`${path}.chapters[${i}]`, 'Bölüm başlığı ve kısa anlatım gerekli.'); return;
        }
        for (const mode of ['story', 'child'] as const) {
          if (chapter[mode] !== undefined && !filled(chapter[mode], 12000)) issue(`${path}.chapters[${i}].${mode}`, 'Anlatım varsa boş olmayan metin olmalı.');
        }
        chapters.push({ title: chapter.title.trim(), short: chapter.short.trim(), ...(typeof chapter.story === 'string' ? { story: chapter.story.trim() } : {}), ...(typeof chapter.child === 'string' ? { child: chapter.child.trim() } : {}) });
      });
    }
    let detail: DiscoveryArtifact['detail'] = null;
    if (value.detail != null) {
      if (!isObject(value.detail) || !filled(value.detail.title, 200) || !filled(value.detail.text, 4000)) issue(`${path}.detail`, 'Ayrıntı başlığı ve metni gerekli.');
      else {
        const focus = value.detail.focus;
        if (focus !== undefined && !(Array.isArray(focus) && focus.length === 2 && focus.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100))) issue(`${path}.detail.focus`, '0–100 aralığında iki sayı gerekli.');
        detail = { title: value.detail.title.trim(), text: value.detail.text.trim(), ...(focus !== undefined ? { focus: focus as [number, number] } : {}) };
      }
    }
    if (typeof value.id === 'string') { if (ids.has(value.id)) issue(`${path}.id`, 'Tekrarlanan eser kimliği.'); ids.add(value.id); }
    if (typeof value.slug === 'string') { if (slugs.has(value.slug)) issue(`${path}.slug`, 'Tekrarlanan bağlantı adı.'); slugs.add(value.slug); }
    if (issues.length !== start) return;
    artifacts.push({
      id: value.id as string, slug: value.slug as string,
      name: (value.name as string).trim(), city: (value.city as string).trim(),
      period: (value.period as string).trim(), category: (value.category as string).trim(),
      description: (value.description as string).trim(),
      // A missing fact reads "Bilinmiyor" / "Unknown"; pages that should not show it check known() first.
      year: typeof value.year === 'string' ? value.year.trim() : t('Bilinmiyor', 'Unknown'),
      architect: typeof value.architect === 'string' ? value.architect.trim() : t('Bilinmiyor', 'Unknown'),
      coordinates: coordinates == null ? null : [...coordinates as [number, number]],
      ...(coordinates != null && value.coordinatesApproximate === true ? { coordinatesApproximate: true } : {}),
      image: typeof value.image === 'string' ? value.image : PLACEHOLDER_IMAGE,
      ...(typeof value.image === 'string' && typeof value.imageAlt === 'string' ? { imageAlt: value.imageAlt.trim() } : {}),
      sourceReferences: sources, chapters, detail,
    });
  });
  return issues.length ? { ok: false, issues }
    : { ok: true, artifacts, seasons: adaptSeasons(input.seasons, artifacts), quizQuestions: adaptQuestions(input.quizQuestions, artifacts) };
}

// Written quiz questions are extra too: one that breaks the quiz rules (content.ts → questionIssues) or asks about a
// work outside this feed is dropped.
function adaptQuestions(value: unknown, artifacts: DiscoveryArtifact[]): QuizQuestion[] {
  if (!Array.isArray(value)) return [];
  const ids = artifacts.map(a => a.id);
  const seen = new Set<string>();
  return value.filter((q): q is QuizQuestion => isObject(q) && typeof q.id === 'string' && !seen.has(q.id)
    && Array.isArray(q.options) && !questionIssues(q as QuizQuestion, ids).length && Boolean(seen.add(q.id)))
    .map(q => ({ id: q.id, question: q.question.trim(), options: q.options.map(o => o.trim()), answer: q.answer, explanation: q.explanation.trim(), artifactId: q.artifactId }));
}

// Routes are extra: a malformed one is dropped rather than failing the whole collection. Stops must be items of this
// feed; a route left without stops is not shown.
function adaptSeasons(value: unknown, artifacts: DiscoveryArtifact[]): Season[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(artifacts.map(a => a.id));
  const seen = new Set<string>();
  const out: Season[] = [];
  for (const season of value) {
    if (!isObject(season) || !filled(season.id, 120) || !filled(season.title, 200) || seen.has(season.id)) continue;
    const artifactIds = Array.isArray(season.artifactIds) ? [...new Set(season.artifactIds.filter((id): id is string => typeof id === 'string' && known.has(id)))] : [];
    if (!artifactIds.length) continue;
    seen.add(season.id);
    out.push({ id: season.id, title: season.title.trim(), kicker: filled(season.kicker, 60) ? season.kicker.trim() : 'KEŞİF ROTASI',
      description: filled(season.description, 600) ? season.description.trim() : '', artifactIds });
  }
  return out;
}

export function hasImmersiveStory(artifact: DiscoveryArtifact): artifact is Artifact {
  return artifact.coordinates !== null && artifact.detail !== null && artifact.chapters.length === 4
    && artifact.chapters.every(chapter => Boolean(chapter.story && chapter.child));
}
