import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoute } from '../src/lib/routePlan';

const at = (lat: number, lon = 29) => ({ location: { lat, lon } });

test('Yakın duraklar yürüyüş sayılır, süre mesafe ve durak başına hesaplanır', () => {
  const plan = planRoute([at(40.18), at(40.183)]);       // yaklaşık 330 m
  assert.equal(plan.walkable, true);
  assert.ok(plan.minutes! >= 24 && plan.minutes! <= 26);
  assert.equal(plan.bucket, 45);
  assert.equal(planRoute([at(40.18)]).bucket, 20);
});

test('Uzun ayağı olan rota yürüyüş değildir ve süre uydurulmaz', () => {
  const plan = planRoute([at(40.18), at(40.43)]);        // İznik mesafesi
  assert.equal(plan.walkable, false);
  assert.equal(plan.minutes, null);
  assert.equal(plan.bucket, 'long');
});

test('Konumu olmayan durak varsa süre verilmez, boş rota çökmez', () => {
  const plan = planRoute([at(40.18), { location: null }]);
  assert.deepEqual([plan.walkable, plan.minutes, plan.placed], [false, null, 1]);
  assert.deepEqual([planRoute([]).walkable, planRoute([]).minutes, planRoute([]).lengthM], [false, null, 0]);
});
