import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { artifacts, quizQuestions } from '../src/data/artifacts.ts';
import { eras, seasons } from '../src/data/collections.ts';
import { artifactIssues, blankArtifact, parseOverrides, pickRound, PLACEHOLDER_IMAGE, questionIssues, roundScore, seasonIssues, serializeOverrides, slugify, type Content } from '../src/lib/content.ts';

const base: Content = { artifacts, quizQuestions, seasons };
const ids = artifacts.map(a => a.id);

test('Temel koleksiyon, quiz ve sezonlar yönetim paneli doğrulamasından geçer', () => {
  for (const a of artifacts) assert.deepEqual(artifactIssues(a, artifacts.filter(x => x.id !== a.id)), [], a.id);
  for (const q of quizQuestions) assert.deepEqual(questionIssues(q, ids), [], q.id);
  for (const s of seasons) assert.deepEqual(seasonIssues(s, ids), [], s.id);
  assert.ok(existsSync(`public${PLACEHOLDER_IMAGE}`));
});

test('Her eser bir döneme bağlanır; ayrıntı odağı görselin içinde kalır', () => {
  for (const a of artifacts) {
    assert.ok(eras.some(e => e.period === a.period), `${a.id} için dönem yok`);
    const [x, y] = a.detail.focus ?? [50, 50];
    assert.ok(x > 10 && x < 90 && y > 10 && y < 90, a.id);
  }
});

test('Bozuk, eski veya eksik içerik kaydı temel koleksiyona döner', () => {
  for (const raw of [null, '{', '42', '{"version":2,"artifacts":[]}', JSON.stringify({ version: 1, artifacts: [{ id: 'x' }] })]) {
    const { content, overrides } = parseOverrides(raw, base);
    assert.equal(content.artifacts, artifacts);
    assert.deepEqual(overrides, {});
  }
  // A list that drops a base artifact is rejected so discovery records keep pointing somewhere.
  const { overrides } = parseOverrides(serializeOverrides({ artifacts: artifacts.slice(1) }), base);
  assert.equal(overrides.artifacts, undefined);
});

test('Geçerli düzenlemeler kayıttan geri okunur', () => {
  const edited = artifacts.map(a => a.id === 'selimiye' ? { ...a, description: 'Düzenlenmiş açıklama.' } : a);
  const extra = { ...blankArtifact('Deneme Hanı'), city: 'Kayseri', period: 'Anadolu Selçuklu', category: 'Han', year: 'Deneme', architect: 'Bilinmiyor', description: 'Deneme.', coordinates: [38.7, 35.5] as [number, number], sourceReferences: [{ title: 'Kaynak', url: 'https://example.org' }], detail: { title: 'Ayrıntı', text: 'Metin.' } };
  extra.chapters = extra.chapters.map(c => ({ ...c, short: 'Kısa.', story: 'Hikâye.', child: 'Çocuk.' }));
  assert.deepEqual(artifactIssues(extra, artifacts), []);
  const raw = serializeOverrides({ artifacts: [...edited, extra], seasons: [{ ...seasons[0], artifactIds: ['deneme-hani', 'selimiye'] }] });
  const { content, overrides } = parseOverrides(raw, base);
  assert.equal(content.artifacts.length, 7);
  assert.equal(content.artifacts.find(a => a.id === 'selimiye')!.description, 'Düzenlenmiş açıklama.');
  assert.deepEqual(content.seasons[0].artifactIds, ['deneme-hani', 'selimiye']);
  assert.equal(overrides.quizQuestions, undefined);
  assert.equal(content.quizQuestions, quizQuestions);
});

test('Geçersiz soru ve sezonlar ayıklanır; üçten az soru kalırsa varsayılan quiz kullanılır', () => {
  const broken = { ...quizQuestions[0], id: 'bozuk', options: ['A', 'A', 'B', 'C'] };
  assert.ok(questionIssues(broken, ids).some(issue => issue.includes('farklı')));
  const few = parseOverrides(serializeOverrides({ quizQuestions: [quizQuestions[0], broken] }), base);
  assert.equal(few.content.quizQuestions, quizQuestions);
  const kept = parseOverrides(serializeOverrides({ quizQuestions: [...quizQuestions.slice(0, 3), broken] }), base);
  assert.equal(kept.content.quizQuestions.length, 3);
  assert.ok(seasonIssues({ ...seasons[0], artifactIds: ['yok'] }, ids).length > 0);
});

test('Eser bilgisi kuralları: Türkçe bağlantı adı, koordinat ve https kaynak', () => {
  assert.equal(slugify('Divriği Ulu Camii ve Darüşşifası'), 'divrigi-ulu-camii-ve-darussifasi');
  assert.equal(slugify('  İç Kale — Çeşme  '), 'ic-kale-cesme');
  const outside = { ...artifacts[0], coordinates: [48.8, 2.3] as [number, number] };
  assert.ok(artifactIssues(outside).some(issue => issue.includes('Koordinat')));
  const insecure = { ...artifacts[0], sourceReferences: [{ title: 'Kaynak', url: 'http://example.org' }] };
  assert.ok(artifactIssues(insecure).some(issue => issue.includes('https')));
  assert.ok(artifactIssues(artifacts[1], artifacts).some(issue => issue.includes('başka bir eser')));
});

test('Quiz turu en fazla beş soru seçer, tekrar etmez ve puanı 100 üzerinden hesaplar', () => {
  const pool = Array.from({ length: 8 }, (_, i) => i);
  let seed = 1;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const round = pickRound(pool, 5, random);
  assert.equal(round.length, 5);
  assert.equal(new Set(round).size, 5);
  assert.deepEqual(pickRound([1, 2, 3]), [1, 2, 3]);
  assert.equal(roundScore(3, 5), 60);
  assert.equal(roundScore(2, 3), 67);
  assert.equal(roundScore(0, 0), 0);
});
