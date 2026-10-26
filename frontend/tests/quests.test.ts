import test from 'node:test';
import assert from 'node:assert/strict';
import { artifacts, quizQuestions } from '../src/data/artifacts.ts';
import { seasons } from '../src/data/collections.ts';
import { discover, emptyProgress, parseProgress, recordGame } from '../src/lib/progress.ts';
import { buildQuests, questRoutes } from '../src/lib/quests.ts';
import { answerableArtifacts } from '../src/lib/quiz.ts';

const answerable = answerableArtifacts(quizQuestions, artifacts);
const quests = (progress = emptyProgress()) => buildQuests(questRoutes(seasons, artifacts), artifacts, progress, answerable);

test('Her keşif sezonu bir görev olur: her durak okunur, bir yapboz çözülür, bir soru yanıtlanır', () => {
  const list = quests();
  assert.deepEqual(list.map(q => q.id), seasons.map(s => s.id));
  const sinan = list.find(q => q.id === 'sinanin-izleri')!;
  assert.deepEqual(sinan.steps.map(s => `${s.kind}:${s.artifactId}`), ['read:haseki', 'puzzle:haseki', 'read:suleymaniye', 'read:rustem-pasa', 'read:selimiye', 'quiz:selimiye']);
  const anadolu = list.find(q => q.id === 'anadolunun-tas-isciligi')!;
  assert.deepEqual(anadolu.steps.map(s => `${s.kind}:${s.artifactId}`), ['read:divrigi', 'puzzle:divrigi', 'read:yesil-kulliye', 'quiz:yesil-kulliye']);
  assert.deepEqual(anadolu.steps.map(s => s.to), ['/eser/divrigi', '/oyun/oyunlar?oyun=yapboz&eser=divrigi', '/eser/yesil-kulliye', '/oyun/quiz?eser=yesil-kulliye']);
  assert.ok(list.every(q => q.done === 0 && !q.complete));
});

test('Görev ilerlemesi kayıttan okunur ve tüm adımlar bitince tamamlanır', () => {
  let progress = discover(discover(emptyProgress(), 'divrigi'), 'yesil-kulliye');
  let anadolu = quests(progress).find(q => q.id === 'anadolunun-tas-isciligi')!;
  assert.equal(anadolu.done, 2);
  progress = recordGame(progress, 'puzzle', 'divrigi', 'kolay', 9);
  progress = { ...progress, answered: ['yesil-kulliye'] };
  anadolu = quests(progress).find(q => q.id === 'anadolunun-tas-isciligi')!;
  assert.equal(anadolu.done, 4);
  assert.equal(anadolu.complete, true);
  // A puzzle solved at any level counts; the record survives a save and a reload.
  assert.equal(quests(parseProgress(JSON.stringify(progress), artifacts.map(a => a.id))).find(q => q.id === 'anadolunun-tas-isciligi')!.complete, true);
});

test('Doğru yanıtlanan eserler kaydedilir; eski kayıt boş listeyle açılır, bilinmeyen kimlik atılır', () => {
  const ids = artifacts.map(a => a.id);
  assert.deepEqual(parseProgress(JSON.stringify({ version: 1 }), ids).answered, []);
  assert.deepEqual(parseProgress(JSON.stringify({ version: 1, answered: ['selimiye', 'selimiye', 'fake', 3] }), ids).answered, ['selimiye']);
});

test('Sezonu olmayan koleksiyonda görevler veriden kurulur: usta ve şehir rotaları', () => {
  const routes = questRoutes([], artifacts);
  assert.deepEqual(routes.map(r => r.title), ['Usta rotası: Mimar Sinan', 'Şehir rotası: İstanbul']);
  // Date order: Haseki (1538) before Süleymaniye (1550), Rüstem Paşa (1561) and Selimiye (1568).
  assert.deepEqual(routes[0].artifactIds, ['haseki', 'suleymaniye', 'rustem-pasa', 'selimiye']);
  assert.deepEqual(questRoutes([], artifacts.slice(2, 4)), []);
});

test('Soru sorulamayan eserde quiz adımı, görseli olmayan eserde yapboz adımı kurulmaz', () => {
  const plain = artifacts.map(a => ({ ...a, image: '/images/placeholder.svg' }));
  const list = buildQuests(questRoutes(seasons, plain), plain, emptyProgress(), new Set());
  assert.ok(list.every(q => q.steps.every(s => s.kind === 'read')));
});
