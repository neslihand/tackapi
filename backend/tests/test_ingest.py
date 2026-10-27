"""ingest.py: bir kitabı yedekleyerek kaldırma ve yedekten geri ekleme; diğer kitaplara dokunmama."""
import io, os, sys, json, shutil, tempfile, unittest
from contextlib import redirect_stdout
from unittest import mock
from _testdb import needs_db, fresh_db, ADMINS, DSN

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
KONYA = 'konya-meram-ornek-camii'


@needs_db
class IngestTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api, ingest
        cls.api, cls.I, cls.c = api, ingest, TestClient(api.app)
        db = api.db
        q = lambda sql, **p: db.query(sql, p)
        mid = q('SELECT id FROM monument WHERE slug = %(s)s', s=CAMI)[0]['id']
        kid = q('SELECT id FROM monument WHERE slug = %(s)s', s=KONYA)[0]['id']
        chunk = q('SELECT min(c.id) AS c FROM chunk c JOIN source_book b ON b.id = c.book_id WHERE b.slug = %(b)s', b='bursa-1')[0]['c']
        # panel emeği ve çıkarım: pilot, konum, anlatım, paragraf kararı, rota, soru, kişiler (biri iki kitapta ortak)
        db.execute("UPDATE monument SET pilot = true, lat = 40.19, lon = 29.04, geo_source = 'manual', geo_precision = 'exact', geo_checked = true, summary_tr = 'Panelde düzeltilen özet' WHERE id = %(m)s", dict(m=mid))
        db.execute("INSERT INTO narration(monument_id, mode, lang, answer) VALUES (%(m)s, 'story', 'tr', 'Kayıtlı hikâye.')", dict(m=mid))
        db.execute("INSERT INTO para_fix(monument_id, para_no, decision, source) VALUES (%(m)s, 1, 'keep', 'admin')", dict(m=mid))
        rid = q("INSERT INTO route(slug, title, published) VALUES ('karma', 'Karma rota', true) RETURNING id")[0]['id']
        db.execute('INSERT INTO route_stop(route_id, monument_id, sort) VALUES (%(r)s, %(m)s, 0), (%(r)s, %(k)s, 1)', dict(r=rid, m=mid, k=kid))
        db.execute("""INSERT INTO quiz_question(monument_id, question, options, answer, explanation, published)
                      VALUES (%(m)s, 'Hangi şehirde?', ARRAY['Bursa','Konya','Hatay','Edirne'], 0, 'Bursa.', true)""", dict(m=mid))
        db.execute("INSERT INTO person(slug, name) VALUES ('ortak', 'Ortak Usta'), ('yalniz', 'Yalnız Bânî')")
        db.execute("""INSERT INTO monument_person(monument_id, person_id, role, chunk_id)
                      SELECT %(m)s, id, 'architect', %(c)s FROM person WHERE slug = 'ortak'
                      UNION ALL SELECT %(k)s, id, 'architect', NULL FROM person WHERE slug = 'ortak'
                      UNION ALL SELECT %(m)s, id, 'patron', NULL FROM person WHERE slug = 'yalniz'""", dict(m=mid, k=kid, c=chunk))
        db.execute("INSERT INTO event(monument_id, city_id, kind, description_tr, chunk_id) VALUES (%(m)s, 1, 'construction', 'Yapım', %(c)s)", dict(m=mid, c=chunk))
        # başka kayıtlardan kitaba bağlantılar: panelden eklenmiş eserin üst eseri ve sözlük teriminin parçası
        db.execute("""INSERT INTO monument(slug, city_id, kind, name_tr, parent_id, review_status)
                      VALUES ('panel-alt-yapi', 1, 'fountain', 'Panel Çeşmesi', %(m)s, 'published')""", dict(m=mid))
        db.execute("INSERT INTO term(term_tr, term_en, definition_tr, chunk_id) VALUES ('deneme terim', 'test term', 'Tanım.', %(c)s)", dict(c=chunk))
        cls.dir = tempfile.mkdtemp(prefix='vakif_backup_')

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir, True)

    def q(self, sql, **p):
        return self.api.db.query(sql, p)

    def run_cmd(self, *args):
        out = io.StringIO()
        with mock.patch.object(sys, 'argv', ['ingest.py', '--dsn', DSN, '--backup-dir', self.dir, *args]), redirect_stdout(out):
            self.I.main()
        return out.getvalue()

    def site(self):
        """Sitenin gösterdiği her şey: liste, eser sayfaları, rotalar, sorular."""
        items = self.c.get('/api/monuments', params={'page_size': 200}).json()['items']
        return dict(items=items, details={i['slug']: self.c.get(f"/api/monuments/{i['slug']}").json() for i in items},
                    routes=self.c.get('/api/routes').json(), quiz=self.c.get('/api/quiz').json(),
                    panel=self.c.get('/api/admin/monuments/panel-alt-yapi', headers=NES).json()['parent'])

    def test_rehearsal_changes_nothing(self):
        before = self.site()
        prints = lambda: {t: self.q(f'SELECT count(*) AS n FROM {t}')[0]['n'] for t in ('monument', 'chunk', 'person', 'image', 'route_stop')}
        counts = prints()
        out = self.run_cmd('--rehearse', 'bursa-1')
        self.assertIn('PROVA BAŞARILI', out)
        self.assertIn('İşlem geri alındı', out)
        self.assertEqual(prints(), counts)
        self.assertEqual(self.site(), before)
        self.assertEqual(os.listdir(self.dir), [])          # prova kalıcı yedek bırakmaz

    def test_remove_then_add_restores_everything(self):
        before = self.site()
        konya_before = {k: v for k, v in before['details'].items() if k.startswith('konya')}
        counts = {t: self.q(f'SELECT count(*) AS n FROM {t}')[0]['n'] for t in ('monument', 'chunk', 'person', 'narration', 'para_fix', 'term')}

        out = self.run_cmd('--remove-book', 'bursa-1')                        # yalnızca sayar
        self.assertIn('Hiçbir şey değişmedi', out)
        self.assertEqual(self.q('SELECT count(*) AS n FROM monument')[0]['n'], counts['monument'])

        out = self.run_cmd('--remove-book', 'bursa-1', '--yes')
        self.assertIn('Yedek:', out)
        self.assertEqual(self.q("SELECT count(*) AS n FROM source_book WHERE slug = 'bursa-1'")[0]['n'], 0)
        after = self.site()
        # kitabın eserleri gider; panelden eklenmiş (kitap dışı) Bursa eseri kalır
        self.assertEqual({i['slug'] for i in after['items'] if i['city']['slug'] == 'bursa'}, {'panel-alt-yapi'})
        self.assertEqual({k: v for k, v in after['details'].items() if k.startswith('konya')}, konya_before)   # Konya'ya dokunulmadı
        names = {r['slug'] for r in self.q('SELECT slug FROM person')}
        self.assertIn('ortak', names)                     # Konya'da da geçen kişi kalır
        self.assertNotIn('yalniz', names)                 # yalnızca Bursa'da geçen kişi gider
        self.assertIsNone(self.q("SELECT parent_id FROM monument WHERE slug = 'panel-alt-yapi'")[0]['parent_id'])
        self.assertIsNone(self.q("SELECT chunk_id FROM term WHERE term_tr = 'deneme terim'")[0]['chunk_id'])
        self.assertEqual([r['monument_id'] for r in self.q('SELECT monument_id FROM route_stop')],
                         [self.q('SELECT id FROM monument WHERE slug = %(s)s', s=KONYA)[0]['id']])

        with self.assertRaises(SystemExit):
            self.run_cmd('--remove-book', 'bursa-1', '--yes')                # artık yok

        out = self.run_cmd('--add-book', 'bursa-1')
        self.assertIn('Gemini çağrısı yok', out)
        self.assertEqual(self.site(), before)                                  # site birebir eski haline döner
        self.assertEqual({t: self.q(f'SELECT count(*) AS n FROM {t}')[0]['n'] for t in counts}, counts)
        self.assertIsNotNone(self.q("SELECT chunk_id FROM term WHERE term_tr = 'deneme terim'")[0]['chunk_id'])
        emb = self.q("SELECT count(*) AS n FROM chunk c JOIN source_book b ON b.id = c.book_id WHERE b.slug = 'bursa-1' AND c.embedding IS NOT NULL")[0]['n']
        self.assertGreater(emb, 0)                                              # embedding'ler de geri geldi

        with self.assertRaises(SystemExit):
            self.run_cmd('--add-book', 'bursa-1')                              # zaten var
        self.assertIn('bursa-1', self.run_cmd('--status'))


if __name__ == '__main__':
    unittest.main()
