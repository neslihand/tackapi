import test from 'node:test';
import assert from 'node:assert/strict';
import { answerCard, deck, dueCards, nextRecallDay } from '../src/lib/recall';
import { addDays, emptyProgress, mergeProgress, noteHuntWork, parseProgress, recordHunt, type Progress } from '../src/lib/passport';
import type { QuizQuestion } from '../src/lib/api';

const q = (id: string, artifactId: string): QuizQuestion => ({ id, artifactId, question: id, options: ['a', 'b', 'c'], answer: 0, explanation: '' });
const pool = [q('veri:city:x', 'x'), q('veri:century:x', 'x'), q('veri:city:y', 'y')];
const day = (d: string) => new Date(`${d}T12:00:00`);
const found = (slugs: string[], date = '2026-11-01T09:00:00'): Progress => ({ ...emptyProgress(), discovered: Object.fromEntries(slugs.map(s => [s, new Date(date).toISOString()])) });

test('Her eserin tek kartı vardır; tahmini kolay şehir sorusu son çaredir, yazılı soru önce gelir', () => {
  assert.equal(deck(pool).get('x')!.id, 'veri:century:x');
  assert.equal(deck([...pool, q('yazili-1', 'x')]).get('x')!.id, 'yazili-1');
});

test('Keşfedilmemiş eserin kartı gelmez; keşif gününde değil ertesi gün açılır', () => {
  assert.deepEqual(dueCards(pool, emptyProgress(), day('2026-11-05')), []);
  assert.deepEqual(dueCards(pool, found(['x']), day('2026-11-01')), []);
  assert.deepEqual(dueCards(pool, found(['x']), day('2026-11-02')).map(c => c.card.id), ['veri:century:x']);
});

test('Doğru yanıtlar 1, 3, 7, 21 gün döngüsünde ilerler, sonunda kart biter (T10)', () => {
  let p = found(['x']);
  let today = '2026-11-02';
  for (const gap of [3, 7, 21]) {
    p = answerCard(p, 'veri:century:x', 'right', day(today));
    const next = addDays(today, gap);
    assert.equal(p.recall['veri:century:x'].due, next);
    assert.deepEqual(dueCards(pool, p, day(addDays(next, -1))), []);
    assert.equal(dueCards(pool, p, day(next)).length, 1);
    today = next;
  }
  p = answerCard(p, 'veri:century:x', 'right', day(today));
  assert.equal(p.recall['veri:century:x'].due, null);
  assert.deepEqual(dueCards(pool, p, day('2028-01-01')), []);
});

test('Yanlış ya da hatırlayamadım yarından yeniden başlar; ilk deneme ayrı tutulur', () => {
  const wrong = answerCard(found(['x']), 'c', 'wrong', day('2026-11-02'));
  assert.deepEqual([wrong.recall.c.step, wrong.recall.c.due, wrong.recall.c.first], [0, '2026-11-03', false]);
  const fixed = answerCard(wrong, 'c', 'right', day('2026-11-03'));
  assert.equal(fixed.recall.c.first, false);
  const forgot = answerCard(found(['x']), 'c', 'forgot', day('2026-11-02'));
  assert.equal(forgot.recall.c.first, false);
  assert.equal(answerCard(found(['x']), 'c', 'right', day('2026-11-02')).recall.c.first, true);
});

test('Bir kart aynı gün iki kez işlenmez (çevrimdışı tekrar ya da çift dokunma)', () => {
  const once = answerCard(found(['x']), 'veri:century:x', 'right', day('2026-11-02'));
  assert.equal(answerCard(once, 'veri:century:x', 'wrong', day('2026-11-02')), once);
  assert.deepEqual(dueCards(pool, once, day('2026-11-02')), []);
});

test('İki cihazda son yanıt takvimi belirler, ilk deneme ancak ikisinde de doğruysa doğru sayılır', () => {
  const a = answerCard(found(['x']), 'c', 'wrong', day('2026-11-02'));
  const b = answerCard(answerCard(found(['x']), 'c', 'right', day('2026-11-01')), 'c', 'right', day('2026-11-05'));
  const m = mergeProgress(a, b);
  assert.equal(m.recall.c.last, '2026-11-05');
  assert.equal(m.recall.c.first, false);
  assert.equal(mergeProgress(b, a).recall.c.first, false);
});

test('Günlük kart sayısı sınırlıdır, en uzun bekleyen önce gelir', () => {
  const many = Array.from({ length: 8 }, (_, i) => q(`veri:century:w${i}`, `w${i}`));
  const p = { ...found(many.map(c => c.artifactId)), recall: { 'veri:century:w7': { step: 1, due: '2026-10-20', first: true, last: '2026-10-17', at: '2026-10-17T10:00:00.000Z' } } };
  const due = dueCards(many, p, day('2026-11-05'));
  assert.equal(due.length, 5);
  assert.equal(due[0].card.id, 'veri:century:w7');
});

test('Bir sonraki kart günü: keşiften sonraki gün, cevaptan sonra sıradaki aralık, bitince yok', () => {
  assert.equal(nextRecallDay(pool, emptyProgress()), null);
  assert.equal(nextRecallDay(pool, found(['x'])), '2026-11-02');
  const answered = answerCard(found(['x']), 'veri:century:x', 'right', day('2026-11-02'));
  assert.equal(nextRecallDay(pool, answered), '2026-11-05');
  const finished = { ...answered, recall: { 'veri:century:x': { ...answered.recall['veri:century:x'], due: null } } };
  assert.equal(nextRecallDay(pool, finished), null);
});

test('Detay Avı oynanan eserin kartı ertesi gün açılır, mühür yazmadan', () => {
  const cards = [q('veri:century:a', 'a')];
  const day = new Date('2026-11-02T10:00:00+03:00');
  const next = new Date('2026-11-03T10:00:00+03:00');
  const played = noteHuntWork(recordHunt(emptyProgress(), '2026-11-02', 2, true, null, day), '2026-11-02', 'a');
  assert.deepEqual(played.discovered, {});
  assert.equal(dueCards(cards, played, day).length, 0);
  assert.equal(dueCards(cards, played, next).length, 1);
  assert.equal(nextRecallDay(cards, played), '2026-11-03');
  // cevap açılmadıysa eser bilinmez, kart da yok
  assert.equal(dueCards(cards, recordHunt(emptyProgress(), '2026-11-02', 1, false, 0, day), next).length, 0);
  // iki cihaz, saklama
  assert.equal(mergeProgress(recordHunt(emptyProgress(), '2026-11-02', 1, false, 0, day), played).hunt['2026-11-02'].work, 'a');
  assert.equal(parseProgress(JSON.stringify(played)).hunt['2026-11-02'].work, 'a');
  assert.equal(noteHuntWork(emptyProgress(), '2026-11-02', 'a').hunt['2026-11-02'], undefined);
});
