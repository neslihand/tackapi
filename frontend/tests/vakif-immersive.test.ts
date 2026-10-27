import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER_TITLES, divide, toImmersive, units } from '../src/vakif/immersive.ts';
import { adaptArtifactFeed } from '../src/lib/artifactAdapter.ts';
import type { PublicDetail, PublicItem } from '../src/vakif/model.ts';

test('Metin paragraf sınırlarından, uzunlukça dengeli ve sırası bozulmadan bölünür', () => {
  const parts = ['a'.repeat(10), 'b'.repeat(10), 'c'.repeat(10), 'd'.repeat(10), 'e'.repeat(10)];
  const out = divide(parts, 4);
  assert.equal(out.length, 4);
  assert.equal(out.join('\n\n'), parts.join('\n\n'));               // hiçbir şey eklenmez ya da atılmaz
  assert.deepEqual(divide(['x', 'y'], 4), []);
  assert.equal(divide(['uzun '.repeat(80), 'k', 'k', 'k', 'k'], 4).length, 4);
});

test('Paragraf azsa cümlelerden bölünür', () => {
  assert.deepEqual(units('Bir. İki! Üç? Dört.'), ['Bir.', 'İki!', 'Üç?', 'Dört.']);
  assert.equal(units('P1\n\nP2\n\nP3\n\nP4').length, 4);
});

const item = {
  slug: 'bursa-osmangazi-ulucami', name: 'Ulucami', alt_names: [], kind: 'mosque', kind_label: 'Cami', city: { slug: 'bursa', name: 'Bursa' },
  district: 'Osmangazi', neighborhood: null, period: { slug: 'erken-osmanli', name: 'Erken Osmanlı' },
  built: { from: 1396, to: 1400, label: '1396–1400', basis: 'inscription', basis_label: 'Kitâbesine göre' }, parent: null, children_count: 0,
  summary: 'Özet.', status: 'standing', has_artworks: true, image: null, source: { book: 'Bursa I', pages: [10, 20] },
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
  assert.equal(a.chapters.length, 4);
  assert.deepEqual(a.chapters.map(c => c.title), CHAPTER_TITLES);
  assert.equal(a.chapters.map(c => c.short).join('\n\n'), detail.text);
  // hikâye ve çocuk anlatımı bölünmez, başlık almaz: kayıtlı metin olduğu gibi
  assert.ok(a.chapters.every(c => c.story === '' && c.child === ''));
  assert.deepEqual(a.origin?.narrations, { story: 'H1.\n\nH2.\n\nH3.\n\nH4.', child: 'Ç1. Ç2. Ç3. Ç4. Ç5.' });
  assert.equal(a.architect, 'Ali Neccar');
  assert.deepEqual(a.detail, { title: 'Taç kapı', text: 'Kitâbe · sülüs · 1399' });
  assert.equal(a.origin?.photoCredit, 'Bursa I, s. 12');
  assert.equal(a.origin?.shortLabel, 'Detaylı Anlatım');
  assert.deepEqual(a.sourceReferences, [{ title: 'Bursa I, s. 10–20' }]);
});

test('Anlatımı ya da fotoğrafı olmayan eser sinematik sayfaya girmez', () => {
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
