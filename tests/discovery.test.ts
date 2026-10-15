import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { achievements, discover, distanceKm, emptyProgress, normalize, parseProgress } from '../src/lib/progress.ts';
import { demoRecognition } from '../src/lib/recognition.ts';
import { artifacts, quizQuestions } from '../src/data/artifacts.ts';

const ids = artifacts.map(a => a.id);

test('Bozuk ya da eski kayıt uygulamayı durdurmaz', () => {
  for (const bad of [null, 'undefined', 'null', '{', '{}', '{"version":2}', '42']) assert.deepEqual(parseProgress(bad, ids), emptyProgress());
});

test('Kayıt sadece bilinen eserleri, geçerli tarihleri ve güvenli puanları alır', () => {
  const parsed = parseProgress(JSON.stringify({ version: 1, discovered: { suleymaniye: '2026-10-15T08:00:00.000Z', selimiye: 'bozuk tarih', fake: '2026-01-01' }, favorites: ['suleymaniye', 'suleymaniye', 'fake', 42], quiz: { completed: -3, best: 150 } }), ids);
  assert.deepEqual(Object.keys(parsed.discovered), ['suleymaniye']);
  assert.deepEqual(parsed.favorites, ['suleymaniye']);
  assert.deepEqual(parsed.quiz, { completed: 0, best: 100 });
});

test('Aynı eser tekrar mühürlenmez ve ilk keşif tarihi korunur', () => {
  const first = discover(emptyProgress(), ids[0], '2026-10-15T08:00:00.000Z');
  const repeated = discover(first, ids[0], '2026-10-16T08:00:00.000Z');
  assert.equal(first, repeated);
  assert.equal(repeated.discovered[ids[0]], '2026-10-15T08:00:00.000Z');
});

test('Keşif ve şehir madalyonları gerçek eşiklerinde açılır', () => {
  let state = emptyProgress();
  assert.equal(achievements(state, artifacts).filter(a => a.value >= a.required).length, 0);
  state = discover(state, 'suleymaniye');
  let list = achievements(state, artifacts);
  assert.equal(list.find(a => a.id === 'first')!.value, 1);
  assert.equal(list.filter(a => a.value >= a.required).length, 1);
  state = discover(discover(state, 'rustem-pasa'), 'haseki');
  list = achievements(state, artifacts);
  assert.equal(list.find(a => a.id === 'architect')!.value, 3);
  assert.equal(list.find(a => a.id === 'cities')!.value, 1);
  state = discover(discover(state, 'selimiye'), 'divrigi');
  list = achievements(state, artifacts);
  assert.equal(list.find(a => a.id === 'cities')!.value, 3);
  assert.equal(list.find(a => a.id === 'traveler')!.value, 5);
  assert.equal(list.find(a => a.id === 'guardian')!.value < 6, true);
});

test('Altı eser ve bir quiz turuyla tüm ilk koleksiyon madalyonları açılabilir', () => {
  const state = ids.reduce((s, id) => discover(s, id), emptyProgress());
  state.quiz = { completed: 1, best: 60 };
  assert.equal(achievements(state, artifacts).filter(a => a.value >= a.required).length, 6);
  assert.deepEqual(parseProgress(JSON.stringify(state), ids), state);
});

test('Türkçe arama büyük harfleri ve aksansız yazımı karşılar', () => {
  assert.equal(normalize('İSTANBUL'), normalize('istanbul'));
  assert.equal(normalize('SÜLEYMANİYE'), normalize('suleymaniye'));
  assert.equal(normalize('Divriği Ulu Camii').includes(normalize('divrigi')), true);
});

test('Mesafe hesabı kilometre birimindedir; aynı noktada sıfır döndürür', () => {
  assert.equal(distanceKm([41, 29], [41, 29]), 0);
  assert.ok(Math.abs(distanceKm([0, 0], [0, 1]) - 111.195) < 0.01);
  const istanbul = artifacts[0].coordinates;
  const edirne = artifacts[1].coordinates;
  assert.ok(distanceKm(istanbul, edirne) > 200 && distanceKm(istanbul, edirne) < 230);
  assert.equal(distanceKm(istanbul, edirne), distanceKm(edirne, istanbul));
});

test('Koleksiyon ve quiz verileri eksiksiz; görsel dosyaları yerel', () => {
  assert.equal(artifacts.length, 6);
  assert.equal(new Set(ids).size, artifacts.length);
  assert.equal(new Set(artifacts.map(a => a.slug)).size, artifacts.length);
  assert.equal(new Set(artifacts.map(a => a.city)).size, 4);
  for (const a of artifacts) {
    assert.ok(existsSync(`public${a.image}`), a.image);
    assert.equal(a.chapters.length, 4);
    assert.ok(a.sourceReferences.length > 0);
    assert.ok(a.coordinates[0] >= 35 && a.coordinates[0] <= 43);
    assert.ok(a.coordinates[1] >= 25 && a.coordinates[1] <= 45);
    for (const source of a.sourceReferences) assert.equal(new URL(source.url).protocol, 'https:');
    for (const chapter of a.chapters) {
      assert.equal(new Set([chapter.short, chapter.story, chapter.child]).size, 3);
      for (const text of [chapter.short, chapter.story, chapter.child]) assert.ok(text.length > 30);
    }
  }
  assert.equal(quizQuestions.length, 5);
  for (const q of quizQuestions) {
    assert.ok(ids.includes(q.artifactId));
    assert.equal(q.options.length, 4);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
    assert.ok(q.explanation.length > 20);
  }
});

test('Kamera demosu rastgele sonuç üretmez, kullanıcının seçimini döndürür', async () => {
  const blob = new Blob(['demo'], { type: 'image/png' });
  await assert.rejects(() => demoRecognition.recognize(blob), /seçmelisin/);
  assert.deepEqual(await demoRecognition.recognize(blob, 'divrigi'), { artifactId: 'divrigi', mode: 'demo' });
});
