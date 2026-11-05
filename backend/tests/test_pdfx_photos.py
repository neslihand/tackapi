"""PDF'ten çıkarım, Adım 5: fotoğrafları çapaya göre eserlere bağlama (veritabanı ve PDF gerekmez).

Son sınıf yerelde üretilmiş photos.json varsa (data/pdfx, git dışı) gerçek sonuçları denetler, yoksa atlanır.
"""
import os, json, unittest
from _testdb import ROOT  # noqa: F401  (pipeline klasörünü sys.path'e ekler)
from pdfx import photos as P


def rec(id_, i, half, y, level='monument'):
    return dict(id=id_, level=level, flags=[], anchor=dict(i=i, half=half, y=y))


class BindTest(unittest.TestCase):
    def setUp(self):
        self.recs = [rec('s', 10, 'L', 100, level='section'),
                     rec('a', 11, 'L', 111),            # eser A: s. 22 üstte başlık
                     rec('a-hz1', 12, 'L', 393),        # A'nın haziresi: s. 24 ortada başlık
                     rec('b', 13, 'R', 111),            # eser B: s. 27 üstte başlık
                     rec('c', 15, 'L', 111)]
        self.texts = {(11, 'L'): [150, 300], (11, 'R'): [100], (12, 'L'): [420, 500], (12, 'R'): [100],
                      (13, 'R'): [150], (14, 'L'): [100], (15, 'L'): [150]}

    def bind(self, i, half, y0, y1):
        r, method, flags = P.bind(self.recs, i, half, (80, y0, 700, y1), self.texts)
        return (r['id'] if r else None, method, flags)

    def test_position_after_anchor(self):
        self.assertEqual(self.bind(11, 'L', 400, 600), ('a', 'konum', []))
        self.assertEqual(self.bind(11, 'R', 300, 500), ('a', 'konum', []))

    def test_photo_above_heading_belongs_to_heading(self):
        """Bursa hazireleri: fotoğraf (y 90–373), altında 'X CAMİİ HAZİRESİ' (y 393), sonra metin."""
        self.assertEqual(self.bind(12, 'L', 90, 373), ('a-hz1', 'baslik_ustu', []))

    def test_text_between_photo_and_heading_keeps_previous(self):
        texts = dict(self.texts)
        texts[(12, 'L')] = [380, 420]
        r, method, _ = P.bind(self.recs, 12, 'L', (80, 90, 700, 300), texts)
        self.assertEqual((r['id'], method), ('a', 'konum'))

    def test_opening_photo_on_textless_left_page(self):
        """Metinsiz sol sayfadaki fotoğraf, aynı açılımın sağında başlayan B'yi açar."""
        self.assertEqual(self.bind(13, 'L', 90, 780), ('b', 'acilis', ['acilis']))

    def test_textless_page_before_next_page_stays_but_is_flagged(self):
        self.assertEqual(self.bind(14, 'R', 90, 780), ('b', 'konum', ['fotograf_sayfasi']))

    def test_section_and_intro(self):
        self.assertEqual(self.bind(10, 'R', 300, 500), ('s', 'bolum', []))
        self.assertEqual(self.bind(3, 'L', 300, 500), (None, 'giris', []))


class CompareTest(unittest.TestCase):
    def test_categories(self):
        rows = [dict(is_new=False, db_slug='x', old_slug='x', work='a'),
                dict(is_new=False, db_slug='x', old_slug='y', work='a'),
                dict(is_new=False, db_slug=None, old_slug='x-haziresi', work='a-hz1'),
                dict(is_new=False, db_slug=None, old_slug=None, work=None),
                dict(is_new=True, db_slug=None, old_slug=None, work='a')]
        c, diffs = P.compare(rows)
        self.assertEqual((c['ayni'], c['farkli'], c['yeni_eser_ya_da_hazire'], c['ikisi_de_eser_disi'],
                          c['yeni_fotograf']), (1, 1, 1, 1, 1))
        self.assertEqual(len(diffs), 1)


def photos(book):
    path = os.path.join(P.OUT, book, 'photos.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)['photos']


@unittest.skipUnless(photos('bursa-1') and photos('konya-1'), 'photos.json yok (python -m pdfx.photos)')
class RealPhotosTest(unittest.TestCase):
    def test_known_bindings(self):
        b1 = photos('bursa-1')
        akbiyik = [r for r in b1 if r['pdf_page'] == 124 and r['half'] == 'L']
        self.assertTrue(akbiyik and all(r['work'] == 'b1-0049-hz1' for r in akbiyik))   # Akbıyık Haziresi
        k1 = photos('konya-1')
        sems = [r for r in k1 if r['pdf_page'] == 115]
        self.assertTrue(sems and all(r['work'] == 'k1-0081' for r in sems))             # Şems-i Tebrizi, eskiden Hatuniye

    def test_same_filter_as_images_py(self):
        self.assertFalse([r for r in photos('bursa-1') if r['is_new']])


if __name__ == '__main__':
    unittest.main()
