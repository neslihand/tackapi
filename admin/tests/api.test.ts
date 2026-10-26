import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, errorMessage, getToken, handleUnauthorized, request, setToken } from '../src/lib/api.ts';

const reply = (status: number, body: unknown) => async () => new Response(body === null ? null : JSON.stringify(body), { status });

test('Anahtar her isteğe Bearer başlığı olarak eklenir', async () => {
  setToken('test-anahtari-1234567890');
  let seen: Headers | undefined;
  const fetcher = (async (_url: string, init: RequestInit) => { seen = new Headers(init.headers); return new Response('{"name":"neslihan"}'); }) as typeof fetch;
  assert.deepEqual(await request('/api/admin/me', {}, fetcher), { name: 'neslihan' });
  assert.equal(seen?.get('Authorization'), 'Bearer test-anahtari-1234567890');
});

test('JSON gövdeye içerik türü eklenir, dosya yüklemede eklenmez', async () => {
  const types: (string | null)[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => { types.push(new Headers(init.headers).get('Content-Type')); return new Response('{}'); }) as typeof fetch;
  await request('/x', { method: 'PATCH', body: JSON.stringify({ a: 1 }) }, fetcher);
  await request('/x', { method: 'POST', body: new FormData() }, fetcher);
  assert.deepEqual(types, ['application/json', null]);
});

test('401 gelince anahtar silinir ve giriş ekranına dönülür', async () => {
  setToken('test-anahtari-1234567890');
  let loggedOut = false;
  handleUnauthorized(() => { loggedOut = true; });
  await assert.rejects(request('/api/admin/me', {}, reply(401, { detail: 'Geçersiz ya da eksik yönetici anahtarı.' }) as typeof fetch),
    (e: unknown) => e instanceof ApiError && e.status === 401 && e.message === 'Geçersiz ya da eksik yönetici anahtarı.');
  assert.equal(getToken(), null);
  assert.ok(loggedOut);
});

test('422 doğrulama listesi okunur bir mesaja çevrilir', () => {
  const body = { detail: [{ loc: ['body', 'lat'], msg: 'Input should be less than or equal to 43' }, { loc: ['body'], msg: 'Extra inputs' }] };
  assert.equal(errorMessage(422, body), 'lat: Input should be less than or equal to 43 · Extra inputs');
  assert.equal(errorMessage(500, null), 'İstek başarısız oldu (500).');
});

test('Sunucuya ulaşılamazsa anlaşılır bir hata verilir; 204 boş döner', async () => {
  const down = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  await assert.rejects(request('/x', {}, down), (e: unknown) => e instanceof ApiError && e.status === 0 && /uvicorn/.test(e.message));
  assert.equal(await request('/x', { method: 'DELETE' }, reply(204, null) as typeof fetch), undefined);
});
