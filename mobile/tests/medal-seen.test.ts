// Yeni kazanılan madalyonun kutlaması: bir kez gösterilir, eski pasaport kutlama yağmuruyla açılmaz.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newlyEarned } from '../src/lib/medalSeen';

test('İlk açılışta kazanılmış madalyonlar görülmüş sayılır', () => {
  assert.deepEqual(newlyEarned(null, ['first', 'architect']), { fresh: [], seen: ['first', 'architect'] });
});

test('Yeni kazanılan madalyon bir kez kutlanır', () => {
  const once = newlyEarned(['first'], ['first', 'architect']);
  assert.deepEqual(once, { fresh: ['architect'], seen: ['first', 'architect'] });
  assert.deepEqual(newlyEarned(once.seen, ['first', 'architect']).fresh, []);
});

test('Hiç madalyon yoksa kutlama da yok', () => {
  assert.deepEqual(newlyEarned([], []), { fresh: [], seen: [] });
});
