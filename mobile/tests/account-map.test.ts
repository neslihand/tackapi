// Öneriler, katkı kuralları, girişten dönüş ve Keşfet'in arama ve filtreleri.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { afterSignIn, canSend, photoProblem, TEXT_MAX } from '../src/lib/contributionRules';
import type { Item } from '../src/lib/api';
import { byDistance, filterWorks, searchIndex } from '../src/lib/explore';
import { capitalizeReason, openableWorks, pickForYou, pickPopular } from '../src/lib/suggestions';

const has = (slug: string) => ['a', 'b'].includes(slug);

test('Kişisel olmayan liste kişiselmiş gibi gösterilmez', () => {
  const items = [{ slug: 'a', reason: 'şehrine yakın' }];
  assert.deepEqual(pickForYou({ personal: false, items, segments: [] }, has), []);
  assert.deepEqual(pickForYou({ personal: true, items, segments: [] }, has), items);
  assert.deepEqual(pickForYou(null, has), []);
});

test('Koleksiyonda olmayan esere kırık giriş üretilmez', () => {
  assert.deepEqual(pickForYou({ personal: true, items: [{ slug: 'x', reason: null }, { slug: 'b', reason: null }], segments: [] }, has).map(r => r.slug), ['b']);
  assert.deepEqual(pickPopular([{ slug: 'x', visitors: 9 }, { slug: 'a', visitors: 3 }], has).map(p => p.slug), ['a']);
  assert.deepEqual(openableWorks({ id: 1, title: 't', body: 'b', monuments: ['x', 'b'] }, has), ['b']);
  assert.equal(capitalizeReason('işte'), 'İşte');
});

test('Metin katkısı 20-2000 karakter, fotoğrafın metni isteğe bağlı', () => {
  assert.equal(canSend('text', 'kısa', false), false);
  assert.equal(canSend('text', ' '.repeat(30), false), false);
  assert.equal(canSend('text', 'a'.repeat(20), false), true);
  assert.equal(canSend('text', 'a'.repeat(TEXT_MAX + 1), false), false);
  assert.equal(canSend('photo', '', false), false);
  assert.equal(canSend('photo', '', true), true);
  assert.equal(canSend('photo', 'a'.repeat(TEXT_MAX + 1), true), false);
});

test('Fotoğraf boyutu ve türü, bilinmiyorsa sunucuya bırakılır', () => {
  assert.equal(photoProblem({ fileSize: 11 * 1024 * 1024, mimeType: 'image/jpeg' }), 'too_big');
  assert.equal(photoProblem({ fileSize: 1000, mimeType: 'image/heic' }), 'wrong_type');
  assert.equal(photoProblem({ fileSize: 1000, mimeType: 'image/webp' }), null);
  assert.equal(photoProblem({}), null);
});

test('Girişten sonra yalnızca uygulamanın ekranına dönülür', () => {
  assert.equal(afterSignIn('/eser/x'), '/eser/x');
  assert.equal(afterSignIn(null), '/hesap');
  assert.equal(afterSignIn('https://kotu.example'), '/hesap');
  assert.equal(afterSignIn('//kotu.example'), '/hesap');
});

const place = (name: string, city: string, kind: string, loc?: [number, number]) => ({ slug: name, name, kind, kind_label: kind, alt_names: [], district: null,
  city: { slug: city.toLowerCase(), name: city }, location: loc ? { lat: loc[0], lon: loc[1], approximate: false, radius_m: null } : null }) as unknown as Item;
const list = [place('Ulucami', 'Bursa', 'mosque', [40.18, 29.06]), place('Yeşil Türbe', 'Bursa', 'tomb', [40.18, 29.07]), place('Karatay', 'Konya', 'madrasa', [37.87, 32.5]), place('Konumsuz Han', 'Bursa', 'han')];
const index = searchIndex(list);
const none = { query: '', city: null, kind: null };
const names = (r: { name: string }[]) => r.map(x => x.name);

test('Keşfet araması ad ve şehirde, Türkçe harflerle', () => {
  assert.deepEqual(names(filterWorks(list, index, { ...none, query: 'ULUCAMI' })), ['Ulucami']);
  assert.deepEqual(names(filterWorks(list, index, { ...none, query: 'yok böyle' })), []);
  assert.deepEqual(names(filterWorks(list, index, { ...none, query: 'YEŞİL' })), ['Yeşil Türbe']);
  assert.deepEqual(names(filterWorks(list, index, { ...none, query: 'konya' })), ['Karatay']);
});

test('Şehir, tür ve arama birlikte çalışır; mesafe sırası yalnızca konumu olanları alır', () => {
  assert.deepEqual(names(filterWorks(list, index, { query: '', city: 'bursa', kind: 'tomb' })), ['Yeşil Türbe']);
  const bursa = { lat: 40.19, lon: 29.06 };
  assert.deepEqual(byDistance(list, bursa).map(n => n.item.name), ['Ulucami', 'Yeşil Türbe', 'Karatay']);
  assert.equal(byDistance(list, bursa, 1).length, 1);
});
