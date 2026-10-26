import test from 'node:test';
import assert from 'node:assert/strict';
import { artifacts, quizQuestions } from '../src/data/artifacts.ts';
import type { DiscoveryArtifact } from '../src/lib/artifactContract.ts';
import { questionIssues } from '../src/lib/content.ts';
import { seeded } from '../src/lib/games.ts';
import { normalize } from '../src/lib/progress.ts';
import { answerableArtifacts, generateQuestions, pickQuizRound, quizPool } from '../src/lib/quiz.ts';

const byId = (id: string) => artifacts.find(a => a.id === id)!;
const bare = (id: string, city: string): DiscoveryArtifact => ({ id, slug: id, name: `Deneme ${id}`, city, period: 'Bilinmiyor', category: 'Han', year: 'Bilinmiyor', architect: 'Bilinmiyor', description: 'Test.', coordinates: null, image: '/images/placeholder.svg', sourceReferences: [], chapters: [], detail: null });

test('Üretilen her soru 3–4 farklı seçenek taşır ve doğru cevap kaydın kendi değeridir', () => {
  const questions = generateQuestions(artifacts, seeded(5));
  assert.ok(questions.length >= 24, `${questions.length} soru`);
  for (const q of questions) {
    const artifact = byId(q.artifactId);
    assert.ok(q.options.length >= 3 && q.options.length <= 4, q.id);
    assert.equal(new Set(q.options.map(normalize)).size, q.options.length, q.id);
    const right = q.options[q.answer];
    const kind = q.id.split(':')[1];
    const expected = { city: artifact.city, architect: artifact.architect, period: artifact.period, detail: artifact.name, century: right }[kind];
    assert.equal(right, expected, q.id);
    assert.ok(q.explanation.length > 0 && q.explanation.length <= 400, q.id);
  }
  // The four-option questions also pass the admin panel's own rules.
  for (const q of questions.filter(q => q.options.length === 4)) assert.deepEqual(questionIssues(q, artifacts.map(a => a.id)), [], q.id);
});

test('Yanlış seçenekler başka eserlerin gerçek değerleridir; yüzyıl hesabı doğrudur', () => {
  const questions = generateQuestions(artifacts, seeded(9));
  const cities = new Set(artifacts.map(a => a.city));
  for (const q of questions.filter(q => q.id.startsWith('veri:city:'))) assert.ok(q.options.every(o => cities.has(o)));
  const divrigi = questions.find(q => q.id === 'veri:century:divrigi')!;
  assert.equal(divrigi.options[divrigi.answer], '13. yüzyıl');
  assert.ok(divrigi.options.every(o => ['13. yüzyıl', '15. yüzyıl', '16. yüzyıl'].includes(o)));
});

test('Ayrıntı sorusu eserin adını vermez; bilinmeyen alandan soru üretilmez', () => {
  for (const q of generateQuestions(artifacts).filter(q => q.id.startsWith('veri:detail:'))) {
    const first = byId(q.artifactId).name.split(' ')[0].toLocaleLowerCase('tr-TR');
    assert.ok(!q.question.toLocaleLowerCase('tr-TR').includes(first), q.question);
  }
  const feed = [bare('a', 'Kayseri'), bare('b', 'Konya'), bare('c', 'Sivas')];
  assert.deepEqual(generateQuestions(feed).map(q => q.id.split(':')[1]), ['city', 'city', 'city']);
  // Two distinct cities are not enough for a three-option question.
  assert.deepEqual(generateQuestions([bare('a', 'Kayseri'), bare('b', 'Konya')]), []);
});

test('Havuz editör sorularını ve üretilen soruları birleştirir; dış koleksiyonda da quiz boş kalmaz', () => {
  const pool = quizPool(quizQuestions, artifacts);
  assert.ok(pool.length > quizQuestions.length);
  assert.ok(quizQuestions.every(q => pool.includes(q)));
  assert.deepEqual(quizPool(quizQuestions, artifacts.slice(0, 1)).filter(q => q.artifactId !== 'suleymaniye'), []);
  assert.ok(quizPool([], artifacts).length > 0);
  assert.deepEqual([...answerableArtifacts(quizQuestions, artifacts)].sort(), artifacts.map(a => a.id).sort());
});

test('Tur mümkün olduğunca farklı eserlerden soru seçer; odak verilirse o eserle açılır', () => {
  const pool = quizPool(quizQuestions, artifacts, seeded(2));
  for (let i = 0; i < 30; i++) {
    const round = pickQuizRound(pool, 4, { random: seeded(i) });
    assert.equal(round.length, 4);
    assert.equal(new Set(round.map(q => q.artifactId)).size, 4);
    const focused = pickQuizRound(pool, 4, { focus: 'yesil-kulliye', random: seeded(i) });
    assert.equal(focused[0].artifactId, 'yesil-kulliye');
    assert.equal(new Set(focused.map(q => q.id)).size, 4);
  }
  assert.equal(pickQuizRound(pool.slice(0, 2), 4).length, 2);
});
