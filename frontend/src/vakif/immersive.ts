// Turns a backend monument into the site's cinematic story page (pages/Story.tsx).
// Nothing new is written here: "Detaylı Anlatım" is the book's own text, "Hikâyeleştirerek" and "Çocuklar İçin" are
// the narrations stored in the backend. All three are shown whole, paragraph by paragraph, without chapters or
// chapter titles (origin.narrations).
import type { Artifact } from '../data/artifacts';
import { artworkLabel, type PublicDetail, type PublicItem } from './model.ts';

export function toImmersive(item: PublicItem, detail: PublicDetail): Artifact | null {
  const book = detail.text?.trim();
  const story = detail.narrations?.story?.answer?.trim();
  const child = detail.narrations?.child?.answer?.trim();
  const image = detail.images[0] ?? item.image;
  if (!book || !story || !child || !image) return null;
  const card = detail.card;
  const architect = card.persons.find(p => p.role === 'architect')?.name;
  // The documented detail on the photograph: the first decoration record of the book, otherwise none.
  const art = card.artworks[0];
  const artDetail = art ? {
    title: [art.element, art.technique].filter(Boolean).join(' · ') || artworkLabel(art.kind, 'tr'),
    text: [artworkLabel(art.kind, 'tr'), art.script, art.artist, art.date_text, art.text_translation_tr].filter(Boolean).join(' · '),
  } : null;
  const credit = detail.images[0]?.source ? `${detail.images[0].source.book}${detail.images[0].source.page ? `, s. ${detail.images[0].source.page}` : ''}`
    : detail.source.book ?? 'Vakıf Katılım envanter kitabı';
  const [from, to] = detail.source.pages ?? [null, null];
  return {
    id: item.slug, slug: item.slug, name: item.name, city: item.city.name, period: item.period?.name ?? 'Dönemi belirtilmemiş',
    category: item.kind_label, year: item.built.label ?? 'Bilinmiyor', architect: architect ?? 'Bilinmiyor',
    description: item.summary ?? '', coordinates: detail.location ? [detail.location.lat, detail.location.lon] : [39, 35],
    image: image.src, ...(image.alt ? { imageAlt: image.alt } : {}),
    sourceReferences: [{ title: [detail.source.book, from ? `s. ${from}${to && to !== from ? `–${to}` : ''}` : null].filter(Boolean).join(', ') || 'Vakıf Katılım envanter kitabı' }],
    chapters: [],
    detail: artDetail && artDetail.text ? artDetail : (card.current_state ? { title: 'Bugünkü durumu', text: card.current_state } : { title: '', text: '' }),
    origin: {
      photoCredit: credit, shortLabel: 'Detaylı Anlatım', narrations: { short: book, story, child },
      sourcesNote: '“Detaylı Anlatım” envanter kitabındaki metnin kendisidir. “Hikâyeleştirerek” ve “Çocuklar İçin” anlatımlarını yapay zekâ, yalnızca bu kitaptaki bilgilere dayanarak hazırladı; hikâyedeki atmosfer yaratıcı bir yorumdur.',
    },
  };
}
