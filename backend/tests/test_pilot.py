"""MVP pilot seçkisi: pilot.py (öneri, ekle/çıkar, durum), --pilot kapsamı ve panel uçları."""
import io, os, sys, tempfile, unittest
from contextlib import redirect_stdout
from unittest import mock
from _testdb import needs_db, fresh_db, MEDIA, ADMINS

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
TURBE = 'bursa-yildirim-ornek-turbesi'


def run(module, *args):
    out = io.StringIO()
    with mock.patch.object(sys, 'argv', [module.__name__ + '.py', *args]), redirect_stdout(out):
        module.main()
    return out.getvalue()


@needs_db
class PilotTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        from PIL import Image
        import api, pilot, visual_search, narrations
        cls.api, cls.P, cls.VS, cls.N = api, pilot, visual_search, narrations
        cls.c = TestClient(api.app)
        for sha, file in ((r['sha1'], r['file']) for r in api.db.query('SELECT sha1, file FROM image')):
            path = os.path.join(MEDIA, file)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            Image.new('RGB', (400, 300), (len(sha) * 40 % 255, 90, 120)).save(path, 'WEBP')
        api.db.execute("""INSERT INTO image(monument_id, city_id, book_id, source, sha1, file, review_status)
                          VALUES (4, 1, 1, 'book', 't1', 'books/bursa-1/019-a1.webp', 'published')""")

    def setUp(self):
        self.api.db.execute('UPDATE monument SET pilot = false')
        self.api.db.execute('UPDATE image SET embedding = NULL, embedding_model = NULL')

    def q(self, sql, **p):
        return self.api.db.query(sql, p)

    def test_add_remove_file_and_log(self):
        out = run(self.P, '--add', CAMI, 'yok-boyle')
        self.assertIn('1 eser pilota eklendi', out)
        self.assertIn('yok-boyle', out)
        self.assertEqual([r['slug'] for r in self.q('SELECT slug FROM monument WHERE pilot')], [CAMI])
        with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8') as fh:
            fh.write(f'# Bursa seçkisi\n{TURBE}  # türbe\n\n{CAMI}\n')
        try:
            self.assertIn('1 eser pilota eklendi', run(self.P, '--file', fh.name))   # cami zaten pilotta
        finally:
            os.unlink(fh.name)
        run(self.P, '--remove', CAMI)
        self.assertEqual([r['slug'] for r in self.q('SELECT slug FROM monument WHERE pilot')], [TURBE])
        self.assertGreaterEqual(self.q("SELECT count(*) AS n FROM admin_log WHERE action = 'monument.pilot'")[0]['n'], 3)

    def test_suggest_writes_ranked_csv(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(self.P, 'ROOT', tmp):
            out = run(self.P, '--suggest', '--targets', 'bursa=2')
            with open(os.path.join(tmp, 'data', 'review', 'pilot_onerileri.csv'), encoding='utf-8-sig') as fh:
                lines = fh.read().splitlines()
        self.assertTrue(lines[0].startswith('sehir;sira;slug'))
        self.assertEqual(lines[1].split(';')[2], CAMI)          # fotoğrafı, tarihi ve özeti olan cami başta
        self.assertNotIn('bursa-osmangazi-taslak-cesme', '\n'.join(lines))   # taslak eser önerilmez
        self.assertIn('BURSA', out)

    def test_status(self):
        run(self.P, '--add', CAMI)
        out = run(self.P, '--status', '--targets', 'bursa=30,konya=20')
        self.assertIn('bursa      1 / 30  (eksik)', out)
        self.assertIn('Muradiye Camii', out)
        self.assertIn('python visual_search.py --pilot', out)

    def test_visual_search_pilot_scope(self):
        run(self.P, '--add', TURBE)
        self.assertEqual(self.VS.embed_pending(self.api.db, pilot=True), 1)          # yalnızca türbenin fotoğrafı
        rows = self.q('SELECT sha1 FROM image WHERE embedding IS NOT NULL')
        self.assertEqual([r['sha1'] for r in rows], ['t1'])
        self.assertIn('kalan 0 (pilot eserlerde)', run(self.VS, '--pilot'))

    def test_scripts_refuse_without_pilot(self):
        with self.assertRaises(SystemExit):
            run(self.VS, '--pilot')
        with self.assertRaises(SystemExit):
            run(self.N, '--pilot')

    def test_narrations_pilot_scope(self):
        run(self.P, '--add', CAMI)
        self.api.db.execute('DELETE FROM narration')
        run(self.N, '--pilot')
        self.assertEqual({r['slug'] for r in self.q('SELECT DISTINCT m.slug FROM narration n JOIN monument m ON m.id = n.monument_id')},
                         {CAMI})

    def test_panel_toggle_filter_and_stats(self):
        r = self.c.patch(f'/api/admin/monuments/{CAMI}', json={'pilot': True}, headers=NES)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(self.c.get(f'/api/admin/monuments/{CAMI}', headers=NES).json()['pilot'])
        items = self.c.get('/api/admin/monuments?pilot=true', headers=NES).json()['items']
        self.assertEqual([i['slug'] for i in items], [CAMI])
        self.assertTrue(items[0]['pilot'])
        others = self.c.get('/api/admin/monuments?pilot=false', headers=NES).json()['items']
        self.assertNotIn(CAMI, [i['slug'] for i in others])
        stats = {p['city']: p for p in self.c.get('/api/admin/stats', headers=NES).json()['pilot']}
        self.assertEqual((stats['bursa']['n'], stats['bursa']['target']), (1, 30))
        log = self.q("SELECT detail FROM admin_log WHERE action = 'monument.update' ORDER BY id DESC LIMIT 1")[0]['detail']
        self.assertEqual(log['pilot'], [False, True])


if __name__ == '__main__':
    unittest.main()
