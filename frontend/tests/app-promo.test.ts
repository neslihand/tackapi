import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, interest, localDay, markShown, parsePromo, PROMO_RULES, snooze, turnOff, visit, type PromoState } from '../src/lib/appPromo.ts';
import { emptyProgress } from '../src/lib/progress.ts';

const fresh = (): PromoState => ({ days: [], shown: [] });
const keen = (): PromoState => visit(visit(fresh(), '2026-11-01'), '2026-11-07');

test('İlk gün, ilgisi az ziyaretçiye ya da tek günlük ziyarete gösterilmez', () => {
  assert.equal(eligible(visit(fresh(), '2026-11-07'), 10, '2026-11-07'), false);   // ikinci gün yok
  assert.equal(eligible(keen(), PROMO_RULES.interest - 1, '2026-11-07'), false);   // ilgi az
  assert.equal(eligible(keen(), PROMO_RULES.interest, '2026-11-07'), true);
});

test('İlgi: mühür, saklanan eser, yarışma ve oynanan eserler birlikte sayılır', () => {
  const progress = { ...emptyProgress(), discovered: { a: '2026-11-01T10:00:00Z' }, favorites: ['b'], quiz: { completed: 9, best: 80 },
    games: { puzzle: { c: { easy: 3 } }, detective: { c: { easy: 2 } } } };
  assert.equal(interest(progress), 1 + 1 + 3 + 1);   // yarışma en çok 3, aynı eserde iki oyun bir
});

test('Günde bir, bir hafta arayla, toplam üç kez', () => {
  let state = markShown(keen(), '2026-11-07');
  assert.equal(eligible(state, 5, '2026-11-07'), false);
  assert.equal(eligible(state, 5, '2026-11-13'), false);
  assert.equal(eligible(state, 5, '2026-11-14'), true);
  state = markShown(markShown(state, '2026-11-14'), '2026-11-21');
  assert.equal(eligible(state, 5, '2026-12-30'), false);
});

test('"Şimdi değil" iki hafta bekletir, "bir daha gösterme" bitirir', () => {
  const later = snooze(markShown(keen(), '2026-11-07'), '2026-11-07');
  assert.equal(later.snoozedUntil, '2026-11-21');
  assert.equal(eligible(later, 5, '2026-11-20'), false);
  assert.equal(eligible(later, 5, '2026-11-21'), true);
  assert.equal(eligible(turnOff(keen()), 99, '2026-11-07'), false);
});

test('Ziyaret günleri tekrarsız tutulur, 30 günden eskisi unutulur; bozuk kayıt boş sayılır', () => {
  const state = visit(visit(visit(fresh(), '2026-09-01'), '2026-11-07'), '2026-11-07');
  assert.deepEqual(visit(state, '2026-11-08').days, ['2026-11-07', '2026-11-08']);
  assert.deepEqual(parsePromo('{"days":["2026-11-01","x",3],"shown":"no","off":"yes"}'), { days: ['2026-11-01'], shown: [] });
  assert.deepEqual(parsePromo('bozuk'), { days: [], shown: [] });
  assert.equal(localDay(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});
