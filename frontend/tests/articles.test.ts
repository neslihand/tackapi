import test from 'node:test';
import assert from 'node:assert/strict';
import { articleBlocks, fold, letterGroups, markTerms, readingMinutes, submissionIssues, wordCount, type Piece } from '../src/lib/articleText.ts';

const tr = (a: string) => a;
const terms = [
  { slug: 'mukarnas', term: 'Mukarnas' }, { slug: 'kalem-isi', term: 'kalem işi' }, { slug: 'kalem', term: 'Kalem' },
  { slug: 'bani', term: 'Bânî' }, { slug: 'imaret', term: 'İmaret' }, { slug: 'ev', term: 'ev' },
];
const marked = (pieces: Piece[]) => pieces.flatMap(p => typeof p === 'string' ? [] : [`${p.term}:${p.text}`]);

test('Makale metni bloklara ayrılır; ara başlıklar içindekiler için kimlik alır', () => {
  const blocks = articleBlocks('Giriş paragrafı\nikinci satır\r\n\r\n## Şehrin Kuruluşu\nAltındaki paragraf\n\n> Vakfiyeden alıntı\n\n## Şehrin Kuruluşu');
  assert.deepEqual(blocks, [
    { type: 'p', text: 'Giriş paragrafı ikinci satır' }, { type: 'h', text: 'Şehrin Kuruluşu', id: 'sehrin-kurulusu' },
    { type: 'p', text: 'Altındaki paragraf' }, { type: 'q', text: 'Vakfiyeden alıntı' }, { type: 'h', text: 'Şehrin Kuruluşu', id: 'sehrin-kurulusu-2' },
  ]);
  assert.deepEqual(articleBlocks(''), []);
});

test('Türkçe katlama harf sayısını korur', () => {
  for (const s of ['İmaret', 'IŞIK', 'Bânî', 'ÇİNİ Şadırvan']) assert.equal(fold(s).length, s.length);
  assert.equal(fold('İmaret IŞIK Bânî'), 'imaret ışık bani');
});

test('Terimler yalnızca ilk geçtikleri yerde, sözcük başında ve en uzun eşleşmeyle işaretlenir', () => {
  const seen = new Set<string>();
  const p1 = markTerms('Taçkapıdaki mukarnaslı kavsara ve kalem işi süslemeler. Mukarnas yine geçer.', terms, seen);
  assert.deepEqual(marked(p1), ['mukarnas:mukarnas', 'kalem-isi:kalem işi']);
  assert.equal(p1.map(p => typeof p === 'string' ? p : p.text).join(''), 'Taçkapıdaki mukarnaslı kavsara ve kalem işi süslemeler. Mukarnas yine geçer.');
  const p2 = markTerms('Yapının banisi bir hanımdı; MUKARNAS burada yok. Kalem ucu.', terms, seen);
  assert.deepEqual(marked(p2), ['bani:bani', 'kalem:Kalem']);      // ikinci paragrafta mukarnas yeniden işaretlenmez
  assert.deepEqual(marked(markTerms('Kervansaray ve imaretler', terms, new Set())), ['imaret:imaret']);
  assert.deepEqual(marked(markTerms('Medrese evleri', terms, new Set())), []);   // iki harfli terim işaretlenmez
  assert.deepEqual(marked(markTerms('Sözcüğün ortasında: tamukarnas', terms, new Set())), []);
});

test('Sözlük harf grupları, okuma süresi ve gönderim kuralları', () => {
  assert.deepEqual(letterGroups([{ initial: 'B' }, { initial: 'B' }, { initial: 'Ç' }]).map(([l, list]) => `${l}${list.length}`), ['B2', 'Ç1']);
  assert.equal(wordCount('Şehrin çarşısı, ağaçlı avlusu.'), 4);
  assert.equal(readingMinutes('söz '.repeat(400)), 2);
  assert.deepEqual(submissionIssues({ title: 'Muradiye’de Bir Sabah', body: 'a'.repeat(400) }, tr), []);
  assert.equal(submissionIssues({ title: 'Kısa', body: 'a'.repeat(399), summary: 'ö'.repeat(401) }, tr).length, 3);
});
