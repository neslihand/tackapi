import test from 'node:test';
import assert from 'node:assert/strict';
import { fromVakifChat, makers, sourceTitle, stripCitations, toRecord, toVakifChat, type VakifItem } from '../src/lib/vakifApi.ts';
import { adaptArtifactFeed } from '../src/lib/artifactAdapter.ts';

const item: VakifItem = {
  slug: 'bursa-osmangazi-muradiye-camii', name: 'Muradiye Camii', alt_names: [], kind: 'mosque', kind_label: 'Cami',
  city: { slug: 'bursa', name: 'Bursa' }, district: 'Osmangazi', neighborhood: 'Muradiye',
  period: { slug: 'erken-osmanli', name: 'Erken Osmanlı' },
  built: { from: 1425, to: 1426, label: '1425–1426', basis: 'inscription', basis_label: 'Kitâbesine göre' },
  parent: null, children_count: 0, summary: 'II. Murad’ın yaptırdığı cami.', status: 'standing', has_artworks: true,
  image: { src: '/media/books/bursa-1/019-a1.webp', thumb: '/media/thumbs/books/bursa-1/019-a1.webp', alt: 'Caminin cephesi', width: 800, height: 600 },
  source: { book: 'Bursa Vakıf Eserleri I', pages: [75, 81] },
  location: { lat: 40.191063, lon: 29.046501, approximate: true, radius_m: 150 },
};

test('Arka uç eseri sitenin veri akışına uydurma olmadan çevrilir ve doğrulamadan geçer', () => {
  const record = toRecord(item);
  assert.equal(record.year, '1425–1426');
  assert.equal(record.architect, null);
  assert.deepEqual(record.coordinates, [40.191063, 29.046501]);
  assert.deepEqual(record.sourceReferences, [{ title: 'Bursa Vakıf Eserleri I, s. 75–81' }]);
  const feed = adaptArtifactFeed({ schemaVersion: 1, items: [record, toRecord({ ...item, slug: 'konya-x', summary: null, period: null, image: null, location: null, built: { ...item.built, label: null } })] });
  assert.ok(feed.ok, JSON.stringify(!feed.ok && feed.issues));
  const [a, b] = feed.artifacts;
  assert.equal(a.image, '/media/books/bursa-1/019-a1.webp');
  assert.equal(a.coordinatesApproximate, true);
  assert.equal(b.coordinates, null);
  assert.equal(b.coordinatesApproximate, undefined);
  assert.equal(b.year, 'Bilinmiyor');
  assert.equal(b.description, 'Osmangazi, Bursa: cami.');
  assert.equal(b.period, 'Dönemi belirtilmemiş');
});

test('Medya yolu dışına çıkan görsel ve bağlantısız olmayan HTTP kaynak reddedilir', () => {
  const record = toRecord(item);
  for (const bad of [{ image: '/media/../secret.webp' }, { image: '/media/a b.webp' }, { sourceReferences: [{ title: 'K', url: 'http://example.org' }] }]) {
    assert.equal(adaptArtifactFeed({ schemaVersion: 1, items: [{ ...record, ...bad }] }).ok, false, JSON.stringify(bad));
  }
});

test('Kaynak başlığı tek sayfada aralık yazmaz, kitap yoksa envanteri anar', () => {
  assert.equal(sourceTitle({ book: 'Konya Vakıf Eserleri I', pages: [10, 10] }), 'Konya Vakıf Eserleri I, s. 10');
  assert.equal(sourceTitle({ book: null, pages: null }), 'Vakıf Katılım şehir envanteri');
});

test('Sohbet isteği arka ucun biçimine çevrilir: son soru ayrı, önceki mesajlar geçmiş', () => {
  const body = toVakifChat({ artifactId: item.slug, artifactName: item.name, mode: 'short', feed: true, messages: [
    { role: 'user', content: 'Kim yaptırdı?' }, { role: 'assistant', content: 'II. Murad.' }, { role: 'user', content: '  Ne zaman?  ' }] });
  assert.deepEqual(body, { slug: item.slug, question: 'Ne zaman?', mode: 'standard', lang: 'tr',
    history: [{ role: 'user', content: 'Kim yaptırdı?' }, { role: 'assistant', content: 'II. Murad.' }] });
  assert.equal(toVakifChat({ artifactId: 'x', artifactName: 'x', mode: 'child', feed: true, messages: [{ role: 'user', content: 'Soru' }] }).mode, 'child');
});

test('Cevaptaki kaynak işaretleri çıkarılır, kaynaklar kitap ve sayfa olarak listelenir', () => {
  assert.equal(stripCitations('Cami 1426’da tamamlandı [S1, F0]. Mihrabı çinilidir [S2] [T].'), 'Cami 1426’da tamamlandı. Mihrabı çinilidir.');
  assert.deepEqual(fromVakifChat({ answer: 'Metin [S1].', sources: [{ book: 'Bursa I', pages: 's. 75–76' }, { book: 'Bursa I', pages: '75–76' }, { book: 'Bursa I', pages: 's. 20' }] }),
    { answer: 'Metin.', sources: [{ title: 'Bursa I, s. 75–76' }, { title: 'Bursa I, s. 20' }] });
  assert.equal(fromVakifChat({ detail: 'hata' }), null);
});

test('MİMAR / USTA: önce mimarlar, yoksa ustalar; bânî hiçbir zaman mimar diye gösterilmez', () => {
  assert.equal(makers({ architect: 'Hacı İvaz Paşa, Ali Neccâr', builder: 'Usta' }), 'Hacı İvaz Paşa, Ali Neccâr');
  assert.equal(makers({ architect: null, builder: 'Ali Usta' }), 'Ali Usta');
  assert.equal(makers({ architect: ' ', builder: null }), null);
  const record = toRecord({ ...item, architect: null, builder: null, patron: 'II. Bayezid' });
  assert.equal(record.architect, null);
  assert.equal(adaptArtifactFeed({ schemaVersion: 1, items: [record] }).ok && adaptArtifactFeed({ schemaVersion: 1, items: [record] }).artifacts[0].architect, 'Bilinmiyor');
});
