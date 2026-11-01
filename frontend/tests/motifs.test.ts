import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_IDS, buildingFor, ornamentsFor, storyScenes } from '../src/lib/motifs.ts';

test('Hikâyenin yapı çizimi türe göre seçilir; kod yoksa tür adından bulunur', () => {
  assert.equal(buildingFor({ kind: 'bath', category: 'Hamam' }), 'bath');
  assert.equal(buildingFor({ kind: 'tekke', category: 'Tekke' }), 'zawiya');
  assert.equal(buildingFor({ category: 'Cami ve Darüşşifa' }), 'mosque');
  assert.equal(buildingFor({ category: 'Külliye' }), 'complex');
  assert.equal(buildingFor({ category: 'Kervansaray' }), 'han');
  assert.equal(buildingFor({ kind: 'other', category: 'Diğer' }), 'arch');
  for (const id of BUILDING_IDS) assert.equal(buildingFor({ kind: id, category: '' }), id);
});

test('Süsleme motifleri döneme göre seçilir', () => {
  assert.deepEqual(ornamentsFor({ periodSlug: 'anadolu-selcuklu', period: 'Anadolu Selçuklu Dönemi' })[0], 'star');
  assert.deepEqual(ornamentsFor({ periodSlug: 'erken-osmanli', period: 'Erken Osmanlı Dönemi' })[0], 'tile');
  assert.deepEqual(ornamentsFor({ periodSlug: 'klasik-osmanli', period: 'Klasik Osmanlı Dönemi' })[0], 'tulip');
  assert.deepEqual(ornamentsFor({ periodSlug: 'osmanli', period: 'Osmanlı Dönemi' })[0], 'tulip');
  assert.deepEqual(ornamentsFor({ periodSlug: 'lale-ve-batililasma', period: 'Lale Devri ve Batılılaşma' })[0], 'scroll');
  assert.deepEqual(ornamentsFor({ period: 'Mengücekli' })[0], 'star');
  assert.deepEqual(ornamentsFor({ period: 'Dönemi belirtilmemiş' })[0], 'star');
});

test('Her paragrafa bir sahne düşer; yapı çizimiyle açılır ve yan yana aynı çizim gelmez', () => {
  const scenes = storyScenes({ kind: 'mosque', category: 'Cami', periodSlug: 'klasik-osmanli', period: 'Klasik Osmanlı' }, 7);
  assert.equal(scenes.length, 7);
  assert.deepEqual(scenes[0], { left: 'mosque', right: 'tulip' });
  for (const s of scenes) assert.notEqual(s.left, s.right);
  for (const s of storyScenes({ kind: 'other', category: 'Diğer', period: '' }, 5)) assert.notEqual(s.left, s.right);
  assert.equal(storyScenes({ category: 'Cami', period: '' }, 0).length, 1);
});
