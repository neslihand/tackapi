// The site's game tests (frontend/tests/games.test.ts), on the phone's copy of the rules, plus what only the phone has.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item, Season } from '../src/lib/api';
import { canBeMystery, centuryOf, clueCount, cluesDistinguish, detectiveClues, detectiveOptions, detectiveStars, GAME_LEVELS, inPlace, isGameLevel, maskNames, minSwaps, nextLevel, pickNext, pickOptions, puzzleStars, regionOf, revealingWords, scramble, seeded, toGameWork } from '../src/lib/games';
import { completeActivity, flipCard, readPlaySession, resetPlaySession } from '../src/lib/playSession';
import { discover, emptyProgress, markRead, medals, mergeProgress, parseProgress, recordGame, visit } from '../src/lib/passport';
import { buildQuests } from '../src/lib/quests';

const item = (slug: string, over: Partial<Item> = {}): Item => ({ slug, name: `${slug} Camii`, alt_names: [], kind: 'mosque', kind_label: 'Cami', city: { slug: 'bursa', name: 'Bursa' }, district: null, neighborhood: null,
  period: { slug: 'erken', name: 'Erken Osmanlı' }, built: { from: 1400, to: 1410, label: '1400–1410' }, summary: 'Kitaptan bir özet.', image: { src: `/media/${slug}.webp`, thumb: `/media/thumbs/${slug}.webp`, alt: null, width: 800, height: 600 },
  source: { book: 'Kitap', pages: [1, 2] }, location: { lat: 40.2, lon: 29, approximate: false, radius_m: null }, architect: null, builder: null, ...over });
const works = ['Alaca', 'Bakırcı', 'Cemal', 'Derviş', 'Emir', 'Ferhat', 'Gazi', 'Hacı'].map((n, i) => item(n.toLowerCase(), { name: `${n} Camii`, built: { from: 1300 + i * 40, to: null, label: String(1300 + i * 40) },
  city: i % 2 ? { slug: 'konya', name: 'Konya' } : { slug: 'bursa', name: 'Bursa' }, location: i % 2 ? { lat: 37.8, lon: 32.4, approximate: false, radius_m: null } : { lat: 40.2, lon: 29, approximate: false, radius_m: null },
  architect: i % 3 ? `Usta ${n}` : null })).map(toGameWork);

test('Karıştırma her boyutta geçerli bir permütasyon üretir, çözülmüş başlamaz, en fazla yarısı yerindedir', () => {
  const random = seeded(7);
  for (const size of [3, 4, 5]) for (let round = 0; round < 200; round++) {
    const order = scramble(size, random);
    assert.deepEqual([...order].sort((a, b) => a - b), [...Array(size * size).keys()]);
    assert.ok(inPlace(order) <= Math.floor(size * size / 2) && inPlace(order) < size * size);
  }
});

test('En az hamle, parça sayısı eksi döngü sayısıdır ve gerçek bir çözümle aynıdır', () => {
  assert.equal(minSwaps([0, 1, 2, 3]), 0);
  assert.equal(minSwaps([1, 2, 0, 3]), 2);
  const random = seeded(3);
  for (let round = 0; round < 100; round++) {
    const order = scramble(4, random);
    const board = [...order]; let swaps = 0;
    for (let i = 0; i < board.length; i++) while (board[i] !== i) { const j = board[i]; [board[i], board[j]] = [board[j], board[i]]; swaps++; }
    assert.equal(swaps, minSwaps(order));
  }
});

test('Yıldızlar: en az hamle 3, kenar kadar fazlası 2; dedektifte tek adım 3, üç adım 2', () => {
  assert.deepEqual([puzzleStars(7, 7, 3), puzzleStars(10, 7, 3), puzzleStars(11, 7, 3), puzzleStars(12, 7, 5)], [3, 2, 1, 2]);
  assert.deepEqual([detectiveStars(1), detectiveStars(2), detectiveStars(3), detectiveStars(4)], [3, 2, 2, 1]);
});

test('Yüzyıl ve bölge eser verisinden hesaplanır', () => {
  assert.deepEqual(['1550–1557', '1561 dolayları', 'Bilinmiyor', '2000'].map(centuryOf), [16, 16, null, 20]);
  assert.equal(regionOf([39.2, 35.4]), 'Türkiye\'nin iç kesimlerinde');
  assert.equal(regionOf([37, 30]), 'Türkiye\'nin güneybatısında');
  assert.equal(regionOf(null), null);
});

