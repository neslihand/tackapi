// Esitleme planı M07: aynı pasaport iki platformda aynı ortak madalyon ve görev sonucunu vermeli. İki kopya kural
// birbirinden sessizce ayrılmasın diye burada sitenin gerçek koduyla karşılaştırılır.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item, Season } from '../src/lib/api';
import { canBeMystery, cluesDistinguish, detectiveClues, GAME_LEVELS, inPlace, minSwaps, pickOptions, puzzleStars, scramble, seeded, toGameWork, type GameWork } from '../src/lib/games';
import { emptyProgress, medals, recordGame, type Progress } from '../src/lib/passport';
import { buildQuests } from '../src/lib/quests';
import { ROUND_SIZE, roundScore } from '../src/lib/quizRound';
import * as webGames from '../../frontend/src/lib/games.ts';
import { achievements } from '../../frontend/src/lib/progress.ts';
import { buildQuests as webQuests } from '../../frontend/src/lib/quests.ts';
import { roundScore as webRoundScore } from '../../frontend/src/lib/content.ts';

const PLACEHOLDER = '/images/placeholder.svg';
const item = (slug: string, i: number): Item => ({ slug, name: `${slug.toUpperCase()} Camii`, alt_names: [], kind: 'mosque', kind_label: i % 3 ? 'Cami' : 'Türbe', city: i % 2 ? { slug: 'konya', name: 'Konya' } : { slug: 'bursa', name: 'Bursa' },
  district: null, neighborhood: null, period: i % 4 ? { slug: 'p', name: 'Erken Osmanlı' } : null, built: { from: 1300 + i, to: null, label: i % 5 ? String(1300 + i * 30) : null }, summary: 'Özet.',
  image: i === 2 ? null : { src: `/media/${slug}.webp`, thumb: '', alt: null, width: 1, height: 1 }, source: { book: 'Kitap', pages: null },
  location: i % 6 ? { lat: 37 + i / 2, lon: 28 + i, approximate: false, radius_m: null } : null, architect: i % 3 === 1 ? 'Mimar Sinan' : null, builder: i % 3 === 2 ? 'Usta Ali' : null });
const items = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh', 'ii'].map(item);

// sitenin arka uçtan kurduğu kayıt (frontend/src/lib/vakifApi.ts toRecord + artifactAdapter)
const toWeb = (i: Item) => ({ id: i.slug, slug: i.slug, name: i.name, city: i.city.name, period: i.period?.name ?? 'Dönemi belirtilmemiş', category: i.kind_label, description: i.summary ?? '',
  year: i.built.label ?? 'Bilinmiyor', architect: i.architect?.trim() || i.builder?.trim() || 'Bilinmiyor', coordinates: i.location ? [i.location.lat, i.location.lon] as [number, number] : null,
  image: i.image?.src ?? PLACEHOLDER, chapters: [], detail: null }) as unknown as Parameters<typeof webGames.detectiveClues>[0];
const web = items.map(toWeb);
const mine: GameWork[] = items.map(toGameWork);

test('Dedektif ipuçları ve gizem uygunluğu siteyle aynı', () => {
  for (const [i, work] of mine.entries()) for (const level of GAME_LEVELS) {
    assert.deepEqual(detectiveClues(work, level).map(c => [c.kind, c.label, c.text]), webGames.detectiveClues(web[i], level).map(c => [c.kind, c.label === 'Usta' ? 'Usta' : c.label, c.text]), `${work.id}/${level}`);
    assert.equal(canBeMystery(work, level), webGames.canBeMystery(web[i], level));
    for (const [k, other] of mine.entries()) assert.equal(cluesDistinguish(work, other, level), webGames.cluesDistinguish(web[i], web[k], level));
  }
});

test('Aynı tohumla aynı seçenekler ve aynı karışık tahta', () => {
  for (const [i, work] of mine.entries()) for (const level of GAME_LEVELS) {
    assert.deepEqual(pickOptions(work, mine, level, seeded(i)).map(o => o.id), webGames.pickOptions(web[i], web, level, webGames.seeded(i)).map(o => o.id));
  }
  for (const size of [3, 4, 5]) for (let s = 0; s < 30; s++) {
    const order = scramble(size, seeded(s));
    assert.deepEqual(order, webGames.scramble(size, webGames.seeded(s)));
    assert.equal(minSwaps(order), webGames.minSwaps(order));
    assert.equal(inPlace(order), webGames.inPlace(order));
    assert.equal(puzzleStars(s, minSwaps(order), size), webGames.puzzleStars(s, webGames.minSwaps(order), size));
  }
});

const played = (): Progress => {
  let p: Progress = { ...emptyProgress(), discovered: { aa: '2026-11-01T10:00:00.000Z', bb: '2026-11-01T10:00:00.000Z', cc: '2026-11-01T10:00:00.000Z', ee: '2026-11-01T10:00:00.000Z' }, quiz: { completed: 2, best: 75 }, answered: ['hh'] };
  p = recordGame(p, 'puzzle', 'aa', 'zor', 30);
  p = recordGame(p, 'puzzle', 'bb', 'kolay', 8);
  p = recordGame(p, 'puzzle', 'dd', 'orta', 14);
  p = recordGame(p, 'detective', 'aa', 'zor', 3);
  return p;
};

test('Aynı pasaport aynı ortak madalyonları verir', () => {
  for (const p of [emptyProgress(), played()]) {
    const theirs = achievements(p as never, items.map(i => ({ id: i.slug, city: i.city.name })));
    const ours = new Map(medals(p, items).map(m => [m.id, m]));
    assert.equal(theirs.length, 9);
    for (const a of theirs) {
      const m = ours.get(a.id);
      assert.ok(m, `${a.id} eksik`);
      assert.deepEqual([m.name, m.required, m.value, m.metal], [a.name, a.required, a.value, a.metal], a.id);
    }
  }
});

test('Aynı rota ve pasaport aynı görev adımlarını verir', () => {
  const routes: Season[] = [{ id: 'r1', kicker: 'K', title: 'T', description: 'D', artifactIds: ['cc', 'aa', 'bb', 'ee'] }, { id: 'r2', kicker: 'K', title: 'T', description: 'D', artifactIds: ['hh'] }];
  const canAsk = new Set(['aa', 'ee', 'hh']);
  for (const p of [emptyProgress(), played()]) {
    const theirs = webQuests(routes as never, web as never, p as never, canAsk);
    const ours = buildQuests(routes, items, p, canAsk);
    assert.deepEqual(ours.map(q => q.steps.map(s => [s.kind, s.slug, s.done])), theirs.map(q => q.steps.map(s => [s.kind, s.artifactId, s.done])));
    assert.deepEqual(ours.map(q => [q.done, q.complete]), theirs.map(q => [q.done, q.complete]));
  }
});

test('Yarışma turu ve puanı siteyle aynı: dört soru, doğru başına 25', () => {
  assert.equal(ROUND_SIZE, 4);
  for (const [right, total] of [[0, 4], [1, 4], [3, 4], [4, 4], [1, 3], [2, 3]]) assert.equal(roundScore(right, total), webRoundScore(right, total));
});
