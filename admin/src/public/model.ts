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
};

export type Card = {
  name_tr: string; name_en: string | null; kind: string; district: string | null; neighborhood: string | null; city: string;
  period: string | null; built_years: string | null; date_basis: string | null; current_state: string | null; book: string | null;
  parent: string | null; parent_slug: string | null;
  events: { kind: string; years: string | null; date_text: string | null; date_text_hijri: string | null; basis: string | null;
    description_tr: string; person: string | null; page_start: number | null }[];
  persons: { name: string; role: string; detail: string | null; page_start: number | null }[];
  artworks: { kind: string; element: string | null; technique: string | null; script: string | null; artist: string | null;
    date_text: string | null; text_translation_tr: string | null; page_start: number | null }[];
  children: { name_tr: string; kind: string }[];
};

export type PublicDetail = {
  card: Card; text: string | null; text_note: string | null; images: PublicImage[];
  source: { book: string | null; pages: [number | null, number | null]; credits: { authors?: string[] | null; editor?: string | null } | null };
  alt_names: string[] | null; status: string | null; review_status: string;
};

export type Check = { key: string; ok: boolean; required: boolean; label: string; hint: string };
export type Preview = { review_status: string; item: PublicItem; detail: PublicDetail; checks: Check[] };
export type ChatSource = { ref: string; book: string; pages: string; heading: string; route: string; chunk_id: number };
export type ChatReply = { answer: string; sources: ChatSource[]; notes: string[]; cached: boolean };

const T = {
  tr: {
    back: 'Koleksiyona dön', explore: 'HİKÂYEYİ KEŞFET', period: 'DÖNEM', date: 'TARİH', kind: 'TÜR', location: 'KONUM',
    people: 'KİŞİLER', mode: 'Anlatım şeklini seç', modes: ['Kısa ve Öz', 'Hikâyeleştirerek', 'Çocuklar İçin'],
    ask: 'Bu eseri anlat', askHint: 'Yapay zekâ rehber, yalnızca envanter kitabındaki bilgilere dayanarak anlatır.',
    draftChat: 'Sohbet, eser yayına alındıktan sonra çalışır.', storyNote: 'Anlatımdaki atmosfer yaratıcı bir yorumdur; tarihî bilgiler kaynaklara dayanır.',
    sources: 'Kaynaklar', gallery: 'Fotoğraflar', timeline: 'Tarihçe', artworks: 'Süsleme ve sanat', text: 'Kitaptaki metin',
    readText: 'Envanter kitabındaki metni oku', children: 'Bu yapının parçaları', partOf: 'Bağlı olduğu yapı',
    sourceBook: 'Kaynak kitap', pages: 'sayfa', authors: 'Yazarlar', photoSource: 'Fotoğraf', today: 'Bugünkü durumu',
    loading: 'Anlatım hazırlanıyor…', card: 'ESER', discover: 'Hikâyeyi keşfet', pending: 'onay bekliyor', noImage: 'GÖRSEL HAZIRLANIYOR',
    close: 'Kapat', prev: 'Önceki', next: 'Sonraki',
  },
  en: {
    back: 'Back to collection', explore: 'EXPLORE THE STORY', period: 'PERIOD', date: 'DATE', kind: 'TYPE', location: 'LOCATION',
    people: 'PEOPLE', mode: 'Choose a narration style', modes: ['Short', 'As a story', 'For children'],
    ask: 'Tell me about this monument', askHint: 'The AI guide only uses information from the inventory book.',
    draftChat: 'Chat becomes available once the monument is published.', storyNote: 'The atmosphere is a creative interpretation; historical facts come from the sources.',
    sources: 'Sources', gallery: 'Photographs', timeline: 'History', artworks: 'Decoration and art', text: 'Text from the book',
    readText: 'Read the inventory book text', children: 'Parts of this complex', partOf: 'Part of',
    sourceBook: 'Source book', pages: 'pages', authors: 'Authors', photoSource: 'Photo', today: 'Current state',
    loading: 'Preparing the narration…', card: 'MONUMENT', discover: 'Explore the story', pending: 'awaiting review', noImage: 'IMAGE IN PREPARATION',
    close: 'Close', prev: 'Previous', next: 'Next',
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
export const roleLabel = (role: string, lang: Lang) => (ROLES[role] ?? ['', ''])[lang === 'en' ? 1 : 0];
export const eventLabel = (kind: string, lang: Lang) => (EVENTS[kind] ?? EVENTS.other)[lang === 'en' ? 1 : 0];

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
