// "Sana göre": aynı koleksiyon iki farklı kişiye farklı görünür, her öneri gerekçesini söyler, kapatılınca herkes aynıyı görür.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item } from '../src/lib/api';
import { dailyPicks } from '../src/lib/daily';
import { emptyProgress, setLabel, toggleFavorite, type Progress } from '../src/lib/passport';
import { catalogOrder, citySlugOf, discoveryProfile, homeOrder, intentFromProfile, leadFor, leadWork, noPreferences, preferenceTiers, routesFirst, suggestFor, type Preferences } from '../src/lib/personal';

const work = (slug: string, city: string, kind: string, extra: Partial<Item> = {}): Item => ({ slug, name: slug, alt_names: [], kind, kind_label: kind, city: { slug: city.toLowerCase(), name: city }, district: null, neighborhood: null,
  period: { slug: 'osmanli', name: 'Osmanlı' }, built: { from: null, to: null, label: null }, summary: 'Özet.', image: null, source: { book: null, pages: null }, ...extra });
const items = [work('a-cami', 'Bursa', 'mosque'), work('b-turbe', 'Bursa', 'tomb', { has_child: true }), work('c-medrese', 'Konya', 'madrasa', { has_story: true }), work('d-turbe', 'Konya', 'tomb'), work('e-cesme', 'Hatay', 'fountain', { has_artworks: true, period: null })];
const names = (list: { item: Item }[]) => list.map(r => r.item.slug);
const empty = emptyProgress();
const withPrefs = (p: Partial<Preferences>): Preferences => ({ ...noPreferences, ...p });
const read = (p: Progress, slug: string): Progress => ({ ...p, read: { ...p.read, [slug]: '2026-11-01T10:00:00Z' }, discovered: { ...p.discovered, [slug]: '2026-11-01T10:00:00Z' } });

test('Hiçbir şey bilinmeyen kişiye gerekçesiz öneri yapılmaz', () => {
  assert.deepEqual(suggestFor(items, empty, noPreferences), []);
  assert.equal(catalogOrder(items, empty, noPreferences), items);
});

test('İki farklı kişi farklı öneri görür, gerekçesiyle', () => {
  const konya = suggestFor(items, empty, withPrefs({ homeCity: 'konya' }));
  assert.deepEqual(names(konya), ['c-medrese', 'd-turbe']);
  assert.match(konya[0].reason, /Şehrin: Konya/);
  const family = suggestFor(items, empty, withPrefs({ intent: 'family' }));
  assert.deepEqual(names(family), ['b-turbe']);
  assert.match(family[0].reason, /Çocuklar için/);
  const architecture = suggestFor(items, empty, withPrefs({ interests: ['architecture'] }));
  assert.deepEqual(names(architecture).sort(), ['a-cami', 'c-medrese']);
  assert.match(architecture[0].reason, /İlgi alanın: Mimari/);
  assert.deepEqual(names(suggestFor(items, empty, withPrefs({ interests: ['decoration'] }))), ['e-cesme']);
  assert.deepEqual(names(suggestFor(items, empty, withPrefs({ interests: ['stories'] }))), ['c-medrese']);
  assert.deepEqual(suggestFor(items, empty, withPrefs({ interests: ['photography'] })), []);       // fotoğraf esere göre ayrım yapmaz
});

test('Okuduğu ve kaydettiği eserler sonraki öneriyi değiştirir, kendileri önerilmez', () => {
  const p = read(empty, 'b-turbe');
  const list = suggestFor(items, p, noPreferences);
  assert.equal(names(list).includes('b-turbe'), false);
  assert.ok(names(list).indexOf('d-turbe') < names(list).indexOf('c-medrese') || names(list).includes('a-cami'));
  assert.match(list.map(r => r.reason).join(' '), /İlgilendiğin (şehir: Bursa|dönem: Osmanlı|tür: tomb)/);
  assert.equal(names(suggestFor(items, toggleFavorite(empty, 'a-cami'), noPreferences)).includes('a-cami'), false);
  assert.equal(names(suggestFor(items, setLabel(empty, 'c-medrese', 'interested', true), noPreferences)).includes('c-medrese'), false);
  assert.ok(names(suggestFor(items, setLabel(empty, 'c-medrese', 'interested', true), noPreferences)).includes('d-turbe'));
});

