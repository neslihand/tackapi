"""Bilgi yarışması soruları (panelde yazılır, GET /api/quiz) ve tek adresten site sunumu."""
import unittest
from _testdb import needs_db, fresh_db, ADMINS
import quiz as Q

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
TASLAK = 'bursa-osmangazi-taslak-cesme'
GOOD = dict(question='Muradiye Camii hangi şehirdedir?', options=['Bursa', 'Konya', 'Hatay', 'Edirne'], answer=0,
            explanation='Kitaba göre cami Bursa’nın Osmangazi ilçesindedir.')


class IssuesTest(unittest.TestCase):
    def test_same_rules_as_the_site(self):
        self.assertEqual(Q.issues(**GOOD), [])
        self.assertTrue(Q.issues(**dict(GOOD, options=['Bursa', 'bursa ', 'Hatay', 'Edirne'])))   # aynı seçenek
        self.assertTrue(Q.issues(**dict(GOOD, options=['Bursa', '', 'Hatay', 'Edirne'])))
        self.assertTrue(Q.issues(**dict(GOOD, answer=4)))
        self.assertTrue(Q.issues(**dict(GOOD, explanation=' ')))
        self.assertTrue(Q.issues(**dict(GOOD, question='a' * 241)))


@needs_db
class QuizApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.c = api, TestClient(api.app)

    def setUp(self):
        self.api.db.execute('DELETE FROM quiz_question')
        self.api.db.execute("UPDATE monument SET pilot = slug = ANY(%(p)s::text[])", dict(p=[CAMI, TASLAK]))

    def test_write_publish_edit_delete(self):
        r = self.c.post('/api/admin/quiz', headers=NES, json=dict(GOOD, monument=CAMI))
        self.assertEqual(r.status_code, 201, r.text)
        qid = r.json()['id']
        self.assertEqual(self.c.get('/api/quiz').json(), [])                     # yayımlanmadan görünmez
        self.c.patch(f'/api/admin/quiz/{qid}', headers=NES, json={'published': True})
        site = self.c.get('/api/quiz', params={'pilot': 'true'}).json()
        self.assertEqual(site, [dict(id=f'soru-{qid}', artifactId=CAMI, **GOOD)])
        bad = self.c.patch(f'/api/admin/quiz/{qid}', headers=NES, json={'options': ['A', 'A', 'B', 'C']})
        self.assertEqual(bad.status_code, 422)
        r = self.c.patch(f'/api/admin/quiz/{qid}', headers=NES, json={'answer': 1, 'options': ['Konya', 'Bursa', 'Hatay', 'Edirne']})
        self.assertEqual((r.json()['answer'], r.json()['options'][1]), (1, 'Bursa'))
        listed = self.c.get('/api/admin/quiz', headers=NES, params={'monument': CAMI}).json()
        self.assertEqual([q['id'] for q in listed['questions']], [qid])
        self.assertEqual(self.c.delete(f'/api/admin/quiz/{qid}', headers=NES).status_code, 204)
        self.assertGreaterEqual(self.api.db.query("SELECT count(*) AS n FROM admin_log WHERE action LIKE 'quiz.%%'")[0]['n'], 3)

    def test_questions_of_unpublished_monuments_are_hidden(self):
        qid = self.c.post('/api/admin/quiz', headers=NES, json=dict(GOOD, monument=TASLAK, published=True)).json()['id']
        self.assertNotIn(f'soru-{qid}', [q['id'] for q in self.c.get('/api/quiz').json()])
        self.assertEqual(self.c.post('/api/admin/quiz', headers=NES, json=dict(GOOD, monument='yok-boyle')).status_code, 422)

    def test_site_and_panel_mounts_come_after_the_api(self):
        # Yeni FastAPI sürümlerinde include_router'ın eklediği nesnelerin 'path' alanı yok; '' sitenin mount yoluyla karışmasın.
        paths = [getattr(r, 'path', None) for r in self.api.app.routes]
        for mount, folder in (('', self.api.SITE_DIR), ('/yonetim', self.api.PANEL_DIR), ('/yazar', self.api.AUTHOR_DIR)):
            if folder:
                self.assertGreater(paths.index(mount), paths.index('/api/quiz'))
        if self.api.SITE_DIR:
            self.assertIn('text/html', self.c.get('/').headers['content-type'])
        # panelin eski adresi yenisine, sonda '/' olmayan panel adresi '/'li hâline gider
        self.assertEqual(self.c.get('/panel/', follow_redirects=False).headers['location'], '/yonetim/')
        self.assertEqual(self.c.get('/yonetim', follow_redirects=False).headers['location'], '/yonetim/')
        self.assertEqual(self.c.get('/yazar', follow_redirects=False).headers['location'], '/yazar/')
        self.assertEqual(self.c.get('/api/cities').headers['content-type'], 'application/json')

    def test_built_files_cache_by_name_and_responses_are_compressed(self):
        import os, tempfile
        from fastapi.testclient import TestClient
        from starlette.applications import Starlette
        from starlette.routing import Mount
        with tempfile.TemporaryDirectory() as site:
            os.makedirs(os.path.join(site, 'assets'))
            for name in ('index.html', 'favicon.svg', os.path.join('assets', 'index-ECxR6Jdm.js')):
                with open(os.path.join(site, name), 'w') as fh:
                    fh.write('x')
            c = TestClient(Starlette(routes=[Mount('/', self.api.AppFiles(directory=site, html=True))]))
            self.assertIn('immutable', c.get('/assets/index-ECxR6Jdm.js').headers['cache-control'])  # adı içerikle değişir
            self.assertEqual(c.get('/').headers['cache-control'], 'no-cache')                        # yeni sürüm hemen görülür
            self.assertEqual(c.get('/favicon.svg').headers['cache-control'], 'no-cache')
        self.assertEqual(self.c.get('/api/monuments').headers.get('content-encoding'), 'gzip')
        self.assertIsNone(self.c.get('/api/monuments', headers={'Accept-Encoding': 'identity'}).headers.get('content-encoding'))


if __name__ == '__main__':
    unittest.main()
