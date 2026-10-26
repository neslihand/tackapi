"""Kayıtlı anlatımlar (narration): üretim, eser sayfasında gösterim, eskime ve toplu üretim betiği."""
import sys, unittest
from unittest import mock
from _testdb import needs_db, fresh_db, ADMINS

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
URL = f'/api/admin/monuments/{CAMI}/narrations'


@needs_db
class NarrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api, narrations, gemini_client
        cls.api, cls.N, cls.G = api, narrations, gemini_client
        cls.c = TestClient(api.app)

    def setUp(self):
        self.api.db.execute('DELETE FROM narration')

    def q(self, sql, **p):
        return self.api.db.query(sql, p)

    def detail(self, lang='tr'):
        r = self.c.get(f'/api/monuments/{CAMI}?lang={lang}')
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def test_page_shows_stored_narrations_without_calling_llm(self):
        self.assertEqual(self.detail()['narrations'], {'story': None, 'child': None})
        r = self.c.post(URL, json={'mode': 'story'}, headers=NES)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn('SAHTE CEVAP', r.json()['answer'])
        # sayfa açılırken yapay zekâ çağrılmaz: Gemini bozuk olsa da kayıtlı anlatım gelir
        with mock.patch.object(self.G, 'generate', side_effect=AssertionError('LLM çağrılmamalı')):
            d = self.detail()
        story = d['narrations']['story']
        self.assertIn('SAHTE CEVAP', story['answer'])
        self.assertTrue(story['sources'])
        self.assertEqual(set(story['sources'][0]), {'book', 'pages', 'heading'})   # iç bilgi (chunk_id, rota) yok
        self.assertNotRegex(story['answer'], r'\[|\*')                                 # kaynak işareti ve markdown yok
        self.assertIsNone(d['narrations']['child'])
        self.assertIsNone(self.detail('en')['narrations']['story'])                        # dil başına ayrı kayıt

    def test_clean_narration(self):
        clean = self.api.rag.clean_narration
        raw = ("Cami, Sultan II. Murad tarafından yaptırılmıştır F0F10. Haremin (kutsal yer) T serinliği S2T.\n\n"
               "**Hikâye:**\n\n* Taşlar [S1, F2] fısıldıyordu [S3].\n\n# Son\n\n"
               "— **Hikâyedeki tarihî bilgiler:** * 1425 yılında başlandı F1.")
        out = clean(raw)
        self.assertEqual(out, "Cami, Sultan II. Murad tarafından yaptırılmıştır. Haremin (kutsal yer) serinliği.\n\n"
                              "Taşlar fısıldıyordu.\n\nSon")
        # olağan metne dokunmaz: yıllar, 'T.C.', Roma rakamlı adlar, sayılar
        normal = "T.C. Vakıflar Genel Müdürlüğü 2012 yılında onardı. II. Murad ve S. Ahmet Efendi 3 kubbe yaptı."
        self.assertEqual(clean(normal), normal)

    def test_regenerate_replaces_and_logs(self):
        for _ in range(2):
            self.assertEqual(self.c.post(URL, json={'mode': 'child', 'lang': 'en'}, headers=NES).status_code, 200)
        rows = self.q("SELECT generated_by, model FROM narration WHERE mode = 'child' AND lang = 'en'")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['generated_by'], 'neslihan')
        self.assertTrue(rows[0]['model'].endswith('-FAKE'))
        self.assertGreaterEqual(self.q("SELECT count(*) AS n FROM admin_log WHERE action = 'narration.generate'")[0]['n'], 2)

    def test_manual_edit(self):
        edit_url = URL + '/story'
        text = 'Bursa’nın yeşil tepelerinde bir sabah, genç çırak taşların arasında yürüyordu. Düzeltilmiş metin. **Kalın**'
        self.assertEqual(self.c.put(edit_url, json={'answer': text}, headers=NES).status_code, 404)     # henüz anlatım yok
        self.c.post(URL, json={'mode': 'story'}, headers=NES)
        with mock.patch.object(self.G, 'generate', side_effect=AssertionError('LLM çağrılmamalı')):
            r = self.c.put(edit_url, json={'answer': text}, headers=NES)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotIn('*', r.json()['answer'])                                  # aynı temizlikten geçer
        self.assertEqual(self.detail()['narrations']['story']['answer'], r.json()['answer'])
        st = self.c.get(f'/api/admin/preview/{CAMI}', headers=NES).json()['narrations']
        self.assertEqual(next(n for n in st if n['mode'] == 'story')['edited_by'], 'neslihan')
        log = self.q("SELECT detail FROM admin_log WHERE action = 'narration.edit' ORDER BY id DESC LIMIT 1")[0]['detail']
        self.assertIn('SAHTE CEVAP', log['answer'][0])                            # eski metin denetim kaydında
        # doğrulama
        self.assertEqual(self.c.put(edit_url, json={'answer': 'kısa'}, headers=NES).status_code, 422)
        self.assertEqual(self.c.put(URL + '/standard', json={'answer': text}, headers=NES).status_code, 422)
        self.assertEqual(self.c.put(edit_url, json={'answer': text}).status_code, 401)
        # toplu üretim elle düzeltilmiş anlatımı --force ile de ezmez; --include-edited ezer
        def run(*args):
            with mock.patch.object(sys, 'argv', ['narrations.py', '--only', CAMI, '--modes', 'story', *args]):
                self.N.main()
        run('--force')
        self.assertEqual(self.detail()['narrations']['story']['answer'], r.json()['answer'])
        run('--force', '--include-edited')
        self.assertIn('SAHTE CEVAP', self.detail()['narrations']['story']['answer'])
        self.assertIsNone(self.q("SELECT edited_by FROM narration WHERE mode = 'story'")[0]['edited_by'])

    def test_validation_auth_and_errors(self):
        self.assertEqual(self.c.post(URL, json={'mode': 'story'}).status_code, 401)
        for bad in ({'mode': 'standard'}, {'mode': 'story', 'lang': 'de'}, {}, {'mode': 'story', 'x': 1}):
            self.assertEqual(self.c.post(URL, json=bad, headers=NES).status_code, 422, bad)
        r = self.c.post('/api/admin/monuments/yok-boyle/narrations', json={'mode': 'story'}, headers=NES)
        self.assertEqual(r.status_code, 404)
        with mock.patch.object(self.G, 'generate', side_effect=self.G.LLMError('429 RESOURCE_EXHAUSTED')):
            r = self.c.post(URL, json={'mode': 'story'}, headers=NES)
        self.assertEqual(r.status_code, 503)
        self.assertIn('kota', r.json()['detail'])
        self.assertEqual(self.q('SELECT count(*) AS n FROM narration')[0]['n'], 0)

    def test_stored_name_warnings_are_refiltered(self):
        self.c.post(URL, json={'mode': 'child'}, headers=NES)
        # eski kurallarla kaydedilmiş yanlış alarmlar elenir, gerçek şüpheli ad kalır
        self.api.db.execute("""UPDATE narration SET verification = '{"unsupported_years": ["1999"],
            "unsupported_names": ["Hani Lego", "Bugün Muradiye Camii", "Osmanlı Devleti", "Sultan Mehmed"]}'::jsonb""")
        st = self.c.get(f'/api/admin/preview/{CAMI}', headers=NES).json()['narrations']
        self.assertEqual(st[0]['unsupported'], ['1999', 'Sultan Mehmed'])

    def test_preview_reports_missing_and_stale(self):
        def preview():
            p = self.c.get(f'/api/admin/preview/{CAMI}', headers=NES).json()
            return {c['key']: c for c in p['checks']}['narrations']['ok'], p['narrations']
        self.assertEqual(preview(), (False, []))
        self.c.post(URL, json={'mode': 'story'}, headers=NES)
        self.c.post(URL, json={'mode': 'child'}, headers=NES)
        ok, st = preview()
        self.assertTrue(ok)
        self.assertEqual({(n['mode'], n['lang'], n['stale']) for n in st}, {('story', 'tr', False), ('child', 'tr', False)})
        # metin değişince anlatım silinmez, "eskimiş" görünür
        self.api.db.execute("UPDATE narration SET text_hash = 'eski' WHERE mode = 'story'")
        self.assertTrue(next(n for n in preview()[1] if n['mode'] == 'story')['stale'])

    def test_batch_script_resumes(self):
        def run(*args):
            with mock.patch.object(sys, 'argv', ['narrations.py', '--only', CAMI, *args]):
                self.N.main()
        run('--lang', 'tr,en')
        self.assertEqual(self.q('SELECT count(*) AS n FROM narration')[0]['n'], 4)   # 2 mod × 2 dil
        before = self.q('SELECT max(generated_at) AS t FROM narration')[0]['t']
        run('--lang', 'tr,en')                                                         # eksik yok: hiçbir şey üretilmez
        self.assertEqual(self.q('SELECT max(generated_at) AS t FROM narration')[0]['t'], before)
        self.api.db.execute("UPDATE narration SET text_hash = 'eski' WHERE mode = 'child' AND lang = 'tr'")
        run('--stale')                                                                 # yalnızca eskimiş olan yenilenir
        rows = self.q("SELECT mode, lang FROM narration WHERE generated_at > %(t)s", t=before)
        self.assertEqual([(r['mode'], r['lang']) for r in rows], [('child', 'tr')])
        # taslak eser toplu üretime girmez
        run_draft = self.q("SELECT count(*) AS n FROM narration n JOIN monument m ON m.id = n.monument_id "
                           "WHERE m.review_status <> 'published'")[0]['n']
        self.assertEqual(run_draft, 0)


if __name__ == '__main__':
    unittest.main()
