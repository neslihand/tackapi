// Okuma Odası'nın metin kuralları: telefon ve site aynı makaleyi aynı bölümlere ayırıp aynı terimleri işaretlemeli.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { articleBlocks, capitalize, fold, letterGroups, markTerms, slugifyHeading, TURKISH_ALPHABET } from '../src/lib/articleText';
import * as site from '../../frontend/src/lib/articleText.ts';

const body = `## Kuruluş\n\nBursa Ulucami'nin mukarnaslı kapısı ve kalem işi süslemeleri.\n\n> Bânî, vakfiyesinde bunu yazdırmıştır.\n\n## Kuruluş\n\nİmaret ve medrese.\nİkinci satır aynı paragrafta.\n\n## Çeşmeler ve Şadırvan\n\nKalem işleri; mukarnas yeniden geçer.`;
const terms = [{ slug: 'mukarnas', term: 'mukarnas' }, { slug: 'kalem', term: 'kalem' }, { slug: 'kalem-isi', term: 'kalem işi' }, { slug: 'bani', term: 'Bânî' }, { slug: 'imaret', term: 'imaret' }, { slug: 'ab', term: 'ab' }];

test('Makale siteyle aynı bloklara ayrılır, başlık kimlikleri aynı', () => {
  assert.deepEqual(articleBlocks(body), site.articleBlocks(body));
  assert.deepEqual(articleBlocks(body).filter(b => b.type === 'h').map(b => b.id), ['kurulus', 'kurulus-2', 'cesmeler-ve-sadirvan']);
  assert.equal(slugifyHeading('Çeşmeler ve Şadırvan'), site.slugifyHeading('Çeşmeler ve Şadırvan'));
  assert.deepEqual(articleBlocks(''), []);
});

test('Terimler siteyle aynı yerde işaretlenir, her terim makalede bir kez', () => {
  const mine = new Set<string>(), theirs = new Set<string>();
  for (const b of articleBlocks(body)) if (b.type !== 'h') assert.deepEqual(markTerms(b.text, terms, mine), site.markTerms(b.text, terms, theirs));
  assert.deepEqual([...mine].sort(), [...theirs].sort());
  assert.ok(!mine.has('ab'));         // 3 harften kısa terim işaretlenmez
  const pieces = markTerms('Kalem işi ve mukarnaslı', terms, new Set());
  assert.deepEqual(pieces.filter(p => typeof p !== 'string').map(p => (p as { term: string }).term), ['kalem-isi', 'mukarnas']);
});

test('Türkçe katlama, büyük harf, harf grupları ve alfabe aynı', () => {
  for (const s of ['İmaret', 'IŞIK', 'Bânî', 'kündekâri', 'Çeşme']) assert.equal(fold(s), site.fold(s));
  assert.equal(capitalize('imaret'), 'İmaret');
  assert.equal(capitalize('imaret'), site.capitalize('imaret'));
  assert.deepEqual(TURKISH_ALPHABET, site.TURKISH_ALPHABET);
  const items = [{ initial: 'A', n: 1 }, { initial: 'Ç', n: 2 }, { initial: 'A', n: 3 }];
  assert.deepEqual(letterGroups(items), site.letterGroups(items));
});
