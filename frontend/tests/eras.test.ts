import test from 'node:test';
import assert from 'node:assert/strict';
import { eraOptions, inEra } from '../src/lib/eras.ts';

test('Dönem seçenekleri kronolojik sıradadır, alt dönemler üst döneminin altında durur', () => {
  const names = ['Osmanlı Dönemi', 'Klasik Osmanlı Dönemi', 'Anadolu Selçuklu Dönemi', 'Bizans Dönemi', 'Tanzimat ve Son Dönem Osmanlı', 'Erken Osmanlı Dönemi', 'Beylikler Dönemi', 'Eşrefoğulları Dönemi'];
  assert.deepEqual(eraOptions(names).map(o => [o.value, o.child]), [
    ['Bizans Dönemi', false], ['Anadolu Selçuklu Dönemi', false], ['Beylikler Dönemi', false], ['Eşrefoğulları Dönemi', true],
    ['Osmanlı Dönemi', false], ['Erken Osmanlı Dönemi', true], ['Klasik Osmanlı Dönemi', true], ['Tanzimat ve Son Dönem Osmanlı', true],
  ]);
});

test('Yalnızca alt dönemi olan eserlerde üst dönem de seçenek olur; bilinmeyen dönem sona gelir', () => {
  assert.deepEqual(eraOptions(['Klasik Osmanlı', 'Mengücekli', 'Erken Osmanlı']).map(o => o.value), ['Osmanlı Dönemi', 'Erken Osmanlı', 'Klasik Osmanlı', 'Mengücekli']);
  assert.deepEqual(eraOptions(['Classical Ottoman Period'], true).map(o => o.value), ['Ottoman Period', 'Classical Ottoman Period']);
});

test('Üst dönem seçilince alt dönemlerin eserleri de gelir, tersi gelmez', () => {
  assert.equal(inEra('Osmanlı Dönemi', 'Klasik Osmanlı Dönemi'), true);
  assert.equal(inEra('Osmanlı Dönemi', 'Osmanlı Dönemi'), true);
  assert.equal(inEra('Klasik Osmanlı Dönemi', 'Osmanlı Dönemi'), false);
  assert.equal(inEra('Osmanlı Dönemi', 'Bizans Dönemi'), false);
  assert.equal(inEra('', 'Bizans Dönemi'), true);
  assert.equal(inEra('Mengücekli', 'Mengücekli'), true);
});
