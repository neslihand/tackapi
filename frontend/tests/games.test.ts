import test from 'node:test';
import assert from 'node:assert/strict';
import { artifacts } from '../src/data/artifacts.ts';
import type { DiscoveryArtifact } from '../src/lib/artifactContract.ts';
import { canBeMystery, centuryOf, clueCount, cluesDistinguish, detectiveClues, detectiveOptions, detectiveStars, gameLevels, inPlace, maskNames, minSwaps, pickNext, pickOptions, puzzleStars, regionOf, revealingWords, scramble, seeded, type GameLevel } from '../src/lib/games.ts';
import { achievements, emptyProgress, parseProgress, recordGame } from '../src/lib/progress.ts';

const ids = artifacts.map(a => a.id);
const levels = gameLevels.map(([level]) => level);
const byId = (id: string) => artifacts.find(a => a.id === id)!;
const bare: DiscoveryArtifact = { id: 'kayit-1', slug: 'kayit-1', name: 'Deneme Hanı', city: 'Kayseri', period: 'Test dönemi', category: 'Han', year: 'Bilinmiyor', architect: 'Bilinmiyor', description: 'Test.', coordinates: null, image: '/images/placeholder.svg', sourceReferences: [], chapters: [], detail: null };

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
  assert.equal(minSwaps([1, 0, 2, 3]), 1);
  assert.equal(minSwaps([1, 2, 0, 3]), 2);
  assert.equal(minSwaps([1, 0, 3, 2]), 2);
  const random = seeded(3);
  for (let round = 0; round < 100; round++) {
    const order = scramble(4, random);
    // Put each piece straight into its place: one swap per piece out of place, the optimal strategy.
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
  assert.deepEqual(['1550–1557', '1561 dolayları', '1228–1229', '1419–1424', 'Bilinmiyor', '2000'].map(centuryOf), [16, 16, 13, 15, null, 20]);
  assert.equal(regionOf(byId('divrigi').coordinates), 'Türkiye\'nin doğusunda');
  for (const id of ['suleymaniye', 'selimiye', 'yesil-kulliye', 'rustem-pasa', 'haseki']) assert.equal(regionOf(byId(id).coordinates), 'Türkiye\'nin kuzeybatısında');
  assert.equal(regionOf([39.2, 35.4]), 'Türkiye\'nin iç kesimlerinde');
  assert.equal(regionOf([37, 30]), 'Türkiye\'nin güneybatısında');
  assert.equal(regionOf(null), null);
});

test('Maske adı ve şehri ekiyle birlikte gizler, genel yapı adlarını bırakır', () => {
  const selimiye = byId('selimiye');
  assert.equal(maskNames('Edirne\'ye bir armağan', selimiye), '[gizli] bir armağan');
  assert.equal(maskNames('SELİMİYE’nin kubbesi', selimiye), '[gizli] kubbesi');
  assert.equal(maskNames('Külliye', byId('yesil-kulliye')), 'Külliye');
  assert.equal(maskNames('Bursa · Hacı İvaz Paşa', byId('yesil-kulliye'), false), 'Bursa · Hacı İvaz Paşa');
});

test('Hiçbir ipucu eserin adını, şehir ipucu dışında da şehrini söylemez', () => {
  for (const artifact of artifacts) for (const level of levels) {
    const clues = detectiveClues(artifact, level);
    assert.equal(clues.length, clueCount(level), `${artifact.id} / ${level}`);
    for (const clue of clues) {
      const hidden = revealingWords(artifact, clue.kind !== 'place');
      const words = clue.text.toLocaleLowerCase('tr-TR').split(/[^\p{L}\p{N}]+/u);
      assert.ok(!words.some(word => hidden.has(word)), `${artifact.id} / ${level}: ${clue.text}`);
      // Independent of the mask's own word list: the plain city and the first word of the name never appear.
      const text = clue.text.toLocaleLowerCase('tr-TR');
      assert.ok(!text.includes(artifact.name.split(' ')[0].toLocaleLowerCase('tr-TR')) || clue.kind === 'place' && artifact.name.startsWith(artifact.city), `${artifact.id}: ${clue.text}`);
      if (clue.kind !== 'place') assert.ok(!text.includes(artifact.city.toLocaleLowerCase('tr-TR')), `${artifact.id}: ${clue.text}`);
    }
    if (level !== 'kolay') assert.ok(!clues.some(clue => clue.kind === 'place'));
  }
});

