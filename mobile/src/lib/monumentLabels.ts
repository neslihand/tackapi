// Labels shared with frontend/src/vakif/model.ts. Keep both dictionaries aligned.
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
export const roleLabel = (role: string, lang: 'tr' | 'en') => (ROLES[role] ?? ['', ''])[lang === 'en' ? 1 : 0];
export const artworkLabel = (kind: string, lang: 'tr' | 'en') => (ARTWORKS[kind] ?? ARTWORKS.other)[lang === 'en' ? 1 : 0];
export const eventLabel = (kind: string, lang: 'tr' | 'en') => (EVENTS[kind] ?? EVENTS.other)[lang === 'en' ? 1 : 0];

