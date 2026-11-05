import assert from 'node:assert/strict';
import { test } from 'node:test';
import { huntDate, huntFinished, huntShareText } from '../src/lib/hunt';
import { emptyProgress, mergeProgress, parseProgress, recordHunt } from '../src/lib/passport';

const day = '2026-11-07';
const at = (h: number) => new Date(`2026-11-07T0${h}:00:00Z`);

test('Bitti: bulundu ya da hak doldu', () => {
  assert.equal(huntFinished(undefined, 3), false);
  assert.equal(huntFinished({ attempts: 2, solved: false, at: '', wrong: [] }, 3), false);
  assert.equal(huntFinished({ attempts: 3, solved: false, at: '', wrong: [] }, 3), true);
  assert.equal(huntFinished({ attempts: 1, solved: true, at: '', wrong: [] }, 3), true);
});

test('Deneme sayısı geri gitmez, bulunan görev bulunmuş kalır', () => {
  let p = recordHunt(emptyProgress(), day, 1, false, 3, at(1));
  p = recordHunt(p, day, 2, true, null, at(2));
  assert.deepEqual([p.hunt[day].attempts, p.hunt[day].solved, p.hunt[day].wrong], [2, true, [3]]);
  p = recordHunt(p, day, 1, false, 0, at(3));
  assert.deepEqual([p.hunt[day].attempts, p.hunt[day].solved, p.hunt[day].wrong], [2, true, [0, 3]]);
});

test('T08: iki cihaz aynı gün tek oyuncudur', () => {
  const phone = recordHunt(emptyProgress(), day, 1, false, 0, at(1));
  const tablet = recordHunt(emptyProgress(), day, 2, true, 1, at(2));
  const merged = mergeProgress(phone, tablet);
  assert.deepEqual([merged.hunt[day].attempts, merged.hunt[day].solved, merged.hunt[day].wrong], [2, true, [0, 1]]);
  assert.deepEqual(mergeProgress(tablet, phone).hunt[day].solved, true);
  assert.equal(merged.hunt[day].at, at(1).toISOString());
});

test('Saklanan kayıt geri okunur, bozuğu atılır', () => {
  const p = recordHunt(emptyProgress(), day, 2, true, 1, at(1));
  assert.deepEqual(parseProgress(JSON.stringify(p)).hunt, p.hunt);
  assert.deepEqual(parseProgress(JSON.stringify({ ...p, hunt: { dun: { attempts: 1, solved: true, at: at(1).toISOString() }, [day]: { attempts: 'iki' } } })).hunt, {});
});

test('T09: paylaşım metni yalnızca tarih ve deneme deseni taşır', () => {
  const text = huntShareText(day, 2, true, 4);
  assert.equal(text, 'EŞİK Detay Avı · 7 Kasım\n○●··\n2. denemede buldum.');
  assert.equal(huntShareText(day, 3, false, 3), 'EŞİK Detay Avı · 7 Kasım\n○○○\nBu kez bulamadım.');
});

test('Gün sınırı: tarih cihazın saat diliminden kaymaz', () => {
  assert.equal(huntDate('2026-11-07'), '7 Kasım');
  assert.equal(huntDate('2026-12-31'), '31 Aralık');
  assert.equal(huntDate('2027-01-01'), '1 Ocak');
});