test('Gitmek istediği esere yakın olan söylenir, konumu olmayan için mesafe uydurulmaz', () => {
  const placed = [work('x', 'Bursa', 'mosque', { location: { lat: 40.18, lon: 29.06, approximate: false, radius_m: null } }), work('y', 'Bursa', 'tomb', { location: { lat: 40.181, lon: 29.061, approximate: false, radius_m: null } }), work('z', 'Bursa', 'bath')];
  const list = suggestFor(placed, setLabel(empty, 'x', 'want_to_go', true), noPreferences);
  assert.match(list.find(r => r.item.slug === 'y')!.reason, /Gitmek istediğin x eserine yakın/);
  assert.doesNotMatch(list.find(r => r.item.slug === 'z')?.reason ?? '', /yakın/);
});

test('Kapatılınca herkes aynıyı görür', () => {
  const off = withPrefs({ on: false, homeCity: 'konya', interests: ['architecture'], intent: 'family' });
  assert.deepEqual(suggestFor(items, read(empty, 'a-cami'), off), []);
  assert.equal(catalogOrder(items, empty, off), items);
  assert.equal(leadFor(off, items[0], 'Konya'), null);
  assert.deepEqual(homeOrder(off), homeOrder(withPrefs({ on: false })));
  assert.equal(homeOrder(off).includes('lead'), false);
  assert.equal(homeOrder(off).includes('forYou'), false);
  assert.deepEqual(routesFirst(['a', 'b'], r => r === 'b', off), ['a', 'b']);
});

test('Katalog önce uyanları gösterir, gerisi sırasını korur', () => {
  assert.deepEqual(catalogOrder(items, empty, withPrefs({ homeCity: 'konya' })).map(i => i.slug), ['c-medrese', 'd-turbe', 'a-cami', 'b-turbe', 'e-cesme']);
  assert.equal(catalogOrder(items, empty, withPrefs({ homeCity: 'konya' })).length, items.length);
});

test('Ana ekranın ilk kartları niyete göre değişir', () => {
  const orders = (['listen', 'nearby', 'play', 'family', 'deep', null] as const).map(intent => homeOrder(withPrefs({ intent })).join());
  assert.ok(new Set(orders).size >= 4);
  assert.equal(homeOrder(withPrefs({ intent: 'nearby' }))[2], 'routes');
  assert.equal(homeOrder(withPrefs({ intent: 'deep' }))[2], 'reading');
  assert.equal(homeOrder(withPrefs({ intent: 'listen' }))[2], 'forYou');
  for (const o of orders) assert.equal(new Set(o.split(',')).size, o.split(',').length);          // hiçbir blok iki kez çıkmaz
});

test('Her niyetin ilk kartı gerçek bir yere götürür', () => {
  assert.equal(leadFor(noPreferences, undefined, null), null);
  const pick = { item: items[0] };
  assert.equal(leadFor(withPrefs({ intent: 'listen' }), pick, null)!.href, '/eser/a-cami?dinle=1');
  assert.equal(leadFor(withPrefs({ intent: 'family' }), pick, null)!.href, '/eser/a-cami?anlatim=child');
  assert.equal(leadFor(withPrefs({ intent: 'deep' }), pick, null)!.href, '/eser/a-cami?anlatim=text');
  assert.equal(leadFor(withPrefs({ intent: 'play' }), undefined, null)!.href, '/oyna');
  assert.match(leadFor(withPrefs({ intent: 'nearby' }), undefined, 'Konya')!.title, /Konya/);
  assert.equal(leadFor(withPrefs({ intent: 'listen' }), undefined, null), null);                  // eser yoksa boş vaat yok
  assert.equal(leadFor(withPrefs({ on: false, intent: 'play' }), undefined, null), null);
  // niyet seçmeyen ama tanınan kişi: gerekçesiyle; hiçbir şey bilinmiyorsa kart yok
  const known = leadFor(noPreferences, { item: items[0], reason: 'Şehrin: Bursa' }, null)!;
  assert.equal(known.body, 'Şehrin: Bursa');
  assert.equal(leadFor(noPreferences, { item: items[0] }, null), null);
});

