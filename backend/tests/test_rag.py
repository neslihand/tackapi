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

    def test_year_must_match_whole_number(self):
        # '828' bağlamdaki '1828' içinde geçiyor ama aynı sayı değil (önceki kontrol bunu desteklenmiş sayıyordu)
        self.assertEqual(rag.verify('Hicri 828 tarihli kitâbe.', 'Bkz. arşiv no 1828.')['unsupported_years'], ['828'])
        self.assertEqual(rag.verify('Hicri 828 tarihli kitâbe.', self.CTX)['unsupported_years'], [])

    def test_durations_are_not_years(self):
        v = rag.verify('Cami yaklaşık 600 yıl önce, 1425 yılında yapıldı. 600 years ago.', self.CTX)
        self.assertEqual(v['unsupported_years'], [])

    def test_name_needs_every_word(self):
        # önceden ilk sözcük ('Sultan') bağlamda geçtiği için desteklenmiş sayılıyordu
        self.assertEqual(rag.verify('yapıyı Sultan Mehmed yaptırdı.', self.CTX)['unsupported_names'],
                         ['Sultan Mehmed'])

    def test_sentence_start_word_is_not_part_of_name(self):
        v = rag.verify('Ayrıca Habib Neccar burada anılır. Kaynaklarımızda Muradiye Camii geçer.', self.CTX)
        self.assertEqual(v['unsupported_names'], ['Habib Neccar'])

    def test_name_with_suffix_and_generic_words(self):
        v = rag.verify("Muradiye Camisi'nin bânîsi Sultan Murad'dır. The Muradiye Mosque is old.", self.CTX)
        self.assertEqual(v['unsupported_names'], [])

    def test_capitalised_first_word_of_sentence(self):
        # cümlenin ilk sözcüğü konumu yüzünden büyük harfli: 'Bugün Muradiye Camii' bir ad değildir
        v = rag.verify('Bugün Muradiye Camii ayakta. Yıllar Sonra Sultan Murad geldi. Osmanlı Devleti büyüdü.',
                       self.CTX + ' Osmanlı')
        self.assertEqual(v['unsupported_names'], [])
        # ama cümle başındaki uydurma ad yakalanır: 'Mehmed Paşa' → kalan 'Paşa' yalnızca unvan
        self.assertEqual(rag.verify('Mehmed Paşa camiyi onardı.', self.CTX)['unsupported_names'], ['Mehmed Paşa'])
        self.assertEqual(rag.verify('Bugün Mehmed Paşa geldi.', self.CTX)['unsupported_names'], ['Mehmed Paşa'])

    def test_historical_only_for_stories(self):
        text = ('Hani Lego parçaları var ya? Küçük Ayşe Hanım ile Can Bey camiye geldi. '
                'Yapıyı Sultan Mehmed yaptırmış. Mimar Sinan da çalışmış.')
        v = rag.verify(text, self.CTX, historical_only=True)
        # kurgusal karakterler ve benzetmeler serbest; unvan taşıyan tarihî görünümlü adlar denetlenir
        self.assertEqual(v['unsupported_names'], ['Can Bey', 'Mimar Sinan', 'Sultan Mehmed'])
        self.assertIn('Lego', rag.verify(text, self.CTX)['unsupported_names'])   # sohbette her ad denetlenir


if __name__ == '__main__':
    unittest.main()
