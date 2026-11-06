import test from 'node:test';
import assert from 'node:assert/strict';
import { STRUCTURE_GROUPS, structureOf, structureOptions } from '../src/lib/structures.ts';

test('Yapı kategorisi eser türünden bulunur; kod yoksa tür adından', () => {
  assert.equal(structureOf({ kind: 'masjid', category: 'Mescit' }), 'ibadet');
  assert.equal(structureOf({ kind: 'tekke', category: 'Tekke' }), 'ibadet');
  assert.equal(structureOf({ category: 'Kervansaray' }), 'ticaret');
  assert.equal(structureOf({ category: 'Han (inn)' }), 'ticaret');
  assert.equal(structureOf({ category: 'Türbe' }), 'mezar');
  assert.equal(structureOf({ category: 'Külliye' }), 'kulliye');
  assert.equal(structureOf({ kind: 'other', category: 'Diğer' }), 'diger');
});

test('Seçenekler yalnızca koleksiyonda olan kategorileri sabit sırayla verir', () => {
  const options = structureOptions([{ category: 'Hamam' }, { category: 'Cami' }, { category: 'Hamam' }]);
  assert.deepEqual(options, [['ibadet', 'İbadet yapıları'], ['kamu', 'Hayır ve kamu yapıları']]);
  assert.equal(structureOptions([{ category: 'Cami' }], true)[0][1], 'Places of worship');
  assert.equal(new Set(STRUCTURE_GROUPS.flatMap(g => g.kinds)).size, STRUCTURE_GROUPS.flatMap(g => g.kinds).length);
});
