import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyRun, daysThisWeek, rhythmLine, weeklyRun, weekOf } from '../src/lib/rhythm';

// 2026-11-04 is a Wednesday; its ISO week starts on Monday 2026-11-02
const wednesday = new Date(2026, 10, 4, 12);

test('Hafta pazartesi başlar, ay ve yıl sınırını doğru geçer', () => {
  assert.equal(weekOf('2026-11-04'), '2026-11-02');
  assert.equal(weekOf('2026-11-02'), '2026-11-02');
  assert.equal(weekOf('2026-11-01'), '2026-10-26');
  assert.equal(weekOf('2027-01-01'), '2026-12-28');
});

test('Günlük seri: bugün henüz açık olması seriyi bozmaz', () => {
  assert.equal(dailyRun(['2026-11-02', '2026-11-03'], wednesday).days, 2);
  assert.equal(dailyRun(['2026-11-02', '2026-11-03', '2026-11-04'], wednesday).today, true);
  assert.equal(dailyRun([], wednesday).days, 0);
});

test('Haftada bir izin günü seriyi bitirmez, ikinci boşluk bitirir (T11)', () => {
  const rested = ['2026-11-01', '2026-11-02', '2026-11-04'];   // salı boş, izin günü
  assert.deepEqual(dailyRun(rested, wednesday), { days: 3, today: true, restUsedThisWeek: true });
  const twice = ['2026-11-01', '2026-11-03', '2026-11-05'];    // aynı haftada pazartesi ve çarşamba boş
  assert.equal(dailyRun(twice, new Date(2026, 10, 5, 12)).days, 2);
  assert.equal(dailyRun(['2026-10-30'], wednesday).days, 0);   // art arda boş günler izin sayılmaz
});

test('Çevrimdışıyken aynı günün iki kez gelmesi seriyi şişirmez (T11)', () => {
  assert.equal(dailyRun(['2026-11-03', '2026-11-03', '2026-11-04', '2026-11-04'], wednesday).days, 2);
  assert.equal(daysThisWeek(['2026-11-03', '2026-11-03', '2026-11-04'], wednesday), 2);
});

test('Haftalık seri art arda haftaları sayar, bu hafta açıkken bozulmaz', () => {
  assert.equal(weeklyRun(['2026-10-20', '2026-10-27', '2026-11-03'], wednesday), 3);
  assert.equal(weeklyRun(['2026-10-20', '2026-10-27'], wednesday), 2);
  assert.equal(weeklyRun(['2026-10-13', '2026-10-27'], wednesday), 1);
});

test('Metin suçlamaz: yaptığını söyler, seriyi kapatan kullanıcıya hiçbir şey demez', () => {
  assert.equal(rhythmLine('off', ['2026-11-03'], wednesday), null);
  assert.match(rhythmLine('daily', ['2026-11-03', '2026-11-04'], wednesday)!, /Bu hafta 2 ayrı gün yeni bir şey öğrendin/);
  for (const line of [rhythmLine('daily', [], wednesday), rhythmLine('weekly', [], wednesday), rhythmLine('daily', ['2026-10-01'], wednesday)])
    assert.doesNotMatch(line!, /kayb|bozul|kaçır|gelmedin/i);
});
