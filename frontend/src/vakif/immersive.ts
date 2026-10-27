// Turns a backend monument into the site's cinematic story page (pages/Story.tsx).
// Nothing new is written here. "Detaylı Anlatım" is the book's own text, divided into chapters at paragraph (or, when
// there are too few paragraphs, sentence) boundaries under the site's general chapter titles. "Hikâyeleştirerek" and
// "Çocuklar İçin" are the narrations stored in the backend, shown whole, paragraph by paragraph (origin.narrations).
import type { Artifact } from '../data/artifacts';
import { artworkLabel, type PublicDetail, type PublicItem } from './model.ts';

export const CHAPTER_TITLES = ['Eserin doğuşu', 'Geçmişin izleri', 'Mimari sırlar', 'Günümüze yolculuk'];
const CHAPTERS = CHAPTER_TITLES.length;

const paragraphsOf = (text: string) => text.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
const sentencesOf = (text: string) => (text.match(/[^.!?…]+(?:[.!?…]+[”"’']?|$)/g) ?? [text]).map(s => s.trim()).filter(Boolean);

/** Units to divide: paragraphs, or sentences when there are fewer paragraphs than chapters. */
export function units(text: string, n = CHAPTERS): string[] {
  const paragraphs = paragraphsOf(text);
  return paragraphs.length >= n ? paragraphs : paragraphsOf(text).flatMap(sentencesOf);
}

/** Divides the units into n consecutive parts of about the same length; never splits a unit. */
export function divide(parts: string[], n: number): string[] {
  if (parts.length < n) return [];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out: string[][] = [[]];
  let done = 0;
  parts.forEach((part, i) => {
    const left = parts.length - i;                        // units still to place, this one included
    const open = n - out.length;                          // chapters still to start after the current one
    const current = out[out.length - 1];
    if (current.length && (left <= open || done >= total * out.length / n)) out.push([part]);
    else current.push(part);
    done += part.length;
  });
  return out.map(group => group.join('\n\n'));
}

export function toImmersive(item: PublicItem, detail: PublicDetail): Artifact | null {
  const story = detail.narrations?.story?.answer;
  const child = detail.narrations?.child?.answer;
  const image = detail.images[0] ?? item.image;
  if (!detail.text || !story || !child || !image) return null;
  const book = units(detail.text);
  const n = Math.min(CHAPTERS, book.length);
  if (n < 2) return null;
  const short = divide(book, n);
  const card = detail.card;
  const architect = card.persons.find(p => p.role === 'architect')?.name;
  // The documented detail of the third chapter: the first decoration record of the book, otherwise none.
  const art = card.artworks[0];
  const artDetail = art ? {
    title: [art.element, art.technique].filter(Boolean).join(' · ') || artworkLabel(art.kind, 'tr'),
    text: [artworkLabel(art.kind, 'tr'), art.script, art.artist, art.date_text, art.text_translation_tr].filter(Boolean).join(' · '),
  } : null;
  const credit = detail.images[0]?.source ? `${detail.images[0].source.book}${detail.images[0].source.page ? `, s. ${detail.images[0].source.page}` : ''}`
    : detail.source.book ?? 'Vakıf Katılım envanter kitabı';
  return {
    id: item.slug, slug: item.slug, name: item.name, city: item.city.name, period: item.period?.name ?? 'Dönemi belirtilmemiş',
    category: item.kind_label, year: item.built.label ?? 'Bilinmiyor', architect: architect ?? 'Bilinmiyor',
    description: item.summary ?? '', coordinates: detail.location ? [detail.location.lat, detail.location.lon] : [39, 35],
    image: image.src, ...(image.alt ? { imageAlt: image.alt } : {}),
    sourceReferences: [{ title: [detail.source.book, detail.source.pages?.[0] ? `s. ${detail.source.pages[0]}${detail.source.pages[1] && detail.source.pages[1] !== detail.source.pages[0] ? `–${detail.source.pages[1]}` : ''}` : null].filter(Boolean).join(', ') || 'Vakıf Katılım envanter kitabı' }],
    // story and child stay empty here: those tellings are shown whole from origin.narrations
    chapters: short.map((text, i) => ({ title: CHAPTER_TITLES[i] ?? `Bölüm ${i + 1}`, short: text, story: '', child: '' })),
    detail: artDetail && artDetail.text ? artDetail : (card.current_state ? { title: 'Bugünkü durumu', text: card.current_state } : { title: '', text: '' }),
    origin: {
      photoCredit: credit, shortLabel: 'Detaylı Anlatım', narrations: { story: story.trim(), child: child.trim() },
      sourcesNote: '“Detaylı Anlatım” envanter kitabındaki metnin kendisidir. “Hikâyeleştirerek” ve “Çocuklar İçin” anlatımlarını yapay zekâ, yalnızca bu kitaptaki bilgilere dayanarak hazırladı; hikâyedeki atmosfer yaratıcı bir yorumdur.',
    },
  };
}
