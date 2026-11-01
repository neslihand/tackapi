import test from 'node:test';
import assert from 'node:assert/strict';
import { isRead, minReadMs, seenRatio, spokenSeconds, textInView } from '../src/lib/storyProgress';

const words = (n: number) => Array.from({ length: n }, () => 'söz').join(' ');

test('Metnin %75\'i ekrandan geçmeden hikâye tamamlanmış sayılmaz (T03)', () => {
  const text = words(100);
  assert.equal(isRead(0.74, 60000, text), false);
  assert.equal(isRead(0.75, 60000, text), true);
});

test('Sona hızla kaydırmak okumak değildir: metin ekrandayken yeterli süre geçmeli', () => {
  const text = words(200);
  assert.equal(isRead(1, 1000, text), false);
  assert.equal(isRead(1, minReadMs(text) - 1, text), false);
  assert.equal(isRead(1, minReadMs(text), text), true);
});

test('Kısa ve çok uzun metinlerin alt ve üst süre sınırı vardır', () => {
  assert.equal(minReadMs(words(3)), 5000);
  assert.equal(minReadMs(words(100000)), 120000);
});

test('Görülen oran ve görünürlük ekranın konumundan hesaplanır', () => {
  assert.equal(seenRatio(100, 500, 1000), 0);        // metne gelinmedi
  assert.equal(seenRatio(1250, 500, 1000), 0.75);
  assert.equal(seenRatio(9000, 500, 1000), 1);
  assert.equal(seenRatio(100, 0, 0), 0);
  assert.equal(textInView(0, 400, 500, 1000), false);
  assert.equal(textInView(0, 600, 500, 1000), true);
  assert.equal(textInView(1600, 2400, 500, 1000), false); // metin geride kaldı: orada beklemek süre kazandırmaz
});

test('Sesli süre etiketi metnin uzunluğundan gelir', () => assert.equal(spokenSeconds(words(72)), 30));
