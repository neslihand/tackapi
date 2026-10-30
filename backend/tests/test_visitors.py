"""Ziyaretçi hesapları, pasaport eşitleme ve davranış olayları (visitors.py, users.py)."""
import uuid, unittest
from _testdb import needs_db, fresh_db, png_header
import users as U
import visitors as V

SID = str(uuid.uuid4())


class PureTest(unittest.TestCase):
    def test_password_hash(self):
        h = U.hash_password('gizli-sifre-1')
        self.assertTrue(h.startswith('scrypt$'))
        self.assertTrue(U.verify_password('gizli-sifre-1', h))
        self.assertFalse(U.verify_password('yanlis', h))
        self.assertFalse(U.verify_password('x', 'bozuk'))
        self.assertNotEqual(U.hash_password('a' * 8), U.hash_password('a' * 8))      # tuz her seferinde farklı

    def test_email(self):
        self.assertEqual(U.normalize_email('  Ali@Ornek.COM '), 'ali@ornek.com')
        self.assertTrue(U.valid_email('ali@ornek.com'))
        self.assertFalse(U.valid_email('ali@ornek'))

    def test_merge_progress_keeps_the_best_of_both(self):
        a = dict(version=1, discovered={'x': '2026-10-01T10:00:00Z', 'y': '2026-10-05T10:00:00Z'}, favorites=['x'],
                 quiz=dict(completed=2, best=60), games=dict(puzzle={'x': {'kolay': 30}}, detective={}), answered=['x'])
        b = dict(version=1, discovered={'y': '2026-10-02T10:00:00Z', 'z': '2026-10-03T10:00:00Z'}, favorites=['z', 'x'],
                 quiz=dict(completed=1, best=80), games=dict(puzzle={'x': {'kolay': 25, 'zor': 90}}, detective={}), answered=[])
        m = U.merge_progress(a, b)
        self.assertEqual(m['discovered'], {'x': '2026-10-01T10:00:00Z', 'y': '2026-10-02T10:00:00Z', 'z': '2026-10-03T10:00:00Z'})
        self.assertEqual(m['favorites'], ['x', 'z'])
        self.assertEqual(m['quiz'], dict(completed=2, best=80))
        self.assertEqual(m['games']['puzzle'], {'x': {'kolay': 25, 'zor': 90}})       # az hamle daha iyi
        self.assertEqual(U.clean_progress({'discovered': {'a': 5}, 'favorites': 'x', 'games': None}), U.empty_progress())

    def test_event_props_are_flattened_and_bounded(self):
        out = V.clean_props({'q': 'x' * 900, 'n': 3, 'nested': {'a': 1}, 'list': ['a', {'b': 1}, 2]})
        self.assertEqual(len(out['q']), 500)
        self.assertNotIn('nested', out)
        self.assertEqual(out['list'], ['a', 2])


