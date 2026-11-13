"""Güvenlik başlıkları, gövde sınırı (pipeline/security.py) ve yönetici anahtarı deneme sınırı (admin.admin_user).
Veritabanı gerekmez: küçük bir uygulama aynı ara katmanı ve aynı kimlik denetimini kullanır."""
import os, sys, unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
from fastapi import Depends, FastAPI, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
import admin, security  # noqa: E402

KEY = 'k7Qw-2xPz9LmVb4R'


def build(**env):
    with mock.patch.dict(os.environ, env):
        app = FastAPI()
        app.add_middleware(security.Guard, body_max=1000)

        @app.get('/api/admin/me')
        def me(user: str = Depends(admin.admin_user)):
            return dict(user=user)

        @app.post('/api/echo')
        async def echo(request: Request):
            return dict(size=len(await request.body()))

        @app.get('/api/cached')
        def cached():
            from fastapi.responses import JSONResponse
            return JSONResponse({}, headers={'Cache-Control': 'max-age=60'})

        @app.get('/{rest:path}')
        def page(rest: str):
            from fastapi.responses import HTMLResponse
            return HTMLResponse('<!doctype html><title>TAÇKAPI</title>')
        app.middleware_stack = app.build_middleware_stack()   # ara katman ayarları bu ortamla okunsun
        return TestClient(app)


class HeadersTest(unittest.TestCase):
    def test_pages_run_only_their_own_scripts_and_are_framed_only_by_the_same_address(self):
        r = build().get('/')
        policy = r.headers['content-security-policy']
        self.assertIn("script-src 'self'", policy)
        self.assertIn("frame-ancestors 'self'", policy)
        self.assertIn('img-src', policy)
        self.assertIn(security.TILES, policy)
        self.assertEqual(r.headers['x-frame-options'], 'SAMEORIGIN')
        self.assertEqual(r.headers['x-content-type-options'], 'nosniff')
        self.assertIn('camera=(self)', r.headers['permissions-policy'])

    def test_a_chat_service_on_another_address_may_be_reached(self):
        policy = build(VITE_CHAT_API_URL='https://sohbet.ornek.com/api/chat').get('/').headers['content-security-policy']
        self.assertIn("connect-src 'self' https://sohbet.ornek.com", policy)
        self.assertIn("connect-src 'self';", build(VITE_CHAT_API_URL='/api/chat').get('/').headers['content-security-policy'])

    def test_api_is_never_framed_and_private_answers_are_not_stored(self):
        with mock.patch.dict(os.environ, {'VAKIF_ADMIN_TOKENS': f'deneme:{KEY}'}):
            r = build().get('/api/admin/me', headers={'Authorization': f'Bearer {KEY}'})
        self.assertEqual(r.json(), {'user': 'deneme'})
        self.assertEqual(r.headers['x-frame-options'], 'DENY')
        self.assertIn("frame-ancestors 'none'", r.headers['content-security-policy'])
        self.assertEqual(r.headers['cache-control'], 'no-store')
        self.assertEqual(build().get('/api/cached').headers['cache-control'], 'max-age=60')   # rotanınki korunur

    def test_media_and_docs(self):
        self.assertIn('sandbox', security.headers_for('/media/x.webp', 'P')['Content-Security-Policy'])
        self.assertNotIn('Content-Security-Policy', security.headers_for('/docs', 'P'))
        self.assertEqual(security.headers_for('/docs', 'P')['X-Content-Type-Options'], 'nosniff')

    def test_headers_can_be_turned_off_for_the_live_demo(self):
        r = build(VAKIF_SECURITY_HEADERS='off').get('/')
        self.assertNotIn('content-security-policy', r.headers)

    def test_large_bodies_are_refused(self):
        c = build()
        self.assertEqual(c.post('/api/echo', content=b'x' * 900).json(), {'size': 900})
        r = c.post('/api/echo', content=b'x' * 1001)
        self.assertEqual(r.status_code, 413)
        self.assertIn('MB', r.json()['detail'])
        # Content-Length olmadan, parça parça gönderilen gövde de
        r = c.post('/api/echo', content=iter([b'x' * 600, b'x' * 600]))
        self.assertEqual(r.status_code, 413)


class AdminGuessTest(unittest.TestCase):
    def setUp(self):
        admin._guesses.clear()
        self.env = mock.patch.dict(os.environ, {'VAKIF_ADMIN_TOKENS': f'deneme:{KEY}'})
        self.env.start()
        self.c = build(VAKIF_ADMIN_TOKENS=f'deneme:{KEY}')

    def tearDown(self):
        self.env.stop()
        admin._guesses.clear()

    def me(self, key):
        return self.c.get('/api/admin/me', headers={'Authorization': f'Bearer {key}'}).status_code

    def test_many_different_wrong_keys_lock_the_address(self):
        for i in range(admin.GUESS_N):
            self.assertEqual(self.me(f'yanlis-anahtar-{i:04d}'), 401)
        self.assertEqual(self.me(KEY), 429)   # kilitliyken doğru anahtar da denenemez
        r = self.c.get('/api/admin/me', headers={'Authorization': 'Bearer baska-bir-anahtar'})
        self.assertIn('retry-after', r.headers)

    def test_the_same_stale_key_does_not_lock_the_admin_out(self):
        for _ in range(admin.GUESS_N * 3):
            self.assertEqual(self.me('eski-anahtar-1234567'), 401)
        self.assertEqual(self.me(KEY), 200)

    def test_the_lock_ends_with_the_window(self):
        for i in range(admin.GUESS_N):
            self.me(f'yanlis-anahtar-{i:04d}')
        later = admin.time.monotonic() + admin.GUESS_WINDOW + 1
        with mock.patch.object(admin.time, 'monotonic', return_value=later):
            self.assertEqual(self.me(KEY), 200)

    def test_guessable_keys_are_reported(self):
        self.assertTrue(admin.guessable('fatmanur', '12345678fatmanur'))
        self.assertTrue(admin.guessable('neslihan', 'aaaaaaaabbbbbbbb'))
        self.assertFalse(admin.guessable('neslihan', KEY))


if __name__ == '__main__':
    unittest.main()
