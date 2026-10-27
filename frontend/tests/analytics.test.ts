import test from 'node:test';
import assert from 'node:assert/strict';

// Tarayıcı deposu yerine bellekte bir sözlük
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
};
const { consent, sessionId, setConsent } = await import('../src/lib/analytics.ts');

test('İzin verilmeden ziyaretçi kimliği üretilmez; izin geri alınınca kimlik silinir', () => {
  assert.equal(consent(), null);
  assert.equal(sessionId(), null);
  setConsent('granted');
  const sid = sessionId();
  assert.match(sid ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(sessionId(), sid);                         // aynı tarayıcıda aynı kimlik
  setConsent('denied');
  assert.equal(sessionId(), null);
  assert.equal(store.get('esik:sid:v1'), undefined);
  setConsent('granted');
  assert.notEqual(sessionId(), sid);                      // yeniden izin: yeni kimlik
});
