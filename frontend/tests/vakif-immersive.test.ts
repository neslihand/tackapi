import test from 'node:test';
import assert from 'node:assert/strict';
import { toImmersive } from '../src/vakif/immersive.ts';
import { adaptArtifactFeed } from '../src/lib/artifactAdapter.ts';
import { centuryLabel, heroImage, historyByCentury, type PublicDetail, type PublicItem } from '../src/vakif/model.ts';

const item = {
  slug: 'bursa-osmangazi-ulucami', name: 'Ulucami', alt_names: [], kind: 'mosque', kind_label: 'Cami', city: { slug: 'bursa', name: 'Bursa' },
  district: 'Osmangazi', neighborhood: null, period: { slug: 'erken-osmanli', name: 'Erken Osmanlı' },
  built: { from: 1396, to: 1400, label: '1396–1400', basis: 'inscription', basis_label: 'Kitâbesine göre' }, parent: null, children_count: 0,
  summary: 'Özet.', status: 'standing', has_artworks: true, image: null, source: { book: 'Bursa I', pages: [10, 20] },
  architect: 'Ali Neccar', builder: null, patron: 'Yıldırım Bayezid',
} as PublicItem;
const detail = {
  card: { persons: [{ name: 'Ali Neccar', role: 'architect', detail: null, page_start: null }], current_state: 'İbadete açıktır.',
    artworks: [{ kind: 'inscription', element: 'Taç kapı', technique: null, script: 'sülüs', artist: null, date_text: '1399', text_translation_tr: null, page_start: null, images: [] }],
    events: [], children: [] },
  text: 'P1 kitap.\n\nP2 kitap.\n\nP3 kitap.\n\nP4 kitap.\n\nP5 kitap.', text_note: null,
  images: [{ src: '/media/books/bursa-1/1.webp', thumb: '/media/thumbs/books/bursa-1/1.webp', alt: 'Cephe', width: 1, height: 1, source: { book: 'Bursa I', page: 12 } }],
  narrations: { story: { answer: 'H1.\n\nH2.\n\nH3.\n\nH4.', sources: [] }, child: { answer: 'Ç1. Ç2. Ç3. Ç4. Ç5.', sources: [] } },
  source: { book: 'Bursa I', pages: [10, 20], credits: null }, alt_names: [], status: 'standing', review_status: 'published',
  location: { lat: 40.18, lon: 29.06, approximate: false, radius_m: null },
} as unknown as PublicDetail;

test('Arka uç eseri sinematik sayfaya kitap metni ve kayıtlı anlatımlarla, uydurma olmadan çevrilir', () => {
  const a = toImmersive(item, detail)!;
  // üç anlatım da bölünmez ve başlık almaz: kitap metni ve kayıtlı anlatımlar olduğu gibi
  assert.deepEqual(a.chapters, []);
  assert.deepEqual(a.origin?.narrations, { short: detail.text, story: 'H1.\n\nH2.\n\nH3.\n\nH4.', child: 'Ç1. Ç2. Ç3. Ç4. Ç5.' });
  assert.equal(a.architect, 'Ali Neccar');
  assert.deepEqual(a.detail, { title: 'Taç kapı', text: 'Kitâbe · sülüs · 1399' });
  assert.equal(a.origin?.photoCredit, 'Bursa I, s. 12');
  assert.equal(a.origin?.shortLabel, 'Detaylı Anlatım');
  assert.deepEqual(a.sourceReferences, [{ title: 'Bursa I, s. 10–20' }]);
});

test('Kitap metni, anlatımı ya da fotoğrafı olmayan eser sinematik sayfaya girmez', () => {
  assert.equal(toImmersive(item, { ...detail, text: '  ' } as PublicDetail), null);
  assert.equal(toImmersive(item, { ...detail, narrations: { story: null, child: detail.narrations.child } } as PublicDetail), null);
  assert.equal(toImmersive(item, { ...detail, images: [] } as unknown as PublicDetail), null);
  const noArt = toImmersive(item, { ...detail, card: { ...detail.card, artworks: [] } } as PublicDetail)!;
  assert.deepEqual(noArt.detail, { title: 'Bugünkü durumu', text: 'İbadete açıktır.' });
});

