"""rag.py: önbellek davranışı (test veritabanı) ve doğrulama (veritabanısız)."""
import unittest
from unittest import mock
from _testdb import needs_db, fresh_db
import gemini_client as G
import rag

SLUG = 'bursa-osmangazi-muradiye-camii'


@needs_db
class CacheTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from db import DB
        cls.db = DB()

    def setUp(self):
        self.db.execute('DROP TABLE IF EXISTS answer_cache')
        rag._cache_ready = False
        # gerçek Gemini yerine sahte embedding + verilen cevap; önbellek yalnızca FAKE kapalıyken yazılır
        self.patches = [mock.patch.object(G, 'FAKE', False),
                        mock.patch.object(G, 'embed_query', side_effect=lambda q, **k: G._fake_vec(q, G.EMBED_DIM))]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def ask(self, answer_text, question='Bu cami ne zaman yapıldı?'):
        with mock.patch.object(G, 'generate', return_value=answer_text) as gen:
            r = rag.answer(self.db, question, SLUG)
        return r, gen.call_count

    def cached_rows(self):
        return self.db.query('SELECT count(*) AS n FROM answer_cache')[0]['n']

    def test_clean_answer_is_cached_and_reused(self):
        r, calls = self.ask('Kitâbesine göre yapımı 1426 yılında tamamlanmıştır [S1].')
        self.assertEqual((r['cached'], calls, self.cached_rows()), (False, 1, 1))
        r, calls = self.ask('kullanılmamalı')
        self.assertEqual((r['cached'], calls), (True, 0))

    def test_unsupported_name_not_cached(self):
        r, _ = self.ask('Caminin mimarı Mimar Sinan Ağa olarak bilinir [S1].')
        self.assertTrue(r['verification']['unsupported_names'])
        self.assertEqual(self.cached_rows(), 0)

    def test_unsupported_year_retried_and_not_cached(self):
        r, calls = self.ask('Cami 1550 yılında yapıldı [S1].')
        self.assertEqual(calls, 2)                       # bir kez yeniden üretildi
        self.assertEqual(r['verification']['unsupported_years'], ['1550'])
        self.assertEqual(self.cached_rows(), 0)

    def test_history_bypasses_cache(self):
        self.ask('Kitâbesine göre yapımı 1426 yılında tamamlanmıştır [S1].')
        with mock.patch.object(G, 'generate', return_value='Devam cevabı [S1].') as gen:
            r = rag.answer(self.db, 'Bu cami ne zaman yapıldı?', SLUG, history=[{'role': 'user', 'content': 'Merhaba'}])
        self.assertEqual((r['cached'], gen.call_count), (False, 1))


class VerifyTest(unittest.TestCase):
    CTX = '[F0] ESER KARTI: Muradiye Camii — inşa yılları: 1425-1426. Sultan II. Murad yaptırmıştır. Hicri 828.'

    def test_supported(self):
        v = rag.verify('Muradiye Camii 1425 yılında Sultan II. Murad tarafından yaptırıldı.', self.CTX)
        self.assertEqual(v, dict(unsupported_years=[], unsupported_names=[]))

    def test_unsupported_year(self):
        self.assertEqual(rag.verify('Cami 1453 yılında onarıldı.', self.CTX)['unsupported_years'], ['1453'])


if __name__ == '__main__':
    unittest.main()
