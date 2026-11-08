import test from 'node:test';
import assert from 'node:assert/strict';
import { citedSources } from '../src/lib/citations';

const sources = [{ ref: 'S1', book: 'Bursa III' }, { ref: 'S2', book: 'Bursa III' }, { ref: 'S3', book: 'Konya I' }];

test('Esere Sor: yalnızca cevabın andığı kaynaklar listelenir', () => {
  assert.deepEqual(citedSources('Cami 1390’da yapıldı [S2]. Minaresi tek şerefelidir [S1, F0].', sources).map(s => s.ref), ['S1', 'S2']);
  assert.deepEqual(citedSources('Yapı iki katlıdır [S3][T].', sources).map(s => s.ref), ['S3']);
});

test('Esere Sor: kaynak anmayan cevapta liste boş; işaretsiz eski kaynaklar olduğu gibi kalır', () => {
  assert.deepEqual(citedSources('Kaynaklarımızda bu konuda bilgi yok.', sources), []);
  assert.deepEqual(citedSources('Künyeden [F0].', sources), []);
  assert.deepEqual(citedSources('Metin [S1].', [{ book: 'Bursa I' }]), [{ book: 'Bursa I' }]);
});