@needs_db
class AccountApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.TC = api, TestClient

    def setUp(self):
        for t in ('analytics_event', 'user_session', 'user_progress', 'contribution', 'app_user'):
            self.api.db.execute(f'DELETE FROM {t}')
        self.c = self.TC(self.api.app)
        for lim in self.api.visitor_router.limiters:      # testler aynı IP'den gelir
            lim.hits.clear()

    def q(self, sql, **p):
        return self.api.db.query(sql, p)

    def register(self, **extra):
        body = dict(email='Ali@Ornek.com', password='gizli-sifre-1', consent=True, display_name='Ali', age_range='25-44',
                    purposes=['trip', 'bilinmeyen'], interests=['architecture'])
        body.update(extra)
        return self.c.post('/api/auth/register', json=body)

    def test_register_login_me_logout(self):
        self.assertEqual(self.register(consent=False).status_code, 422)
        self.assertEqual(self.register(email='bozuk').status_code, 422)
        r = self.register(progress={'version': 1, 'discovered': {'bursa-osmangazi-muradiye-camii': '2026-10-01T00:00:00Z'}})
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(r.json()['user']['email'], 'ali@ornek.com')
        self.assertEqual(r.json()['user']['purposes'], ['trip'])                       # bilinmeyen seçenek atılır
        self.assertIn('bursa-osmangazi-muradiye-camii', r.json()['progress']['discovered'])
        row = self.q('SELECT password_hash, consent_version FROM app_user')[0]
        self.assertTrue(row['password_hash'].startswith('scrypt$'))                     # şifre açık saklanmaz
        self.assertEqual(row['consent_version'], U.CONSENT_VERSION)
        self.assertNotIn(self.c.cookies.get(V.COOKIE), [s['token_hash'] for s in self.q('SELECT token_hash FROM user_session')])
        self.assertEqual(self.c.get('/api/me').json()['user']['display_name'], 'Ali')
        self.assertEqual(self.register().status_code, 409)                              # aynı e-posta
        self.assertEqual(self.c.post('/api/auth/logout').status_code, 204)
        self.c.cookies.clear()
        self.assertEqual(self.c.get('/api/me').status_code, 401)
        self.assertEqual(self.c.post('/api/auth/login', json=dict(email='ali@ornek.com', password='yanlis-sifre')).status_code, 401)
        r = self.c.post('/api/auth/login', json=dict(email='ALI@ornek.com', password='gizli-sifre-1',
                                                      progress={'version': 1, 'favorites': ['konya-meram-ornek-camii']}))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(r.json()['progress']['favorites']), {'konya-meram-ornek-camii'})
        self.assertIn('bursa-osmangazi-muradiye-camii', r.json()['progress']['discovered'])   # iki cihaz birleşti

    def test_profile_progress_and_delete(self):
        self.register()
        r = self.c.patch('/api/me', json=dict(home_city='Bursa', interests=['stories', 'kids']))
        self.assertEqual((r.json()['user']['home_city'], r.json()['user']['interests']), ('Bursa', ['stories', 'kids']))
        r = self.c.put('/api/me/progress', json=dict(progress={'version': 1, 'quiz': {'completed': 3, 'best': 75}}))
        self.assertEqual(r.json()['progress']['quiz'], dict(completed=3, best=75))
        self.c.post('/api/events', json=dict(session_id=SID, events=[dict(type='page_view', path='/')]))
        self.assertEqual(self.c.delete('/api/me').status_code, 204)
        u = self.q('SELECT * FROM app_user')[0]
        self.assertEqual((u['email'], u['password_hash'], u['home_city'], u['interests']), (None, None, None, []))
        self.assertIsNotNone(u['deleted_at'])
        self.assertEqual(self.q('SELECT count(*) AS n FROM user_session')[0]['n'], 0)
        self.assertIsNone(self.q('SELECT user_id FROM analytics_event')[0]['user_id'])  # olay kalır, anonim
        self.assertEqual(self.register().status_code, 201)                              # e-posta yeniden kullanılabilir

    def test_events(self):
        r = self.c.post('/api/events', json=dict(session_id=SID, events=[
            dict(type='monument_view', slug='bursa-osmangazi-muradiye-camii', path='/eser/x'),
            dict(type='narration_mode', slug='bursa-osmangazi-muradiye-camii', props={'mode': 'story'}),
            dict(type='bilinmeyen_tur')]))
        self.assertEqual(r.status_code, 204)
        rows = self.q('SELECT type, user_id, props FROM analytics_event ORDER BY id')
        self.assertEqual([x['type'] for x in rows], ['monument_view', 'narration_mode'])  # izin listesi dışı atlanır
        self.assertEqual(rows[1]['props'], {'mode': 'story'})
        self.assertIsNone(rows[0]['user_id'])
        self.assertEqual(self.c.post('/api/events', json=dict(session_id='kotu', events=[dict(type='page_view')])).status_code, 422)
        self.register()
        self.c.post('/api/events', json=dict(session_id=SID, events=[dict(type='stamp', slug='x')]))
        self.assertIsNotNone(self.q("SELECT user_id FROM analytics_event WHERE type = 'stamp'")[0]['user_id'])
        self.assertEqual(len(self.c.get('/api/profile-options').json()['purposes']), len(U.PURPOSES))


if __name__ == '__main__':
    unittest.main()