test('Maske adı ve şehri ekiyle birlikte gizler, genel yapı adlarını bırakır', () => {
  const selimiye = { name: 'Selimiye Camii', city: 'Edirne' };
  assert.equal(maskNames('Edirne\'ye bir armağan', selimiye), '[gizli] bir armağan');
  assert.equal(maskNames('SELİMİYE’nin kubbesi', selimiye), '[gizli] kubbesi');
  assert.equal(maskNames('Külliye', { name: 'Yeşil Külliye', city: 'Bursa' }), 'Külliye');
});

test('Hiçbir ipucu eserin adını, şehir ipucu dışında da şehrini söylemez', () => {
  for (const work of works) for (const level of GAME_LEVELS) for (const clue of detectiveClues(work, level)) {
    const hidden = revealingWords(work, clue.kind !== 'place');
    assert.ok(!clue.text.toLocaleLowerCase('tr-TR').split(/[^\p{L}\p{N}]+/u).some(word => hidden.has(word)), `${work.id}/${level}: ${clue.text}`);
    if (clue.kind !== 'place') assert.ok(!clue.text.includes(work.city), `${work.id}: ${clue.text}`);
  }
  for (const work of works) for (const level of ['orta', 'zor'] as const) assert.ok(!detectiveClues(work, level).some(c => c.kind === 'place'));
});

test('Eksik veride ipucu uydurulmaz; iki ipucu çıkmayan eser o seviyede gizem olmaz', () => {
  const bare = toGameWork(item('bos', { name: 'Deneme Hanı', period: null, built: { from: null, to: null, label: null }, location: null, kind_label: 'Han', city: { slug: 'kayseri', name: 'Kayseri' } }));
  assert.deepEqual(detectiveClues(bare, 'zor').map(c => c.kind), ['era']);
  assert.equal(canBeMystery(bare, 'zor'), false);
  assert.deepEqual(detectiveClues(bare, 'kolay').map(c => c.text), ['Dönemi belirtilmemiş · Han', 'Kayseri']);
  assert.equal(canBeMystery(bare, 'kolay'), true);
});

test('Seçenekler seviyeye göre sayılır, tekrar etmez; her tur çözülebilir kurulur', () => {
  const random = seeded(11);
  for (const mystery of works) for (const level of GAME_LEVELS) {
    const options = pickOptions(mystery, works, level, random);
    assert.ok(options.length <= detectiveOptions[level] && options.length >= 2);
    assert.equal(new Set(options.map(o => o.id)).size, options.length);
    assert.ok(options.some(o => o.id === mystery.id));
    assert.ok(options.every(o => o.id === mystery.id || cluesDistinguish(mystery, o, level)));
  }
});

test('Sıradaki eser önce çözülmemişlerden seçilir ve bir önceki tekrar gelmez', () => {
  const left = works[works.length - 1];
  for (let i = 0; i < 20; i++) assert.equal(pickNext(works, a => a.id !== left.id, undefined, seeded(i))!.id, left.id);
  for (let i = 0; i < 20; i++) assert.notEqual(pickNext(works, () => false, left, seeded(i))!.id, left.id);
});

test('Seviyeler sırayla ilerler; bozuk seviye kabul edilmez', () => {
  assert.equal(nextLevel('kolay'), 'orta');
  assert.equal(nextLevel('zor'), undefined);
  assert.equal(clueCount('zor'), 3);
  assert.equal(isGameLevel('orta'), true);
  assert.equal(isGameLevel('uzman'), false);
});

test('Kötü skor iyi rekoru ezmez; aynı sonuç kayıt yazmaz', () => {
  let p = recordGame(emptyProgress(), 'puzzle', 'x', 'orta', 12);
  assert.equal(recordGame(p, 'puzzle', 'x', 'orta', 14), p);
  assert.equal(recordGame(p, 'puzzle', 'x', 'orta', 12), p);
  p = recordGame(p, 'puzzle', 'x', 'orta', 9);
  assert.deepEqual(p.games.puzzle, { x: { orta: 9 } });
});

test('Oyun rekorları cihazlar arasında en iyisiyle birleşir ve saklanıp okunur', () => {
  const a = recordGame(emptyProgress(), 'detective', 'x', 'zor', 5);
  const b = recordGame(recordGame(emptyProgress(), 'detective', 'x', 'zor', 3), 'puzzle', 'y', 'kolay', 8);
  const merged = mergeProgress(a, b);
  assert.deepEqual(merged.games, { puzzle: { y: { kolay: 8 } }, detective: { x: { zor: 3 } } });
  assert.deepEqual(parseProgress(JSON.stringify(merged)).games, merged.games);
});

