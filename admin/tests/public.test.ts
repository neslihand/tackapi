import test from 'node:test';
import assert from 'node:assert/strict';
import { citedRefs, eventLabel, rangeText, roleLabel, splitCitations, strings } from '../src/public/model.ts';

test('Sohbet cevabındaki kaynak işaretleri ayrılır', () => {
  assert.deepEqual(splitCitations('Cami 1426’da tamamlandı [S1, F0]. Mihrabı çinilidir [S2].'), [
    { text: 'Cami 1426’da tamamlandı ' }, { refs: ['S1', 'F0'] }, { text: '. Mihrabı çinilidir ' }, { refs: ['S2'] }, { text: '.' }]);
  assert.deepEqual(splitCitations('İşaretsiz metin.'), [{ text: 'İşaretsiz metin.' }]);
  assert.deepEqual(splitCitations('[T] terim [köşeli parantez değil]'), [{ refs: ['T'] }, { text: ' terim [köşeli parantez değil]' }]);
});

test('Yalnızca atıf yapılan kaynaklar bulunur', () => {
  assert.deepEqual([...citedRefs('A [S1, F0]. B [S3]. C [S1].')].sort(), ['F0', 'S1', 'S3']);
  assert.equal(citedRefs('Atıfsız cevap.').size, 0);
});

test('Yıl aralıkları okunur biçimde yazılır', () => {
  assert.equal(rangeText('[1425,1427)'), '1425–1426');
  assert.equal(rangeText('[1426,1427)'), '1426');
  assert.equal(rangeText(null), '');
  assert.equal(rangeText('serbest metin'), 'serbest metin');
});

test('Etiketler iki dilde de var; bilinmeyen değerler boş ya da genel etikete düşer', () => {
  assert.equal(roleLabel('patron', 'tr'), 'Bânî');
  assert.equal(roleLabel('architect', 'en'), 'Architect');
  assert.equal(roleLabel('yok', 'tr'), '');
  assert.equal(eventLabel('restoration', 'tr'), 'Restorasyon');
  assert.equal(eventLabel('yok', 'en'), 'Event');
  assert.deepEqual(Object.keys(strings('tr')).sort(), Object.keys(strings('en')).sort());
});