@needs_db
class ContributionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.TC = api, TestClient

    def setUp(self):
        for t in ('contribution', 'user_session', 'user_progress', 'app_user'):
            self.api.db.execute(f'DELETE FROM {t}')
        for lim in self.api.visitor_router.limiters:
            lim.hits.clear()
        self.c = self.TC(self.api.app)

    def photo(self):
        import io
        from PIL import Image
        im = Image.new('RGB', (900, 600), (120, 90, 60))
        exif = Image.Exif()
        exif[0x010F] = 'TelefonMarkasi'          # Make
        exif[0x8825] = {2: (40.0, 11.0, 0.0)}   # GPS
        buf = io.BytesIO()
        im.save(buf, 'JPEG', exif=exif)
        return buf.getvalue()

    def test_flow(self):
        import os
        from _testdb import MEDIA, ADMINS
        nes = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
        slug = 'bursa-osmangazi-muradiye-camii'
        url = f'/api/monuments/{slug}/contributions'
        self.assertEqual(self.c.post(url, data=dict(kind='text', text_kind='memory', body='x' * 30)).status_code, 401)
        self.c.post('/api/auth/register', json=dict(email='ayse@ornek.com', password='gizli-sifre-1', consent=True, display_name='Ayşe'))
        self.assertEqual(self.c.post(url, data=dict(kind='text', text_kind='memory', body='kısa')).status_code, 422)
        t = self.c.post(url, data=dict(kind='text', text_kind='memory', body='Çocukken bayram namazlarına buraya gelirdik.'))
        self.assertEqual(t.status_code, 201, t.text)
        self.assertEqual((t.json()['status'], t.json()['text_kind_label']), ('pending', 'Anı'))
        p = self.c.post(url, data=dict(kind='photo', body='Avludan görünüm'), files={'file': ('a.jpg', self.photo(), 'image/jpeg')})
        self.assertEqual(p.status_code, 201, p.text)
        rel = p.json()['image']['src'].removeprefix('/media/')
        from PIL import Image
        with Image.open(os.path.join(MEDIA, rel)) as saved:
            self.assertEqual(saved.format, 'WEBP')
            self.assertFalse(saved.getexif())                        # konum ve cihaz bilgisi silindi
        self.assertEqual(self.c.post(url, data=dict(kind='photo'), files={'file': ('a.txt', b'metin', 'text/plain')}).status_code, 415)
        self.assertEqual(self.c.post(url, data=dict(kind='photo'), files={'file': ('dev.png', png_header(12000), 'image/png')}).status_code, 413)
        self.assertEqual(self.c.post(url, data=dict(kind='photo'), files={'file': ('bos.png', png_header(300), 'image/png')}).status_code, 415)
        self.assertEqual(self.c.get(url).json(), [])                 # onaydan önce görünmez
        queue = self.c.get('/api/admin/contributions', headers=nes).json()
        self.assertEqual(queue['total'], 2)
        self.assertEqual(self.c.patch(f"/api/admin/contributions/{t.json()['id']}", headers=nes, json={'status': 'rejected'}).status_code, 422)
        self.c.patch(f"/api/admin/contributions/{t.json()['id']}", headers=nes, json={'status': 'rejected', 'reject_reason': 'Kaynak belirtilmemiş.'})
        self.c.patch(f"/api/admin/contributions/{p.json()['id']}", headers=nes, json={'status': 'approved'})
        public = self.c.get(url).json()
        self.assertEqual([(x['kind'], x['author']) for x in public], [('photo', 'Ayşe')])
        mine = {x['kind']: x for x in self.c.get('/api/me/contributions').json()}
        self.assertEqual((mine['text']['status'], mine['text']['reject_reason']), ('rejected', 'Kaynak belirtilmemiş.'))
        self.assertEqual(self.c.get('/api/admin/stats', headers=nes).json()['contributions_pending'], 0)
        d = self.c.delete('/api/me')
        self.assertEqual(d.status_code, 204, d.text)
        self.assertFalse(os.path.exists(os.path.join(MEDIA, rel)))   # hesap silinince fotoğraf da gider
        self.assertEqual(self.c.get(url).json(), [])
