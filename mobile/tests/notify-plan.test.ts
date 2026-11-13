import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedHour, dailySlowed, inQuietHours, planInput, planNotifications, unopenedDaily } from '../src/lib/notifyPlan';
import { dayKey } from '../src/lib/passport';

// 2026-11-04 is a Wednesday
const morning = new Date(2026, 10, 4, 7, 30);
const noon = new Date(2026, 10, 4, 12);
const allOn = { daily: { hour: 9, slowed: false }, streak: { keptToday: false }, recallDue: '2026-11-04' };

test('Sessiz saat 22.00-09.00', () => {
  assert.equal(inQuietHours(8), true);
  assert.equal(inQuietHours(9), false);
  assert.equal(inQuietHours(21), false);
  assert.equal(inQuietHours(22), true);
  assert.equal(inQuietHours(0), true);
});

test('Eskiden seçilmiş 08.00 saati 09.00 olur', () => {
  assert.equal(allowedHour(8), 9);
  assert.equal(allowedHour(18), 18);
  const [first] = planNotifications({ daily: { hour: 8, slowed: false }, streak: null, recallDue: null }, morning);
  assert.equal(first.at.getHours(), 9);
});

test('Her şey açıkken de takvim gününde en fazla bir bildirim', () => {
  const plan = planNotifications(allOn, morning);
  assert.equal(new Set(plan.map(p => dayKey(p.at))).size, plan.length);
  assert.ok(plan.every(p => !inQuietHours(p.at.getHours())));
});

test('Hiçbiri sessiz saate düşmez', () => {
  for (const hour of [0, 6, 8, 9, 12, 21, 22, 23]) {
    for (const p of planNotifications({ daily: { hour, slowed: false }, streak: null, recallDue: null }, morning)) assert.equal(inQuietHours(p.at.getHours()), false, String(hour));
  }
});

test('Aynı günde öncelik: Hatırla, ritim, Günün Kapısı', () => {
  assert.equal(planNotifications(allOn, morning)[0].kind, 'recall');
  assert.equal(planNotifications({ ...allOn, recallDue: null }, morning)[0].kind, 'streak');
  assert.equal(planNotifications({ ...allOn, recallDue: null, streak: null }, morning)[0].kind, 'daily');
});

test('Bugünün bildirimi gittiyse akşam ikincisi kurulmaz', () => {
  const plan = planNotifications({ daily: { hour: 9, slowed: false }, streak: { keptToday: false }, recallDue: null }, noon);
  assert.equal(plan.some(p => p.day === '2026-11-04'), false);
  assert.equal(plan[0].day, '2026-11-05');
});

test('Hatırla bir kez kurulur, sonraki günler Günün Kapısı sürer', () => {
  const plan = planNotifications({ daily: { hour: 9, slowed: false }, streak: null, recallDue: '2026-11-06' }, morning);
  assert.equal(plan.filter(p => p.kind === 'recall').length, 1);
  assert.equal(plan.find(p => p.kind === 'recall')?.day, '2026-11-06');
  assert.ok(plan.filter(p => p.kind === 'daily').length >= 6);
});

test('Saat geçtikten sonra vadesi gelen kart ertesi güne kalır', () => {
  const plan = planNotifications({ daily: null, streak: null, recallDue: '2026-11-04' }, new Date(2026, 10, 4, 20));
  assert.equal(plan[0].day, '2026-11-05');
  assert.equal(plan.length, 1);
});

test('Bugün keşfeden için ritim notu yarın akşama', () => {
  const plan = planNotifications({ daily: null, streak: { keptToday: true }, recallDue: null }, morning);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].day, '2026-11-05');
  assert.equal(plan[0].at.getHours(), 19);
});

test('Hepsi kapalıysa hiçbir şey kurulmaz', () => {
  assert.deepEqual(planNotifications({ daily: null, streak: null, recallDue: null }, morning), []);
});

test('Açılmayan bildirimler sayılır, sayaç açılışla sıfırlanır', () => {
  const on = new Date(2026, 10, 1, 8).getTime();
  assert.equal(unopenedDaily(on, 9, new Date(2026, 10, 1, 8, 30)), 0);
  assert.equal(unopenedDaily(on, 9, new Date(2026, 10, 1, 9, 30)), 1);
  assert.equal(unopenedDaily(on, 9, noon), 4);
  assert.equal(unopenedDaily(new Date(2026, 10, 4, 9, 5).getTime(), 9, noon), 0);
  assert.equal(unopenedDaily(0, 9, noon), 0);
});

test('Üç açılmayan bildirimden sonra Günün Kapısı haftada bire iner', () => {
  const settings = { dailyWork: true, dailyHour: 9, notifyOpenedAt: new Date(2026, 10, 1, 8).getTime() };
  assert.equal(dailySlowed(settings, new Date(2026, 10, 2, 12)), false);
  assert.equal(dailySlowed(settings, new Date(2026, 10, 3, 12)), true);
  const plan = planNotifications({ daily: { hour: 9, slowed: true }, streak: null, recallDue: null }, morning);
  assert.deepEqual(plan.map(p => p.day), ['2026-11-09']);    // yalnızca pazartesi
});

test('Yavaşlama Hatırla ve ritmi etkilemez', () => {
  const plan = planNotifications({ daily: { hour: 9, slowed: true }, streak: null, recallDue: '2026-11-05' }, morning);
  assert.ok(plan.some(p => p.kind === 'recall' && p.day === '2026-11-05'));
});

test('Ayarlar plana doğru çevrilir', () => {
  const base = { dailyWork: false, dailyHour: 9, streakReminder: true, recallReminder: true, notifyOpenedAt: 0 };
  const days = ['2026-11-03'];
  assert.deepEqual(planInput({ ...base, rhythm: 'daily' }, days, '2026-11-06', noon), { daily: null, streak: { keptToday: false }, recallDue: '2026-11-06' });
  // haftalık ritimde ya da hiç keşif yokken seri notu yok; Hatırla kapalıysa kart notu yok
  assert.equal(planInput({ ...base, rhythm: 'weekly' }, days, null, noon).streak, null);
  assert.equal(planInput({ ...base, rhythm: 'off' }, days, null, noon).streak, null);
  assert.equal(planInput({ ...base, rhythm: 'daily' }, [], null, noon).streak, null);
  assert.equal(planInput({ ...base, recallReminder: false, rhythm: 'daily' }, days, '2026-11-06', noon).recallDue, null);
});