test('Veri akışındaki rotalar yalnızca akıştaki eserleri durak alır; durağı kalmayan rota düşer', () => {
  const rec = { id: 'a-1', slug: 'a-1', name: 'A', city: 'Bursa', period: 'P', category: 'Cami', description: 'D', sourceReferences: [{ title: 'Kitap' }] };
  const feed = adaptArtifactFeed({ schemaVersion: 1, items: [rec, { ...rec, id: 'b-2', slug: 'b-2' }], seasons: [
    { id: 'sehir-bursa', kicker: 'ŞEHİR ROTASI', title: 'Bursa rotası', description: '2 durak.', artifactIds: ['b-2', 'yok', 'a-1', 'a-1'] },
    { id: 'bos', title: 'Boş', artifactIds: ['yok'] }, { title: 'Kimliksiz', artifactIds: ['a-1'] }] });
  assert.ok(feed.ok);
  assert.deepEqual(feed.seasons, [{ id: 'sehir-bursa', kicker: 'ŞEHİR ROTASI', title: 'Bursa rotası', description: '2 durak.', artifactIds: ['b-2', 'a-1'] }]);
});

test('Panelde yazılan sorular yalnızca kurallara uyuyor ve eser koleksiyondaysa alınır', () => {
  const rec = { id: 'a-1', slug: 'a-1', name: 'A', city: 'Bursa', period: 'P', category: 'Cami', description: 'D', sourceReferences: [{ title: 'Kitap' }] };
  const good = { id: 'soru-1', question: 'A hangi şehirdedir?', options: ['Bursa', 'Konya', 'Hatay', 'Edirne'], answer: 0, explanation: 'Kitaba göre Bursa’dadır.', artifactId: 'a-1' };
  const feed = adaptArtifactFeed({ schemaVersion: 1, items: [rec], quizQuestions: [good, { ...good, id: 'soru-2', artifactId: 'yok' },
    { ...good, id: 'soru-3', options: ['Bursa', 'Bursa', 'Hatay', 'Edirne'] }, { ...good, id: 'soru-4', answer: 7 }, good] });
  assert.ok(feed.ok);
  assert.deepEqual(feed.quizQuestions, [good]);
});

test('Sayfanın üstüne ve kartın başına kitaptaki ilk görsel gelir; diğerleri sırasıyla kartta gezilir', () => {
  const scan = detail.images[0];
  const whole = { ...scan, src: '/media/books/bursa-1/cephe.webp', width: 1324, height: 888, source: { book: 'Bursa I', page: 13 } };
  const upload = { src: '/media/uploads/drone.webp', thumb: '/media/thumbs/uploads/drone.webp', alt: 'Havadan', width: 2400, height: 1350, caption: 'Drone çekimi', source: null };
  const a = toImmersive(item, { ...detail, images: [scan, whole, upload] } as unknown as PublicDetail)!;
  // daha büyük görsel olsa da ilk görsel (kapak) önce gelir
  assert.equal(a.image, scan.src);
  assert.equal(a.origin?.photoCredit, 'Bursa I, s. 12');
  assert.deepEqual(a.gallery?.map(g => g.src), [scan.src, whole.src, upload.src]);
  // kitap görseli kitap adı ve sayfasıyla, eklenmiş fotoğraf altyazısıyla anılır
  assert.equal(a.gallery?.[1].credit, 'Bursa I, s. 13');
  assert.equal(a.gallery?.[2].credit, 'Drone çekimi');
  assert.equal(heroImage([whole, scan])?.src, whole.src);
  assert.equal(heroImage([]), undefined);
});

test('Tarihçe yıla göre sıralanır ve yüzyıllara ayrılır; tarihsiz olay kitaptaki komşusunun yanında kalır', () => {
  const ev = (years: string | null, d: string) => ({ kind: 'other', years, date_text: null, date_text_hijri: null, basis: null, description_tr: d, person: null, page_start: null });
  const groups = historyByCentury([ev('[1388,1389)', 'yapım'), ev('[1955,1956)', 'restorasyon'), ev(null, 'onarım'), ev('[1920,1921)', 'işgal'), ev('[2010,2011)', 'bugün')]);
  assert.deepEqual(groups.map(g => [g.century, g.events.map(e => e.description_tr)]),
    [[14, ['yapım']], [20, ['işgal', 'restorasyon', 'onarım']], [21, ['bugün']]]);
  assert.deepEqual(historyByCentury([ev(null, 'a'), ev(null, 'b')]).map(g => g.century), [null]);
  assert.equal(centuryLabel(14, 'tr'), 'XIV. yüzyıl');
  assert.equal(centuryLabel(19, 'tr'), 'XIX. yüzyıl');
  assert.equal(centuryLabel(21, 'en'), '21st century');
  assert.equal(centuryLabel(null, 'tr'), 'Tarihi belirtilmemiş');
});
