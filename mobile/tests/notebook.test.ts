import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, discover, emptyProgress, hasLabel, mergeProgress, parseProgress, setLabel, visit } from '../src/lib/passport';

const at = (d: string) => new Date(`${d}T10:00:00Z`);

test('Öğrendim, Ziyaret ettim yapmaz; yerinde mühür de etiket yazmaz (M04)', () => {
  const p = setLabel(emptyProgress(), 'x', 'learned', true);
  assert.equal(hasLabel(p, 'x', 'learned'), true);
  assert.equal(hasLabel(p, 'x', 'visited'), false);
  assert.deepEqual(p.visits, {});
  assert.equal(hasLabel(visit(emptyProgress(), 'x', false), 'x', 'visited'), false);
});

test('Bir eser birden çok etiket taşır ve etiket kaldırılabilir', () => {
  let p = setLabel(setLabel(emptyProgress(), 'x', 'want_to_go', true), 'x', 'interested', true);
  assert.equal(hasLabel(p, 'x', 'want_to_go') && hasLabel(p, 'x', 'interested'), true);
  p = setLabel(p, 'x', 'interested', false);
  assert.equal(hasLabel(p, 'x', 'interested'), false);
  assert.equal(hasLabel(p, 'x', 'want_to_go'), true);
});

test('Aynı etiket yeniden konursa kayıt değişmez (T06)', () => {
  const p = setLabel(emptyProgress(), 'x', 'learned', true, at('2026-10-01'));
  assert.equal(setLabel(p, 'x', 'learned', true, at('2026-10-05')), p);
});

test('Cihazlar birleşince son değişiklik kazanır; kaldırılan etiket geri gelmez', () => {
  const phone = setLabel(setLabel(emptyProgress(), 'x', 'learned', true, at('2026-10-01')), 'x', 'learned', false, at('2026-10-03'));
  const tablet = setLabel(emptyProgress(), 'x', 'learned', true, at('2026-10-02'));
  assert.equal(hasLabel(mergeProgress(phone, tablet), 'x', 'learned'), false);
  assert.equal(hasLabel(mergeProgress(tablet, phone), 'x', 'learned'), false);
});

test('Misafir kaydı girişte hesapla birleşir, tekrar birleştirmek bir şey değiştirmez', () => {
  const guest = setLabel(discover(emptyProgress(), 'a', at('2026-10-01')), 'a', 'learned', true, at('2026-10-01'));
  const account = setLabel(discover(emptyProgress(), 'b', at('2026-10-02')), 'b', 'want_to_go', true, at('2026-10-02'));
  const once = mergeProgress(guest, account);
  assert.deepEqual(Object.keys(once.discovered).sort(), ['a', 'b']);
  assert.equal(hasLabel(once, 'a', 'learned') && hasLabel(once, 'b', 'want_to_go'), true);
  assert.equal(canonical(mergeProgress(once, guest)), canonical(once));
});

test('Eski pasaport açılır, bozuk defter kaydı atılır', () => {
  const old = parseProgress(JSON.stringify({ version: 1, discovered: { a: '2026-10-01T00:00:00Z' } }));
  assert.deepEqual(old.notebook, {});
  assert.deepEqual(old.recall, {});
  const broken = parseProgress(JSON.stringify({ version: 1, notebook: { x: { learned: { on: 'evet', at: 'dün' }, uydurma: { on: true, at: '2026-10-01T00:00:00Z' } } } }));
  assert.deepEqual(broken.notebook, {});
});

test('Okunmadan basılan mühür seri günü yazmaz, okunan yazar (M10)', () => {
  const manual = discover(emptyProgress(), 'x', at('2026-10-01'), false);
  assert.ok(manual.discovered.x);
  assert.deepEqual(manual.days, []);
  assert.deepEqual(discover(manual, 'x', at('2026-10-01')).days.length, 1);
});

test('Aynı eser yeniden keşfedilince mühür çoğalmaz, ilk tarih kalır', () => {
  const first = discover(emptyProgress(), 'x', at('2026-10-01'));
  const again = discover(first, 'x', at('2026-10-05'));
  assert.equal(again.discovered.x, first.discovered.x);
  assert.equal(Object.keys(again.discovered).length, 1);
});
