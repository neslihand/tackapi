// Kopya: admin/src/public (model.ts). Panel önizlemesi ile site aynı eser sayfasını gösterir; birleştirmede tek kaynağa
// indirilecek. Burada yapılan değişikliği oraya da uygula (ön yüze özgü farklar 'site:' notuyla işaretli).
// Herkese açık eser verisi (GET /api/monuments, /api/monuments/{slug}) ve ziyaretçi arayüzü metinleri.
// Bu klasör (src/public) yalnızca API verisine bağlıdır; birleştirmede ön yüzün eser sayfası olarak taşınabilir.

export type Lang = 'tr' | 'en';
export type PublicImage = { src: string; thumb: string; alt: string | null; width: number | null; height: number | null;
  caption?: string | null; source?: { book: string; page: number | null } | null; review_status?: string };

export type PublicItem = {
  slug: string; name: string; alt_names: string[]; kind: string; kind_label: string; city: { slug: string; name: string };
  district: string | null; neighborhood: string | null; period: { slug: string; name: string } | null;
  built: { from: number | null; to: number | null; label: string | null; basis: string | null; basis_label: string | null };
  parent: { slug: string; name: string } | null; children_count: number; summary: string | null; status: string | null;
  has_artworks: boolean; image: PublicImage | null; source: { book: string | null; pages: [number, number] | null };
  // kitaptaki sırayla, virgülle; bânî (patron) mimar diye gösterilmez
  architect?: string | null; builder?: string | null; patron?: string | null;
};

export type Card = {
  name_tr: string; name_en: string | null; kind: string; district: string | null; neighborhood: string | null; city: string;
  period: string | null; built_years: string | null; date_basis: string | null; current_state: string | null; book: string | null;
  parent: string | null; parent_slug: string | null;
  events: { kind: string; years: string | null; date_text: string | null; date_text_hijri: string | null; basis: string | null;
    description_tr: string; person: string | null; page_start: number | null }[];
  persons: { name: string; role: string; detail: string | null; page_start: number | null }[];
  artworks: { kind: string; element: string | null; technique: string | null; script: string | null; artist: string | null;
    date_text: string | null; text_translation_tr: string | null; page_start: number | null; images: PublicImage[] }[];
  children: { name_tr: string; kind: string }[];
};

export type NarrationSource = { book: string; pages: string; heading: string };
/** Önceden üretilip kaydedilmiş anlatım (narration tablosu); sayfa açılınca yapay zekâ çağrılmaz. */
export type Narration = { answer: string; sources: NarrationSource[]; generated_at?: string };
export type NarrationMode = 'story' | 'child';

/** Eserin konumu. approximate: otomatik bulundu, henüz doğrulanmadı; nokta değil belirsizlik dairesi (radius_m) gösterilir. */
export type PublicLocation = { lat: number; lon: number; approximate: boolean; radius_m: number | null };

export type PublicDetail = {
  card: Card; text: string | null; text_note: string | null; images: PublicImage[]; location?: PublicLocation | null;
  narrations: Record<NarrationMode, Narration | null>;
  source: { book: string | null; pages: [number | null, number | null]; credits: { authors?: string[] | null; editor?: string | null } | null };
  alt_names: string[] | null; status: string | null; review_status: string;
};

export type Check = { key: string; ok: boolean; required: boolean; label: string; hint: string };
/** POST /api/visual-search: confident ise match eserdir; değilse adaylar "emin değiliz" diye gösterilir. */
export type VisualCandidate = { item: PublicItem; score: number; photo: { src: string; thumb: string } };
export type VisualSearchResult = { confident: boolean; match: PublicItem | null; candidates: VisualCandidate[] };

export type NarrationStatus = { mode: NarrationMode; lang: Lang; stale: boolean; model: string | null; generated_by: string | null;
  edited_by: string | null; edited_at: string | null;
  generated_at: string; unsupported: string[] };
export type Preview = { review_status: string; item: PublicItem; detail: PublicDetail; checks: Check[]; narrations: NarrationStatus[] };

