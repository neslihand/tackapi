import test from 'node:test';
import assert from 'node:assert/strict';
import { artifacts } from '../src/data/artifacts.ts';
import { adaptArtifactFeed, hasImmersiveStory } from '../src/lib/artifactAdapter.ts';
import { artifactIssues, imageAlt, PLACEHOLDER_IMAGE } from '../src/lib/content.ts';
import type { ArtifactRecord } from '../src/lib/artifactContract.ts';

const minimal: ArtifactRecord = {
  id: 'record:001', slug: 'deneme-eseri', name: 'Deneme Eseri', city: 'Kayseri',
  period: 'Test dönemi', category: 'Han', description: 'Yalnızca test için hazırlanmış içerik.',
  sourceReferences: [{ title: 'Test kaynağı', url: 'https://example.org/test' }],
};
const feed = (items: unknown[]) => ({ schemaVersion: 1, items });

test('Temel bir kayıt kalıcı ID korunarak, hikâye veya koordinat uydurulmadan okunur', () => {
  const result = adaptArtifactFeed(feed([minimal]));
  assert.ok(result.ok);
  assert.equal(result.artifacts.length, 1);
  const artifact = result.artifacts[0];
  assert.equal(artifact.id, 'record:001');
  assert.notEqual(artifact.id, artifact.slug);
  assert.deepEqual(artifact.chapters, []);
  assert.equal(artifact.detail, null);
  assert.equal(artifact.coordinates, null);
  assert.equal(artifact.image, PLACEHOLDER_IMAGE);
  assert.equal(artifact.architect, 'Bilinmiyor');
  assert.equal(artifact.year, 'Bilinmiyor');
  assert.equal(hasImmersiveStory(artifact), false);
});

test('Görsel betimlemesi yalnızca görselle birlikte taşınır; boş betimleme reddedilir', () => {
  const described = adaptArtifactFeed(feed([{ ...minimal, image: '/images/selimiye.svg', imageAlt: '  Tek kubbe ve dört minare.  ' }]));
  assert.ok(described.ok);
  assert.equal(described.artifacts[0].imageAlt, 'Tek kubbe ve dört minare.');
  assert.equal(imageAlt(described.artifacts[0]), 'Tek kubbe ve dört minare.');
  const withoutImage = adaptArtifactFeed(feed([{ ...minimal, imageAlt: 'Olmayan bir görselin betimlemesi' }]));
  assert.ok(withoutImage.ok);
  assert.equal(withoutImage.artifacts[0].imageAlt, undefined);
  assert.equal(imageAlt(withoutImage.artifacts[0]), 'Görsel hazırlanıyor');
  const undescribed = adaptArtifactFeed(feed([{ ...minimal, image: '/images/selimiye.svg' }]));
  assert.ok(undescribed.ok);
  assert.equal(imageAlt(undescribed.artifacts[0]), 'Deneme Eseri görseli');
  const empty = adaptArtifactFeed(feed([{ ...minimal, image: '/images/selimiye.svg', imageAlt: ' ' }]));
  assert.equal(empty.ok, false);
});

test('Boş koleksiyon geçerlidir; örnek altı esere dönülmez', () => {
  assert.deepEqual(adaptArtifactFeed(feed([])), { ok: true, artifacts: [] });
});

test('Sıfır, bir, üç veya beş bölüm kabul edilir; eksik anlatım biçimleri kopyalanmaz', () => {
  for (const count of [0, 1, 3, 5]) {
    const chapters = Array.from({ length: count }, (_, i) => ({ title: `Bölüm ${i + 1}`, short: 'Kaynaklı kısa metin.' }));
    const result = adaptArtifactFeed(feed([{ ...minimal, chapters }]));
    assert.ok(result.ok);
    assert.deepEqual(result.artifacts[0].chapters, chapters);
    assert.equal(hasImmersiveStory(result.artifacts[0]), false);
  }
});

test('Mevcut zengin koleksiyon korunur; editörün dört bölüm kuralı okuma sınırına taşınmaz', () => {
  const result = adaptArtifactFeed(feed(artifacts));
  assert.ok(result.ok);
  assert.deepEqual(result.artifacts, artifacts);
  assert.ok(result.artifacts.every(hasImmersiveStory));
  const short = { ...artifacts[0], chapters: artifacts[0].chapters.slice(0, 1) };
  assert.ok(artifactIssues(short).some(message => message.includes('dört bölüm')));
  assert.ok(adaptArtifactFeed(feed([short])).ok);
});

test('Yanlış sürüm veya bozuk yanıt açıklamalı hata verir', () => {
  for (const input of [null, undefined, 'invalid json', [], {}, { schemaVersion: 2, items: [] }, { schemaVersion: 1, items: {} }]) {
    const result = adaptArtifactFeed(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issues[0].path, '$');
  }
});

test('Tekrarlanan ID ve slug reddedilir; geçerli kayıtlar arasındaki bozuk kayıt gizlenmez', () => {
  for (const duplicate of [{ ...minimal, slug: 'farkli-eser' }, { ...minimal, id: 'record:002' }]) {
    const result = adaptArtifactFeed(feed([minimal, duplicate]));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.some(issue => issue.path.startsWith('items[1].')));
  }
  assert.equal(adaptArtifactFeed(feed([minimal, null])).ok, false);
});

test('Kaynak, koordinat sırası ve isteğe bağlı alanlar çalışma zamanında doğrulanır', () => {
  for (const patch of [
    { sourceReferences: [] }, { sourceReferences: [{ title: 'Kaynak', url: 'javascript:alert(1)' }] },
    { coordinates: [28.96, 41.01] }, { coordinates: ['41', 29] }, { coordinates: [41, 29, 0] },
    { image: '//example.org/image.png' }, { image: '/images/../secret' },
    { year: 1500 }, { architect: '' }, { description: '' }, { id: '__proto__' }, { id: 'toString' },
    { chapters: [{ title: 'Başlık', short: 'Metin', child: 42 }] },
    { detail: { title: 'Başlık', text: 'Metin', focus: [50, 101] } },
  ]) assert.equal(adaptArtifactFeed(feed([{ ...minimal, ...patch }])).ok, false, JSON.stringify(patch));
  assert.ok(adaptArtifactFeed(feed([{ ...minimal, coordinates: [41.01, 28.96], image: 'https://example.org/photo.jpg' }])).ok);
});

test('Null opsiyonel alanlar kabul edilir ve giriş nesnesi değiştirilmez', () => {
  const item = { ...minimal, year: null, architect: null, coordinates: null, image: null, chapters: null, detail: null };
  const input = feed([item]);
  const before = structuredClone(input);
  const result = adaptArtifactFeed(input);
  assert.ok(result.ok);
  result.artifacts[0].sourceReferences[0].title = 'Yalnızca görünümde değişti';
  assert.deepEqual(input, before);
});
