import test from 'node:test';
import assert from 'node:assert/strict';
import { articleBlocks, articleIssues, overlapping, pagesLabel, readingMinutes, termIssues, wordCount } from '../src/lib/format.ts';

test('Makale metni bloklara ayrılır: ara başlık, paragraf, alıntı (sitedeki gibi)', () => {
  const body = 'Birinci satır\nikinci satır\r\n\r\n## Vakıflar\nAltındaki paragraf\n\n\n> Bir vakfiyeden alıntı';
  assert.deepEqual(articleBlocks(body), [
    { type: 'p', text: 'Birinci satır ikinci satır' }, { type: 'h', text: 'Vakıflar' },
    { type: 'p', text: 'Altındaki paragraf' }, { type: 'q', text: 'Bir vakfiyeden alıntı' },
  ]);
  assert.deepEqual(articleBlocks(''), []);
  assert.deepEqual(articleBlocks('##Bitişik değil başlık'), [{ type: 'p', text: '##Bitişik değil başlık' }]);
});

test('Sözcük sayısı ve okuma süresi Türkçe harfleri sayar', () => {
  assert.equal(wordCount('Şehrin çarşısı, ağaçlı avlusu: üç kelime değil beş.'), 8);
  assert.equal(readingMinutes('kelime '.repeat(30)), 1);
  assert.equal(readingMinutes('kelime '.repeat(1000)), 5);
});

test('Makale doğrulaması sunucuyla aynı: taslak boş olabilir, yayın en az 100 karakter', () => {
  assert.deepEqual(articleIssues({ title_tr: 'Bursa Tarihi', body_tr: '' }), []);
  assert.equal(articleIssues({ title_tr: 'Bursa Tarihi', body_tr: 'kısa' }, true).length, 1);
  assert.deepEqual(articleIssues({ title_tr: 'Bursa Tarihi', body_tr: 'a'.repeat(100) }, true), []);
  assert.equal(articleIssues({ title_tr: 'Kısa', body_tr: '' }).length, 1);
  assert.equal(articleIssues({ title_tr: 'Bursa Tarihi', body_tr: '', summary_en: 'x'.repeat(401) }).length, 1);
});

test('Terim doğrulaması', () => {
  assert.deepEqual(termIssues({ term_tr: 'Mukarnas', definition_tr: 'Petek görünümlü geçiş öğesi.' }), []);
  assert.equal(termIssues({ term_tr: 'M', definition_tr: 'kısa' }).length, 2);
  assert.equal(termIssues({ term_tr: 'Mukarnas', definition_tr: 'Petek görünümlü geçiş öğesi.', definition_child_tr: 'ç'.repeat(601) }).length, 1);
});

test('Seçilen paragrafların sayfaları ve önceki aktarımlarla çakışma', () => {
  assert.equal(pagesLabel([{ pages: [26, 24] }, { pages: [28] }]), 's. 24–28');
  assert.equal(pagesLabel([{ pages: [24] }, { pages: [24] }]), 's. 24');
  assert.equal(pagesLabel([{ pages: [] }]), '');
  const used = [{ from_para: 0, to_para: 3, title: 'A' }, { from_para: 6, to_para: 8, title: 'B' }];
  assert.deepEqual(overlapping(used, 4, 5), []);
  assert.deepEqual(overlapping(used, 3, 6).map(u => u.title), ['A', 'B']);
  assert.deepEqual(overlapping(used, 8, 12).map(u => u.title), ['B']);
});