test('İlk kart vaat ettiğini verebilen eseri seçer', () => {
  const family = withPrefs({ intent: 'family' });
  assert.equal(leadWork(items, empty, family)!.item.slug, 'b-turbe');                             // yalnızca onun çocuk anlatımı var
  assert.equal(leadWork(items, read(empty, 'b-turbe'), family), undefined);                       // okuduysa başka yok, boş vaat de yok
  assert.equal(leadWork(items, empty, withPrefs({ intent: 'family', homeCity: 'konya' }))!.item.slug, 'b-turbe');  // şehirden önce vaat
  assert.equal(leadWork(items, empty, noPreferences, items[0]), undefined);                       // tanınmayan kişiye yok
  assert.equal(leadWork(items, empty, withPrefs({ intent: 'listen' }), items[0])!.item.slug, 'c-medrese');
  assert.equal(leadWork(items, empty, withPrefs({ on: false, intent: 'listen' }), items[0]), undefined);
  // aynı eser iki kez gösterilmez: Keşfet ilk kartın ve Günün Eşiği'nin eserini listeden çıkarır
  assert.deepEqual(names(suggestFor(items, empty, withPrefs({ homeCity: 'konya' }), 4, ['c-medrese', undefined])), ['d-turbe']);
});

test('Keşif biçimi sitenin profil adlarıyla, nedeniyle; bilinmiyorsa yok', () => {
  assert.equal(discoveryProfile(noPreferences, null, empty), null);
  assert.equal(discoveryProfile(withPrefs({ intent: 'nearby' }), null, empty)!.name, 'Rota gezgini');
  assert.equal(discoveryProfile(noPreferences, 'story', empty)!.name, 'Hikâye sever');
  assert.equal(discoveryProfile(noPreferences, 'child', empty)!.name, 'Ailece keşif');
  assert.equal(discoveryProfile(noPreferences, 'text', empty)!.name, 'Araştırmacı');
  const player = { ...empty, quiz: { completed: 4, best: 80 } };
  assert.equal(discoveryProfile(withPrefs({ intent: 'nearby' }), null, player)!.name, 'Oyun sever');   // yaptığı, seçtiğini geçer
  assert.match(discoveryProfile(withPrefs({ intent: 'nearby' }), null, player)!.because, /Oyun/);
});

test('Hesaptaki şehir ve amaç', () => {
  assert.equal(citySlugOf(' KONYA ', items), 'konya');
  assert.equal(citySlugOf('Ankara', items), null);
  assert.equal(citySlugOf(null, items), null);
  assert.equal(intentFromProfile(['trip']), 'nearby');
  assert.equal(intentFromProfile(['research']), 'deep');
  assert.equal(intentFromProfile(['curiosity'], ['kids']), 'family');
  assert.equal(intentFromProfile(['curiosity'], ['stories']), 'listen');
  assert.equal(intentFromProfile([], []), null);
});

test('Günün Eşiği önce kişinin şehrinden gelir, yeterince eser yoksa bütün koleksiyondan', () => {
  const day = new Date('2026-11-02T10:00:00');
  const many = [...items, work('f', 'Konya', 'bath'), work('g', 'Bursa', 'bath')];
  const inKonya = preferenceTiers(withPrefs({ homeCity: 'konya' }));
  assert.ok(dailyPicks(many, empty, day, 7, inKonya).every(i => i.city.slug === 'konya'));
  assert.ok(new Set(dailyPicks(many, empty, day, 7).map(i => i.city.slug)).size > 1);
  // şehir ve ilgi birlikte; başka şehrin camisi şehrin önüne geçmez
  const both = preferenceTiers(withPrefs({ homeCity: 'konya', interests: ['architecture'] }));
  assert.ok(dailyPicks(many, empty, day, 7, both).every(i => i.city.slug === 'konya'));
  // yalnızca ilgi seçen kişi
  const curious = preferenceTiers(withPrefs({ interests: ['architecture'] }));
  assert.ok(dailyPicks(many, empty, day, 7, curious).every(i => ['mosque', 'madrasa', 'bath'].includes(i.kind)));
  // tek eserli şehir her gün tekrar etmez, kapalıysa etki yok
  assert.ok(new Set(dailyPicks(many, empty, day, 6, preferenceTiers(withPrefs({ homeCity: 'hatay' }))).map(i => i.slug)).size > 1);
  assert.deepEqual(preferenceTiers(withPrefs({ on: false, homeCity: 'konya' })), []);
  // hepsini okuduysa koleksiyon döner
  const allRead = many.filter(i => i.city.slug === 'konya').reduce((p, i) => read(p, i.slug), empty);
  assert.equal(dailyPicks(many, allRead, day, 1, inKonya).length, 1);
});

test('Rotalarda kişinin şehri öne gelir, sıra başka türlü bozulmaz', () => {
  assert.deepEqual(routesFirst(['a', 'b', 'c'], (r, city) => city === 'konya' && r === 'c', withPrefs({ homeCity: 'konya' })), ['c', 'a', 'b']);
  assert.deepEqual(routesFirst(['a', 'b'], () => true, noPreferences), ['a', 'b']);
});
