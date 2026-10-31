import test from 'node:test';
import assert from 'node:assert/strict';
import { toImmersive } from '../src/vakif/immersive.ts';
import { adaptArtifactFeed } from '../src/lib/artifactAdapter.ts';
import { heroImage, type PublicDetail, type PublicItem } from '../src/vakif/model.ts';

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

test('Sayfanın üstüne kitap taraması yerine panelden eklenen yatay fotoğraf gelir; tarama galeride kalır', () => {
  const scan = detail.images[0];
  const tall = { src: '/media/uploads/dikey.webp', thumb: '/media/thumbs/uploads/dikey.webp', alt: 'Minare', width: 900, height: 1600, source: null };
  const wide = { src: '/media/uploads/drone.webp', thumb: '/media/thumbs/uploads/drone.webp', alt: 'Havadan', width: 2400, height: 1350, caption: 'Drone çekimi', source: null };
  const a = toImmersive(item, { ...detail, images: [scan, tall, wide] } as unknown as PublicDetail)!;
  assert.equal(a.image, wide.src);
  assert.equal(a.origin?.photoCredit, 'Drone çekimi');
  // kart için bütün fotoğraflar: seçilen önce, sonra panel sırasıyla; tarama kitap adı ve sayfasıyla
  assert.deepEqual(a.gallery?.map(g => g.src), [wide.src, scan.src, tall.src]);
  assert.equal(a.gallery?.[1].credit, 'Bursa I, s. 12');
  // yalnızca dikey bir fotoğraf eklenmişse o; hiç eklenmemişse eskisi gibi kapak (kitap taraması)
  assert.equal(heroImage([scan, tall])?.src, tall.src);
  assert.equal(heroImage([scan])?.src, scan.src);
  // kitapta kapak (ilk görsel) küçük bir ayrıntıysa eserin en büyük fotoğrafı seçilir; iyi boyuttaki yatay kapak kalır
  const detailShot = { ...scan, src: '/media/books/b/ayrinti.webp', width: 179, height: 261 };
  const whole = { ...scan, src: '/media/books/b/cephe.webp', width: 1324, height: 888 };
  assert.equal(heroImage([detailShot, whole])?.src, whole.src);
  assert.equal(heroImage([{ ...whole, src: '/media/books/b/kapak.webp', width: 1000, height: 700 }, whole])?.src, '/media/books/b/kapak.webp');
  // altyazısız eklenmiş fotoğrafa kitap adı yazılmaz
  assert.equal(toImmersive(item, { ...detail, images: [scan, tall] } as unknown as PublicDetail)!.origin?.photoCredit, '');
});
