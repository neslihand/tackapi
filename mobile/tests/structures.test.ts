import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item } from '../src/lib/api';
import { filterWorks, kindOptions, searchIndex } from '../src/lib/explore';
import { structureOf, structureOptions } from '../src/lib/structures';

const item = (slug: string, kind: string, kind_label: string, city = 'bursa') =>
  ({ slug, name: slug, alt_names: [], kind, kind_label, city: { slug: city, name: city }, district: null }) as unknown as Item;
const items = [item('a', 'mosque', 'Cami'), item('b', 'masjid', 'Mescit'), item('c', 'han', 'Han'), item('d', 'bath', 'Hamam', 'konya'), item('e', 'other', 'Diğer')];

test('Yapı kategorisi türden bulunur', () => {
  assert.equal(structureOf('masjid'), 'ibadet');
  assert.equal(structureOf('bedesten'), 'ticaret');
  assert.equal(structureOf('other'), 'diger');
});

test('Kategori süzgeci eserleri ve tür seçeneklerini daraltır', () => {
  assert.deepEqual(structureOptions(items, null).map(([id]) => id), ['ibadet', 'kamu', 'ticaret', 'diger']);
  assert.deepEqual(structureOptions(items, 'bursa').map(([id]) => id), ['ibadet', 'ticaret', 'diger']);
  const found = filterWorks(items, searchIndex(items), { query: '', city: null, group: 'ibadet', kind: null });
  assert.deepEqual(found.map(i => i.slug), ['a', 'b']);
  assert.deepEqual(kindOptions(items, null, 'ibadet').map(([k]) => k), ['mosque', 'masjid']);
});
