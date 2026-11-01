// Turns a backend monument into the site's cinematic story page (pages/Story.tsx).
// Nothing new is written here: "Detaylı Anlatım" is the book's own text, "Hikâyeleştirerek" and "Çocuklar İçin" are
// the narrations stored in the backend. All three are shown whole, paragraph by paragraph, without chapters or
// chapter titles (origin.narrations).
import type { Artifact } from '../data/artifacts';
import { artworkLabel, heroImage, type PublicDetail, type PublicImage, type PublicItem } from './model.ts';
import { makers } from '../lib/vakifApi.ts';
import { t } from '../lib/i18n.ts';

export function toImmersive(item: PublicItem, detail: PublicDetail): Artifact | null {
  const book = detail.text?.trim();
  const story = detail.narrations?.story?.answer?.trim();
  const child = detail.narrations?.child?.answer?.trim();
  const hero = heroImage(detail.images);
  const image = hero ?? item.image;
  if (!book || !story || !child || !image) return null;
  const card = detail.card;
  // The documented detail on the photograph: the first decoration record of the book, otherwise none.
  const art = card.artworks[0];
  const artDetail = art ? {
    title: [art.element, art.technique].filter(Boolean).join(' · ') || artworkLabel(art.kind, 'tr'),
    text: [artworkLabel(art.kind, 'tr'), art.script, art.artist, art.date_text, art.text_translation_tr].filter(Boolean).join(' · '),
  } : null;
  // A book scan names its book and page; a photo added in the panel names only its caption, if it has one.
  const creditOf = (img: PublicImage) => img.source ? `${img.source.book}${img.source.page ? `, s. ${img.source.page}` : ''}` : img.caption ?? '';
  const credit = hero ? creditOf(hero) : detail.source.book ?? t('Vakıf Katılım envanter kitabı', 'Vakıf Katılım inventory book');
  // All the photos for the card at the top: the chosen one first, then the others in the panel's order.
  const gallery = hero ? [hero, ...detail.images.filter(i => i !== hero)].map((img, i) => ({ src: img.src, alt: img.alt ?? t(`${item.name} fotoğrafı ${i + 1}`, `Photo ${i + 1} of ${item.name}`), credit: creditOf(img) })) : undefined;
  const [from, to] = detail.source.pages ?? [null, null];
  return {
    id: item.slug, slug: item.slug, name: item.name, city: item.city.name, period: item.period?.name ?? t('Dönemi belirtilmemiş', 'Era not given'),
    category: item.kind_label, kind: item.kind, ...(item.period ? { periodSlug: item.period.slug } : {}), year: item.built.label ?? 'Bilinmiyor', architect: makers(item) ?? 'Bilinmiyor',
    description: item.summary ?? '', coordinates: detail.location ? [detail.location.lat, detail.location.lon] : [39, 35],
    image: image.src, ...(image.alt ? { imageAlt: image.alt } : {}), ...(gallery ? { gallery } : {}),
    sourceReferences: [{ title: [detail.source.book, from ? `${t('s.', 'p.')} ${from}${to && to !== from ? `–${to}` : ''}` : null].filter(Boolean).join(', ') || t('Vakıf Katılım envanter kitabı', 'Vakıf Katılım inventory book') }],
    chapters: [],
    detail: artDetail && artDetail.text ? artDetail : (card.current_state ? { title: t('Bugünkü durumu', 'Its condition today'), text: card.current_state } : { title: '', text: '' }),
    origin: {
      photoCredit: credit, shortLabel: t('Detaylı Anlatım', 'In Detail'), narrations: { short: book, story, child },
      authors: (detail.source.credits?.authors ?? []).filter(Boolean), editor: detail.source.credits?.editor ?? null, book: detail.source.book,
      sourcesNote: t('“Detaylı Anlatım” envanter kitabındaki metnin kendisidir. “Hikâyeleştirerek” ve “Çocuklar İçin” anlatımlarını yapay zekâ, yalnızca bu kitaptaki bilgilere dayanarak hazırladı; hikâyedeki atmosfer yaratıcı bir yorumdur.', '“In Detail” is the text of the inventory book itself. The “As a story” and “For children” tellings were written by AI from this book’s information alone; the atmosphere of the story is a creative interpretation.'),
    },
  };
}
