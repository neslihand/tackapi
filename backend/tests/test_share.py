"""Paylaşım sayfası: uygulamasız açılır, yalnızca yayındaki eseri gösterir, gizli veri ve fotoğraf taşımaz."""
import unittest
from _testdb import needs_db, fresh_db
import share

CAMI = 'bursa-osmangazi-muradiye-camii'
TASLAK = 'bursa-osmangazi-taslak-cesme'


class FirstSentenceTest(unittest.TestCase):
    def test_stops_at_the_first_real_sentence(self):
        self.assertEqual(share.first_sentence('Bu cami on beşinci yüzyılda şehrin batısında yapıldı. İkinci cümle burada.'),
                         'Bu cami on beşinci yüzyılda şehrin batısında yapıldı.')

    def test_does_not_cut_at_short_abbreviations(self):
        text = 'Yapı uzun yıllar boyunca dergâh olarak kullanıldı ve Hz. Üftâde burada yaşadı. Sonra onarıldı.'
        self.assertEqual(share.first_sentence(text), 'Yapı uzun yıllar boyunca dergâh olarak kullanıldı ve Hz. Üftâde burada yaşadı.')

    def test_long_text_without_a_stop_is_cut_at_a_word(self):
        out = share.first_sentence('kelime ' * 80)
        self.assertLessEqual(len(out), 201)
        self.assertTrue(out.endswith('kelime…'))

    def test_empty(self):
        self.assertEqual(share.first_sentence(None), '')


@needs_db
class SharePageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.c = api, TestClient(api.app)

    def test_opens_without_the_app_and_says_the_source(self):
        r = self.c.get(f'/eser/{CAMI}')
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn('text/html', r.headers['content-type'])
        detail = self.c.get(f'/api/monuments/{CAMI}').json()
        self.assertIn(detail['card']['name_tr'], r.text)
        self.assertIn(detail['source']['book'], r.text)     # aynı kaynak web ve mobilde
        self.assertIn(f'esik://eser/{CAMI}?ref=share', r.text)
        self.assertIn('og:title', r.text)

    def test_carries_no_photo_script_or_cookie(self):
        r = self.c.get(f'/eser/{CAMI}')
        self.assertNotIn('og:image', r.text)
        self.assertNotIn('<img', r.text)
        self.assertNotIn('<script', r.text)
        self.assertNotIn('set-cookie', r.headers)

    def test_unpublished_work_is_not_shown(self):
        r = self.c.get(f'/eser/{TASLAK}')
        self.assertEqual(r.status_code, 404)
        self.assertNotIn('Çeşme', r.text.split('<main>')[1])

    def test_unknown_work_is_a_page_not_a_crash(self):
        self.assertEqual(self.c.get('/eser/yok-boyle').status_code, 404)

    def test_text_from_the_database_is_escaped(self):
        old = self.api.db.query('SELECT name_tr FROM monument WHERE slug = %(s)s', dict(s=CAMI))[0]['name_tr']
        self.api.db.execute('UPDATE monument SET name_tr = %(n)s WHERE slug = %(s)s', dict(n='<script>x</script>', s=CAMI))
        try:
            r = self.c.get(f'/eser/{CAMI}')
            self.assertNotIn('<script>x', r.text)
            self.assertIn('&lt;script&gt;x', r.text)
        finally:
            self.api.db.execute('UPDATE monument SET name_tr = %(n)s WHERE slug = %(s)s', dict(n=old, s=CAMI))

    def test_english_and_unknown_language(self):
        self.assertIn('Open in the app', self.c.get(f'/eser/{CAMI}', params={'lang': 'en'}).text)
        self.assertIn('Uygulamada aç', self.c.get(f'/eser/{CAMI}', params={'lang': 'xx'}).text)

    def test_share_events_are_accepted(self):
        self.assertIn('share_initiated', __import__('visitors').EVENT_TYPES)
        self.assertIn('share_opened', __import__('visitors').EVENT_TYPES)


if __name__ == '__main__':
    unittest.main()
