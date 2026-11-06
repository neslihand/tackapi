import test from 'node:test';
import assert from 'node:assert/strict';
import { paragraphsOf, passwordIssues, segments, wordsOf } from '../src/lib/author.ts';
import { errorMessage, getToken, request, setToken } from '../src/lib/api.ts';

test('taslak atıfları metinden ayrılır', () => {
  assert.deepEqual(segments('Cami 1425’te yapıldı [N1, N3]. Bugün açıktır [N4;5].'), [
    { text: 'Cami 1425’te yapıldı ' }, { refs: [1, 3] }, { text: '. Bugün açıktır ' }, { refs: [4, 5] }, { text: '.' }]);
  assert.deepEqual(segments('Atıfsız cümle.'), [{ text: 'Atıfsız cümle.' }]);
});

test('paragraf ve sözcük sayısı atıfları saymaz', () => {
  assert.deepEqual(paragraphsOf('Bir [N1].\n\n\n  İki.  \n\n'), ['Bir [N1].', 'İki.']);
  assert.equal(wordsOf('Cami yapıldı [N1, N3]. Açık [N2].'), 3);
});

test('şifre kuralları sunucuyla aynı', () => {
  assert.deepEqual(passwordIssues('gecici-sifre', 'uzun-yeni-sifre', 'uzun-yeni-sifre'), []);
  assert.equal(passwordIssues('a', 'kisa', 'kisa').length, 1);
  assert.equal(passwordIssues('ayni-sifre-123', 'ayni-sifre-123', 'ayni-sifre-123').length, 1);
  assert.equal(passwordIssues('a', 'uzun-yeni-sifre', 'baska-sifre-12').length, 1);
});

test('oturum anahtarı gönderilir; 401 gelince silinir', async () => {
  setToken('oturum-anahtari');
  let auth: string | null = null;
  const fetcher = (async (_: string, init?: RequestInit) => { auth = new Headers(init?.headers).get('Authorization');
    return new Response(JSON.stringify({ detail: 'Oturum yok ya da süresi doldu. Yeniden giriş yapın.' }), { status: 401 }); }) as typeof fetch;
  await assert.rejects(request('/api/author/me', {}, fetcher), /süresi doldu/);
  assert.equal(auth, 'Bearer oturum-anahtari');
  assert.equal(getToken(), null);
  assert.match(errorMessage(503, null), /kapalı/);
});