const T = {
  tr: {
    back: 'Koleksiyona dön', explore: 'HİKÂYEYİ KEŞFET', period: 'DÖNEM', date: 'TARİH', kind: 'TÜR', location: 'KONUM',
    people: 'KİŞİLER', mode: 'Anlatım şeklini seç', modes: ['Detaylı Anlatım', 'Hikâyeleştirerek', 'Çocuklar İçin'],
    aiNote: 'Bu anlatımı yapay zekâ, yalnızca envanter kitabındaki bilgilere dayanarak hazırladı.',
    notReady: 'Bu anlatım henüz hazırlanmadı.', usedSources: 'Bu anlatımda yararlanılan kaynaklar', noText: 'Bu eser için kitapta metin bulunmuyor.', storyNote: 'Anlatımdaki atmosfer yaratıcı bir yorumdur; tarihî bilgiler kaynaklara dayanır.',
    sources: 'Kaynaklar', gallery: 'Fotoğraflar', timeline: 'Tarihçe', artworks: 'Süsleme ve sanat', text: 'Kitaptaki metin',
    children: 'Bu yapının parçaları', partOf: 'Bağlı olduğu yapı',
    sourceBook: 'Kaynak kitap', pages: 'sayfa', authors: 'Yazarlar', photoSource: 'Fotoğraf', today: 'Bugünkü durumu',
    loading: 'Anlatım hazırlanıyor…', card: 'ESER', discover: 'Hikâyeyi keşfet', pending: 'onay bekliyor', noImage: 'GÖRSEL HAZIRLANIYOR',
    close: 'Kapat', prev: 'Önceki', next: 'Sonraki',
    map: 'Haritada', mapApprox: 'Yaklaşık konum: otomatik bulundu, henüz doğrulanmadı. Yapı bu dairenin içinde bir yerde olmalı.',
    mapOpen: 'OpenStreetMap’te aç', mapLabel: 'Eserin haritadaki konumu',
    vsTitle: 'Fotoğrafla eser bul', vsUpload: 'Fotoğraf seç', vsChange: 'Başka fotoğraf seç', vsSearching: 'Fotoğraf eserlerle karşılaştırılıyor…',
    vsHint: 'JPEG, PNG ya da WebP · en fazla 10 MB. Fotoğrafın saklanmaz; yalnızca karşılaştırma için kullanılır.',
    vsMatch: 'Fotoğraftaki eser büyük olasılıkla bu:', vsUnsure: 'Emin olamadık. Fotoğrafına en çok benzeyen eserler:',
    vsNone: 'Fotoğrafa benzeyen bir eser bulamadık. Yapının tamamını gösteren, net bir fotoğrafla yeniden dene.',
    vsTooBig: 'Fotoğraf 10 MB\'tan küçük olmalı.', vsBadType: 'Yalnızca JPEG, PNG ya da WebP fotoğraf seçebilirsin.',
    vsMatched: 'Eşleşen kitap fotoğrafı', vsYours: 'Senin fotoğrafın', vsSimilarity: 'benzerlik',
  },
  en: {
    back: 'Back to collection', explore: 'EXPLORE THE STORY', period: 'PERIOD', date: 'DATE', kind: 'TYPE', location: 'LOCATION',
    people: 'PEOPLE', mode: 'Choose a narration style', modes: ['In detail', 'As a story', 'For children'],
    aiNote: 'This narration was prepared by AI using only information from the inventory book.',
    notReady: 'This narration is not ready yet.', usedSources: 'Sources used in this narration', noText: 'The book has no text for this monument.', storyNote: 'The atmosphere is a creative interpretation; historical facts come from the sources.',
    sources: 'Sources', gallery: 'Photographs', timeline: 'History', artworks: 'Decoration and art', text: 'Text from the book',
    children: 'Parts of this complex', partOf: 'Part of',
    sourceBook: 'Source book', pages: 'pages', authors: 'Authors', photoSource: 'Photo', today: 'Current state',
    loading: 'Preparing the narration…', card: 'MONUMENT', discover: 'Explore the story', pending: 'awaiting review', noImage: 'IMAGE IN PREPARATION',
    close: 'Close', prev: 'Previous', next: 'Next',
    map: 'On the map', mapApprox: 'Approximate location: found automatically, not yet verified. The building should be somewhere within this circle.',
    mapOpen: 'Open in OpenStreetMap', mapLabel: 'Location of the monument on the map',
    vsTitle: 'Find a monument by photo', vsUpload: 'Choose a photo', vsChange: 'Choose another photo', vsSearching: 'Comparing your photo with the monuments…',
    vsHint: 'JPEG, PNG or WebP · up to 10 MB. Your photo is not stored; it is only used for the comparison.',
    vsMatch: 'The monument in your photo is most likely:', vsUnsure: 'We are not sure. The monuments most similar to your photo:',
    vsNone: 'We could not find a similar monument. Try again with a clear photo showing the whole building.',
    vsTooBig: 'The photo must be smaller than 10 MB.', vsBadType: 'Only JPEG, PNG or WebP photos are accepted.',
    vsMatched: 'Matching book photo', vsYours: 'Your photo', vsSimilarity: 'similarity',
  },
} as const;
export const strings = (lang: Lang) => T[lang];

