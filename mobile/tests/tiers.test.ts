import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discover, emptyProgress, markRead, mergeProgress, parseProgress, visit, type Progress } from '../src/lib/passport';
import { tierTracks } from '../src/lib/tiers';

const tiers = { read: [2, 3, 5], onsite: [1, 2, 3], recall: [1, 2, 3], city_read: [30, 60, 100], master_onsite: 50 };
const work = (slug: string, city = 'bursa', located = true) => ({ slug, city: { slug: city, name: city.toUpperCase() }, location: located ? { lat: 1, lon: 1 } : null });
const works = ['a', 'b', 'c', 'd', 'e', 'f'].map(s => work(s));
const reading = (slugs: string[], p: Progress = emptyProgress()) => slugs.reduce((acc, s) => markRead(acc, s), p);
const of = (p: Progress, list = works, t = tiers) => tierTracks(p, list, t);

test('Düğmeyle basılan mühür ve yerinde mühür okuma kademesini doldurmaz', () => {
  let p = discover(emptyProgress(), 'a', new Date(), false);
  p = visit(p, 'b', false);
  assert.equal(of(p).overall[0].value, 0);
  assert.equal(of(p).overall[0].metal, null);
});

test('Evde okumak yerinde kademesini doldurmaz', () => {
  const p = reading(['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(of(p).overall[0].metal, 'gold');
  assert.equal(of(p).overall[1].value, 0);
  assert.equal(of(p).overall[1].metal, null);
});

test('Kademe ve sıradaki adım', () => {
  const t = of(reading(['a', 'b'])).overall[0];
  assert.equal(t.metal, 'bronze');
  assert.deepEqual(t.next, { metal: 'silver', at: 3 });
  assert.equal(of(reading(['a', 'b', 'c', 'd', 'e'])).overall[0].next, null);
});

test('Aynı eseri yeniden okumak ödül getirmez', () => {
  let p = emptyProgress();
  for (let i = 0; i < 10; i++) p = markRead(p, 'a');
  assert.equal(of(p).overall[0].value, 1);
});

test('Koleksiyonun ulaşamayacağı adım gösterilmez', () => {
  const small = ['a', 'b', 'c'].map(s => work(s));
  const t = of(reading(['a', 'b', 'c']), small).overall[0];
  assert.equal(t.metal, 'silver');
  assert.equal(t.next, null);
});

test('Konumu olmayan eser yerinde kademesinin payına girmez', () => {
  const list = [work('a'), work('b', 'bursa', false)];
  assert.equal(of(emptyProgress(), list).overall[1].max, 1);
});

test('Hatırla kademesi yalnızca doğru yanıtı sayar', () => {
  const card = (step: number, first: boolean) => ({ step, due: null, first, last: '2026-11-01', at: '2026-11-01T10:00:00Z' });
  const p: Progress = { ...emptyProgress(), recall: { wrong: card(0, false), right: card(1, true), later: card(2, false), forgot: card(0, true) } };
  // yalnızca hiç doğru yanıtlanmamış kart sayılmaz; sonradan unutmak kazanılanı geri almaz
  assert.equal(of(p).overall[2].value, 3);
});

test('Şehir yüzdeleri şehrin büyüklüğüne göre, Ustalık yerinde mühür ister', () => {
  const list = [...['a', 'b', 'c', 'd'].map(s => work(s, 'bursa')), work('k', 'konya')];
  let p = reading(['a', 'b', 'c', 'd', 'k']);
  const [bursa, konya] = of(p, list).cities;
  assert.equal(bursa.metal, 'gold');
  assert.equal(konya.metal, 'gold');
  assert.equal(bursa.master, false);
  assert.equal(bursa.onSiteGoal, 2);
  p = visit(visit(p, 'a', false), 'b', false);
  assert.equal(of(p, list).cities[0].master, true);
  assert.equal(of(p, list).cities[1].master, false);
});

test('Yerinde mühür olmadan altına ulaşılsa da Usta olunmaz; konumu olmayan şehirde Usta yok', () => {
  const list = [work('a', 'hatay', false)];
  const city = of(reading(['a']), list).cities[0];
  assert.equal(city.metal, 'gold');
  assert.equal(city.master, false);
});

test('Okuma kaydı cihazlar arasında birleşir, ilk tarih kalır, saklanıp geri okunur', () => {
  const a = markRead(emptyProgress(), 'x', new Date('2026-11-02T10:00:00Z'));
  const b = markRead(emptyProgress(), 'x', new Date('2026-11-01T10:00:00Z'));
  assert.equal(mergeProgress(a, b).read.x, '2026-11-01T10:00:00.000Z');
  assert.equal(parseProgress(JSON.stringify(a)).read.x, '2026-11-02T10:00:00.000Z');
  assert.deepEqual(parseProgress(JSON.stringify({ ...a, read: { y: 3 } })).read, {});
});