test('Oyun kazanmak mühür ve ziyaret yazmaz', () => {
  const p = recordGame(recordGame(emptyProgress(), 'puzzle', 'x', 'kolay', 8), 'detective', 'x', 'kolay', 2);
  assert.deepEqual(p.discovered, {});
  assert.deepEqual(p.visits, {});
  assert.deepEqual(p.read, {});
  assert.deepEqual(p.days, []);
});

test('Ortak madalyonlar eklendi, telefonun madalyonları korundu', () => {
  const list = medals(emptyProgress(), []);
  assert.deepEqual(list.map(m => m.id), ['first', 'architect', 'traveler', 'cities', 'guardian', 'quiz', 'puzzler', 'detective', 'sharp', 'witness', 'pilgrim', 'companion']);
  assert.deepEqual(list.filter(m => m.mobile).map(m => m.id), ['witness', 'pilgrim', 'companion']);
});

test('Oyun madalyonları: üç farklı eser, zorda bir yapboz ve bir dosya', () => {
  const value = (p: ReturnType<typeof emptyProgress>, id: string) => medals(p, []).find(m => m.id === id)!.value;
  let p = recordGame(emptyProgress(), 'puzzle', 'a', 'kolay', 9);
  p = recordGame(p, 'puzzle', 'a', 'orta', 9);          // aynı eser bir sayılır
  assert.equal(value(p, 'puzzler'), 1);
  p = recordGame(recordGame(p, 'puzzle', 'b', 'kolay', 9), 'puzzle', 'c', 'zor', 9);
  assert.equal(value(p, 'puzzler'), 3);
  assert.equal(value(p, 'sharp'), 1);
  p = recordGame(p, 'detective', 'a', 'zor', 2);
  assert.equal(value(p, 'sharp'), 2);
  assert.equal(value(p, 'detective'), 1);
});

const route: Season = { id: 'r', kicker: 'K', title: 'T', description: 'D', artifactIds: ['a', 'b', 'c'] };

test('Görev: her durak okunur, ilk görselli durakta yapboz, son durakta soru', () => {
  const [q] = buildQuests([route], [item('a'), item('b'), item('c')], emptyProgress(), new Set(['a', 'b', 'c']));
  assert.deepEqual(q.steps.map(s => `${s.kind}:${s.slug}`), ['read:a', 'puzzle:a', 'read:b', 'read:c', 'quiz:c']);
});

test('Görselsiz eserde yapboz, sorulamayan eserde soru adımı kurulmaz', () => {
  const noPicture = buildQuests([route], [item('a', { image: null }), item('b', { image: null }), item('c', { image: null })], emptyProgress(), new Set())[0];
  assert.deepEqual(noPicture.steps.map(s => s.kind), ['read', 'read', 'read']);
  const firstHasNone = buildQuests([route], [item('a', { image: null }), item('b'), item('c')], emptyProgress(), new Set(['b']))[0];
  assert.deepEqual(firstHasNone.steps.map(s => `${s.kind}:${s.slug}`), ['read:a', 'read:b', 'puzzle:b', 'quiz:b', 'read:c']);
});

test('Görev ilerlemesi kayıttan okunur, tüm adımlar bitince tamamlanır', () => {
  const list = [item('a'), item('b'), item('c')];
  let p = discover(discover(discover(emptyProgress(), 'a'), 'b'), 'c');
  assert.equal(buildQuests([route], list, p, new Set(['c']))[0].done, 3);
  p = recordGame(p, 'puzzle', 'a', 'kolay', 9);
  p = { ...p, answered: ['c'] };
  const q = buildQuests([route], list, p, new Set(['c']))[0];
  assert.equal(q.complete, true);
  assert.equal(q.visited, 0);       // evde tamamlanır, yürüyüş ayrı sayılır
  assert.equal(buildQuests([route], list, visit(markRead(p, 'a'), 'a', false), new Set(['c']))[0].visited, 1);
});

test('Oturum özeti bir kez sayar, sıfırlanır, pasaporta yazmaz', () => {
  resetPlaySession();
  completeActivity('puzzle'); completeActivity('puzzle'); flipCard('a'); flipCard('a'); flipCard('b');
  assert.deepEqual(readPlaySession(), { puzzle: true, detective: false, quiz: false, flipped: ['a', 'b'] });
  resetPlaySession();
  assert.deepEqual(readPlaySession(), { puzzle: false, detective: false, quiz: false, flipped: [] });
});
