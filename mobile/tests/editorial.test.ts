// Rota süresi, modül düğmeleri ve soru takibi: telefonun kendi verdiği kararlar.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFlags, mergeFlags } from '../src/lib/flags';
import { canFollow, statusLabel, unreadCount } from '../src/lib/questionRules';
import { durationChip, durationLabel, timeLabel } from '../src/lib/routeLabels';
import { durationsOf, isLongTrip, planRoute, withDuration } from '../src/lib/routePlan';

test('Panel yalnızca bilinen modülü, yalnızca doğru/yanlışla değiştirir', () => {
  assert.deepEqual(mergeFlags(undefined), defaultFlags);
  assert.deepEqual(mergeFlags(null), defaultFlags);
  assert.deepEqual(mergeFlags('kapat'), defaultFlags);
  assert.equal(mergeFlags({ daily_hunt: false }).daily_hunt, false);
  assert.equal(mergeFlags({ daily_hunt: false }).mini_games, true);
  assert.equal(mergeFlags({ daily_hunt: 'false' }).daily_hunt, true);          // bozuk değer bir şeyi kapatmaz
  assert.equal('bilinmeyen' in mergeFlags({ bilinmeyen: false }), false);
});

test('Süre seçimi yalnızca editörün yazdığı sürelerden, kısa yürüyüşler önce', () => {
  const routes = [{ id: 'a', minutes: 180 }, { id: 'b', minutes: 45 }, { id: 'c', minutes: null }, { id: 'd' }, { id: 'e', minutes: 20 }, { id: 'f', minutes: 45 }];
  assert.deepEqual(durationsOf(routes), [20, 45, 180]);
  assert.deepEqual(durationsOf([{ minutes: null }, {}]), []);
  assert.deepEqual(withDuration(routes, 45).map(r => r.id), ['b', 'f']);
  assert.equal(withDuration(routes, null).length, routes.length);              // seçim yok: tematik listeler de görünür
  assert.equal(isLongTrip(180), true);
  assert.equal(isLongTrip(90), false);
  assert.equal(isLongTrip(null), false);
});

test('Süre, editörün mü telefonun tahmini mi olduğunu söyler', () => {
  assert.equal(durationLabel(20), '20 dakika');
  assert.equal(durationLabel(60), '1 saat');
  assert.equal(durationLabel(360), '6 saat');
  assert.equal(durationChip(45), '45 dakika');
  assert.equal(durationChip(180), 'Seyahat · 3 saat');
  const plan = planRoute([{ location: { lat: 40.18, lon: 29.06 } }]);
  assert.match(timeLabel(45, plan), /Editörün kontrol ettiği süre: 45 dakika/);
  assert.match(timeLabel(null, plan), /tahmin/);
});

test('Takip edilecek soru sunucunun sınırlarında, okunmamışlar sayılır', () => {
  assert.equal(canFollow('kim?'), false);
  assert.equal(canFollow('   a   '), false);
  assert.equal(canFollow('Ustası kimdir?'), true);
  assert.equal(canFollow('a'.repeat(501)), false);
  assert.equal(unreadCount([{ unread: true }, { unread: false }, { unread: true }]), 2);
  assert.equal(unreadCount([]), 0);
  assert.equal(statusLabel('unresolved'), 'Kaynaklarda bulunamadı');
});