const ROLES: Record<string, [string, string]> = {
  patron: ['Bânî', 'Patron'], founder: ['Kurucu', 'Founder'], architect: ['Mimar', 'Architect'], builder: ['Usta', 'Builder'],
  restorer: ['Onaran', 'Restorer'], buried: ['Medfun', 'Buried here'], trustee: ['Mütevelli', 'Trustee'], imam: ['İmam', 'Imam'],
  sheikh: ['Şeyh', 'Sheikh'], calligrapher: ['Hattat', 'Calligrapher'], artist: ['Sanatçı', 'Artist'], other: ['', ''],
};
const EVENTS: Record<string, [string, string]> = {
  construction: ['Yapım', 'Construction'], completion: ['Tamamlanma', 'Completion'], repair: ['Onarım', 'Repair'],
  restoration: ['Restorasyon', 'Restoration'], addition: ['Ek yapı', 'Addition'], conversion: ['İşlev değişikliği', 'Conversion'],
  earthquake: ['Deprem', 'Earthquake'], fire: ['Yangın', 'Fire'], destruction: ['Yıkım', 'Destruction'],
  registration: ['Tescil', 'Registration'], waqf: ['Vakıf', 'Waqf'], burial: ['Defin', 'Burial'], political: ['Siyasi olay', 'Political event'],
  other: ['Olay', 'Event'],
};
const ARTWORKS: Record<string, [string, string]> = {
  inscription: ['Kitâbe', 'Inscription'], calligraphy_panel: ['Hat levhası', 'Calligraphy panel'], tile: ['Çini', 'Tile'],
  hand_painted: ['Kalem işi', 'Hand-painted decoration'], wood_carving: ['Ahşap oyma', 'Wood carving'],
  kundekari: ['Kündekâri', 'Kündekâri woodwork'], stone_carving: ['Taş işçiliği', 'Stone carving'], stucco: ['Alçı işçiliği', 'Stucco'],
  mother_of_pearl: ['Sedef kakma', 'Mother-of-pearl inlay'], stained_glass: ['Revzen (renkli cam)', 'Stained glass'],
  metalwork: ['Maden işçiliği', 'Metalwork'], textile: ['Dokuma', 'Textile'], gravestone: ['Mezar taşı', 'Gravestone'],
  furnishing: ['Ahşap donatı', 'Furnishing'], other: ['Süsleme', 'Decoration'],
};
export const roleLabel = (role: string, lang: Lang) => (ROLES[role] ?? ['', ''])[lang === 'en' ? 1 : 0];
export const artworkLabel = (kind: string, lang: Lang) => (ARTWORKS[kind] ?? ARTWORKS.other)[lang === 'en' ? 1 : 0];
export const eventLabel = (kind: string, lang: Lang) => (EVENTS[kind] ?? EVENTS.other)[lang === 'en' ? 1 : 0];

/** Haritanın yakınlığı: kesin konumda yapı görünür, yaklaşık konumda daire tamamen sığar. */
export function mapZoom(loc: PublicLocation): number {
  if (!loc.approximate || !loc.radius_m) return 17;
  return loc.radius_m <= 150 ? 16 : loc.radius_m <= 300 ? 15 : 14;
}

/** OpenStreetMap bağlantısı (yol tarifi için ziyaretçi oradan devam eder); yaklaşık konumda işaretçi konmaz. */
export function osmLink(loc: PublicLocation): string {
  const lat = loc.lat.toFixed(6), lon = loc.lon.toFixed(6), z = mapZoom(loc);
  return loc.approximate ? `https://www.openstreetmap.org/#map=${z}/${lat}/${lon}`
    : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${z}/${lat}/${lon}`;
}

/** '[1425,1427)' → '1425–1426' */
export function rangeText(r: string | null | undefined): string {
  const m = /^\[(-?\d+),(-?\d+)\)$/.exec(r ?? '');
  if (!m) return r ?? '';
  const a = Number(m[1]), b = Number(m[2]) - 1;
  return a === b ? String(a) : `${a}–${b}`;
}

/** Cevapta atıf yapılan kaynak işaretleri: "… [S1, F0] … [S3]" → {S1, F0, S3} */
export function citedRefs(answer: string): Set<string> {
  return new Set(splitCitations(answer).flatMap(part => ('refs' in part ? part.refs : [])));
}

/** Sohbet cevabını metin ve kaynak işaretlerine böler: "… [S1, F0]." → [{text}, {refs:['S1','F0']}, …] */
export function splitCitations(answer: string): ({ text: string } | { refs: string[] })[] {
  const out: ({ text: string } | { refs: string[] })[] = [];
  let last = 0;
  for (const m of answer.matchAll(/\[((?:[SFT]\d*)(?:\s*,\s*[SFT]\d*)*)\]/g)) {
    if (m.index! > last) out.push({ text: answer.slice(last, m.index) });
    out.push({ refs: m[1].split(',').map(s => s.trim()) });
    last = m.index! + m[0].length;
  }
  if (last < answer.length) out.push({ text: answer.slice(last) });
  return out;
}