test('Eksik veride ipucu uydurulmaz; iki ipucu çıkmayan eser o seviyede gizem olmaz', () => {
  assert.deepEqual(detectiveClues(bare, 'zor').map(c => c.kind), ['era']);
  assert.equal(canBeMystery(bare, 'zor'), false);
  assert.deepEqual(detectiveClues(bare, 'kolay').map(c => c.text), ['Test dönemi · Han', 'Kayseri']);
  assert.equal(canBeMystery(bare, 'kolay'), true);
});

test('Seçenekler seviyeye göre sayılır, tekrar etmez; zor turlar benzer eserlerle ve çözülebilir kurulur', () => {
  const random = seeded(11);
  for (const mystery of artifacts) for (const level of levels) {
    const options = pickOptions(mystery, artifacts, level, random);
    assert.equal(options.length, Math.min(detectiveOptions[level], artifacts.length));
    assert.equal(new Set(options.map(o => o.id)).size, options.length);
    assert.ok(options.some(o => o.id === mystery.id));
    assert.ok(options.every(o => o.id === mystery.id || cluesDistinguish(mystery, o, level)), `${mystery.id} / ${level}`);
  }
  // Süleymaniye's closest look-alikes come first at Orta: same architect, city and period.
  const orta = pickOptions(byId('suleymaniye'), artifacts, 'orta', seeded(1)).map(o => o.id);
  assert.ok(orta.includes('haseki') && orta.includes('rustem-pasa'));
  assert.equal(cluesDistinguish(byId('suleymaniye'), byId('haseki'), 'zor'), true);
});

test('Sıradaki eser önce çözülmemişlerden seçilir ve bir önceki tekrar gelmez', () => {
  const solved = new Set(['suleymaniye', 'selimiye', 'divrigi', 'yesil-kulliye', 'rustem-pasa']);
  for (let i = 0; i < 20; i++) assert.equal(pickNext(artifacts, a => solved.has(a.id), undefined, seeded(i))!.id, 'haseki');
  for (let i = 0; i < 20; i++) assert.notEqual(pickNext(artifacts, () => false, byId('haseki'), seeded(i))!.id, 'haseki');
});

test('Oyun kayıtları en iyi sonucu tutar; eski ve bozuk kayıtlar güvenle okunur', () => {
  let state = recordGame(emptyProgress(), 'puzzle', 'selimiye', 'orta', 12);
  assert.equal(recordGame(state, 'puzzle', 'selimiye', 'orta', 14), state);
  state = recordGame(state, 'puzzle', 'selimiye', 'orta', 9);
  assert.deepEqual(state.games.puzzle, { selimiye: { orta: 9 } });
  const old = JSON.stringify({ version: 1, discovered: { selimiye: '2026-10-15T08:00:00.000Z' }, favorites: ['selimiye'], quiz: { completed: 1, best: 75 } });
  assert.deepEqual(parseProgress(old, ids).games, { puzzle: {}, detective: {} });
  assert.equal(parseProgress(old, ids).quiz.best, 75);
  const messy = JSON.stringify({ version: 1, games: { puzzle: { selimiye: { orta: 9, zor: 0, kolay: 2.5, efsane: 3 }, fake: { kolay: 5 }, haseki: 'x' }, detective: [1, 2] } });
  assert.deepEqual(parseProgress(messy, ids).games, { puzzle: { selimiye: { orta: 9 } }, detective: {} });
  assert.deepEqual(parseProgress(JSON.stringify(state), ids), state);
});

test('Oyun madalyonları: üç farklı yapboz, üç farklı dosya ve Zor seviyede ikisi birden', () => {
  const unlocked = (state: ReturnType<typeof emptyProgress>) => achievements(state, artifacts).filter(a => a.value >= a.required).map(a => a.id);
  let state = emptyProgress();
  for (const id of ['selimiye', 'selimiye', 'haseki']) state = recordGame(state, 'puzzle', id, 'kolay', 8);
  assert.ok(!unlocked(state).includes('puzzler'));
  state = recordGame(state, 'puzzle', 'divrigi', 'kolay', 8);
  assert.ok(unlocked(state).includes('puzzler'));
  for (const id of ['selimiye', 'haseki', 'divrigi']) state = recordGame(state, 'detective', id, 'kolay', 2);
  assert.ok(unlocked(state).includes('detective'));
  assert.ok(!unlocked(state).includes('sharp'));
  state = recordGame(state, 'puzzle', 'selimiye', 'zor' as GameLevel, 40);
  assert.ok(!unlocked(state).includes('sharp'));
  state = recordGame(state, 'detective', 'haseki', 'zor', 3);
  assert.ok(unlocked(state).includes('sharp'));
  assert.equal(achievements(emptyProgress(), artifacts).length, 9);
});
