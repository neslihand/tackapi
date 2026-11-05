"""PDF'ten çıkarım, Adım 3: içindekiler kayıtlarının gövdedeki başlangıç noktaları (veritabanı gerekmez).

Sentetik sayfalarla çalışır; son sınıf yerelde üretilmiş anchors.json varsa (data/pdfx, git dışı) gerçek sonuçları
denetler, yoksa atlanır.
"""
import os, json, unittest
from _testdb import ROOT  # noqa: F401  (pipeline klasörünü sys.path'e ekler)
from pdfx import anchor as A


def line(role, text, y, half='R', pp=83, block=None, x0=None, size=15.0):
    x0 = x0 if x0 is not None else (960.0 if half == 'R' else 80.0)
    return dict(role=role, text=text, y0=y, y1=y + size, x0=x0, x1=x0 + 6 * len(text), half=half, printed_page=pp,
                block=block if block is not None else int(y), size=size, font='F')


def page(i, printed, lines=(), vertical=()):
    return dict(i=i, printed=list(printed), lines=list(lines), vertical=list(vertical))


def vline(text, x0, pp, size=40.0, half='L'):
    return dict(text=text, x0=x0, x1=x0 + 48, y0=300.0, y1=790.0, size=size, half=half, printed_page=pp,
                font='TimesNewRomanPS-BoldMT' if size >= 30 else 'MinionPro-Regular')


def rec(id_, level, name, page_no, name_en='', parent=None):
    return dict(id=id_, level=level, name_tr=name, name_en=name_en, page=page_no, parent=parent, district=None,
                section=None)


class NamesTest(unittest.TestCase):
    def test_cased_turkish(self):
        self.assertEqual(A.cased('HABİB-İ NECCAR CAMİİ VE KÜLLİYESİ'), 'Habib-i Neccar Camii ve Külliyesi')
        self.assertEqual(A.cased('KÜRT FAKİH (TUFAKİ) CAMİİ'), 'Kürt Fakih (Tufaki) Camii')
        self.assertEqual(A.cased('I. MURAD HUDÂVENDİGÂR KÜLLİYESİ'), 'I. Murad Hudâvendigâr Külliyesi')
        self.assertEqual(A.cased('AZİZ PAVLOS’UN TÜRBESİ'), 'Aziz Pavlos’un Türbesi')

    def test_cased_english_keeps_turkish_spelling_of_shared_words(self):
        known = {A.tr_upper(w): w for w in 'Şeyh Hıdır Türbesi'.split()}
        self.assertEqual(A.cased('SHEIKH HIDIR TOMB', 'en', known), 'Sheikh Hıdır Tomb')
        self.assertEqual(A.cased('TOMB OF SHEIKH ALI', 'en'), 'Tomb of Sheikh Ali')

    def test_upper_detection_and_spaced_district(self):
        self.assertTrue(A.is_upper('3rd DISTRICT PLOT NO. 466 HOUSE'))
        self.assertFalse(A.is_upper('Ulucami'))
        self.assertEqual(A.unspace('O S M A N G A Z İ'), 'OSMANGAZİ')
        self.assertEqual(A.unspace('Koza Hanı'), 'Koza Hanı')

    def test_similarity_covers_shortened_and_longer_headings(self):
        self.assertGreaterEqual(A.sim('i murad hudavendigar medresesi', 'hudavendigar medresesi'), 0.85)
        self.assertGreaterEqual(A.sim('lala mustafa pasa camii', 'lala mustafa pasa kulliyesi kursunlu camii'), 0.85)
        self.assertLess(A.sim('acem reis camii', 'acem reis camii haziresi'), 0.85 + 0.04)   # hazire ayrı başlık


class VerticalTitleTest(unittest.TestCase):
    def test_wrapped_tr_and_en_columns_and_printed_note(self):
        p = page(204, (408, 409), vertical=[
            vline('GÖKMEYDAN-ŞEYH HIZIR MAKAMI', 29, 408), vline('GOKMEYDAN-MAQAM OF', 128, 408),
            vline('SHEIKH HIZIR', 176, 408), vline('LİSTEDE TURBE BURDA MAKAM', 235, 408, size=12)])
        [g] = A.vertical_groups(p)
        self.assertEqual(g['text'], 'GÖKMEYDAN-ŞEYH HIZIR MAKAMI')
        self.assertEqual(g['text_en'], 'GOKMEYDAN-MAQAM OF SHEIKH HIZIR')
        self.assertEqual(g['note'], 'LİSTEDE TURBE BURDA MAKAM')

    def test_two_line_tr_title(self):
        p = page(48, (96, 97), vertical=[vline('SOKULLU MEHMET PAŞA CAMİİ', 14, 96), vline('VE KÜLLİYESİ', 62, 96),
                                         vline('SOKULLU MEHMET PASHA MOSQUE', 121, 96), vline('AND COMPLEX', 169, 96)])
        [g] = A.vertical_groups(p)
        self.assertEqual((g['text'], g['text_en']), ('SOKULLU MEHMET PAŞA CAMİİ VE KÜLLİYESİ',
                                                     'SOKULLU MEHMET PASHA MOSQUE AND COMPLEX'))


class AnchorTest(unittest.TestCase):
    BOOK = 'bursa-1'

    def pages(self):
        return [
            page(40, (82, 83), [line('district', 'O S M A N G A Z İ', 84, size=21),
                                line('title_tr', 'I. Murad Hudâvendigâr Külliyesi', 111, size=29),
                                line('title_en', 'MURAD I HUDÂVENDİGÂR COMPLEX', 218),
                                line('heading_tr', 'I. MURAD HUDÂVENDİGÂR CAMİİ', 268),
                                line('heading_en', 'MURAD I HUDÂVENDİGÂR MOSQUE', 536)]),
            page(41, (84, 85), [line('heading_tr', 'HUDÂVENDİGÂR MEDRESESİ', 507, half='L', pp=84),
                                line('heading_tr', 'Prof. Dr. Ali BORAN', 600, half='L', pp=84)]),
            page(42, (86, 87), [line('title_tr', 'Acem Reis Camii ve Haziresi', 111, pp=87, size=29),
                                line('title_en', 'ACEM REIS MOSQUE AND GRAVEYARD', 149, pp=87)]),
            page(43, (88, 89), [line('heading_tr', 'ACEM REİS CAMİİ HAZİRESİ', 428, half='L', pp=88),
                                line('heading_tr', 'BURSA’NIN İNCİSİ', 600, half='L', pp=88)]),
        ]

    def toc(self):
        return [rec('d', 'district', 'OSMANGAZİ', 83),
                rec('c', 'complex', 'I. MURAD HUDÂVENDİGÂR KÜLLİYESİ', 83, 'Murad I Hudâvendigâr Complex'),
                rec('m1', 'monument', 'I. Murad Hudâvendigâr Camii', 83, parent='c'),
                rec('m2', 'monument', 'I. Murad Hudâvendigâr Medresesi', 84, parent='c'),
                rec('s', 'section', 'CAMİLER VE HAZİRELER', None),
                rec('m3', 'monument', 'Acem Reis Camii ve Haziresi', 85, 'Acem Reis Mosque and Graveyard')]

    def test_anchors_order_sources_and_flags(self):
        recs, _ = A.anchor_book(self.BOOK, self.toc(), self.pages())
        by = {r['id']: r for r in recs}
        self.assertEqual([by[k]['anchor']['src'] for k in ('d', 'c', 'm1', 'm2')],
                         ['district', 'title_tr', 'heading_tr', 'heading_tr'])
        self.assertEqual(by['m2']['anchor']['text'], 'HUDÂVENDİGÂR MEDRESESİ')
        self.assertIsNone(by['s']['anchor'])                       # gövdede ayracı yok → sanal
        self.assertIn('virtual', by['s']['flags'])
        self.assertEqual(by['m3']['anchor']['printed_page'], 87)     # içindekiler 85, gövde 87
        self.assertIn('page_shift:+2', by['m3']['flags'])
        # külliyenin metni üyesinin başlığında biter; sanal bölüm sınır olmaz
        self.assertEqual(by['c']['end'], dict(i=40, half='R', col=0, y=268))
        self.assertEqual(by['m2']['end'], dict(i=42, half='R', col=0, y=111))

    def test_display_names_from_body_title(self):
        recs, _ = A.anchor_book(self.BOOK, self.toc(), self.pages())
        c = recs[1]
        self.assertEqual(c['name_tr_display'], 'I. Murad Hudâvendigâr Külliyesi')
        self.assertEqual(c['name_en_display'], 'Murad I Hudâvendigâr Complex')
        self.assertNotIn('name_cased', c['flags'])

    def test_untracked_headings(self):
        _, un = A.anchor_book(self.BOOK, self.toc(), self.pages())
        kinds = {u['text']: (u['kind'], u['inside']) for u in un}
        self.assertEqual(kinds['ACEM REİS CAMİİ HAZİRESİ'], ('hazire', 'm3'))
        self.assertEqual(kinds['Prof. Dr. Ali BORAN'], ('author', 'm2'))
        self.assertEqual(kinds['BURSA’NIN İNCİSİ'], ('subheading', 'm3'))

    def test_hazire_heading_becomes_child_work(self):
        recs, _ = A.anchor_book(self.BOOK, self.toc(), self.pages())
        by = {r['id']: r for r in recs}
        h = by['m3-hz1']
        self.assertEqual((h['kind'], h['parent'], h['origin']), ('hazire', 'm3', 'heading'))
        self.assertEqual(h['name_tr'], 'Acem Reis Camii Haziresi')
        self.assertEqual(h['name_en'], 'Acem Reis Mosque Graveyard')     # İngilizce başlık yok: üst eserden kurulur
        self.assertEqual([r['id'] for r in recs][-2:], ['m3', 'm3-hz1'])
        self.assertEqual(by['m3']['end'], dict(i=43, half='L', col=0, y=428))   # caminin metni hazirede biter

    def test_generic_hazire_heading_is_named_after_parent(self):
        tr, en, flags = A.hazire_names(dict(text='HAZİRE ALANI', text_en=None),
                                       dict(name_tr_display='Eşrefzâde Camii, Minaresi ve Haziresi',
                                            name_en_display='Eşrefzâde Mosque, Minaret and Graveyard'))
        self.assertEqual((tr, en, flags), ('Eşrefzâde Camii Haziresi', 'Eşrefzâde Mosque Graveyard', ['name_built']))

    def test_english_heading_found_pages_later(self):
        """İngilizce metin ayrı akar: Türkçe başlık s. 260 sol sütunda, İngilizcesi s. 261 sağ sütunda."""
        pages = [page(130, (260, 261), [line('heading_tr', 'ALİ PAŞA CAMİİ HAZİRESİ', 476, half='L', pp=260, x0=81),
                                        line('heading_en', 'ALİ PAŞA MOSQUE GRAVEYARD', 400, half='R', pp=261,
                                             x0=1312)])]
        [r], _ = A.anchor_book(self.BOOK, [rec('h', 'monument', 'Ali Paşa Camii Haziresi', 260,
                                               'Ali Paşa Mosque Graveyard')], pages)
        self.assertEqual(r['anchor']['en'], dict(i=130, half='R', col=1, y=400))
        self.assertNotIn('en_anchor_guess', r['flags'])

    def test_reading_order_puts_right_column_after_left(self):
        self.assertLess(A.pos_of(5, 'L', 700, 81), A.pos_of(5, 'L', 100, 432))
        self.assertLess(A.pos_of(5, 'L', 700, 432), A.pos_of(5, 'R', 100, 960))
        self.assertEqual(A.col_of('R', 1312), 1)
        self.assertEqual(A.col_of('R', 960), 0)

    def test_same_page_title_with_other_name_is_taken_but_flagged(self):
        pages = [page(129, (258, 259), vertical=[vline('KERHAN (YEMENİCİLER) MESCİDİ', 22, 258),
                                                 vline('KERHAN (YEMENİCİLER) MASJID', 143, 258)])]
        [r], _ = A.anchor_book('hatay-1', [rec('h', 'monument', 'KARHANE MESCİDİ', 258, 'KARHANE MASJID')], pages)
        self.assertEqual(r['anchor']['src'], 'vertical_tr')
        self.assertIn('name_differs', r['flags'])
        # geliştirici kararı: Hatay'da ad farkında gövde başlığı kullanılır
        self.assertEqual((r['name_tr_display'], r['name_en_display']),
                         ('Kerhan (Yemeniciler) Mescidi', 'Kerhan (Yemeniciler) Masjid'))
        self.assertIn('name_from_body', r['flags'])
        self.assertEqual(r['name_tr'], 'KARHANE MESCİDİ')                   # içindekiler adı da saklanır

    def test_missing_heading_is_a_guess_at_page_top(self):
        pages = [page(10, (20, 21), [line('body', 'metin', 300, half='L', pp=20)])]
        [r], _ = A.anchor_book(self.BOOK, [rec('x', 'monument', 'Yok Camii', 21)], pages)
        self.assertEqual((r['anchor']['i'], r['anchor']['half'], r['anchor']['y']), (10, 'R', 0.0))
        self.assertIn('anchor_guess', r['flags'])

    def test_same_name_twice_takes_headings_in_book_order(self):
        pages = [page(203, (406, 407), vertical=[vline('KARYER-ŞEYH HIDIR TÜRBESİ', 29, 406)]),
                 page(208, (416, 417), vertical=[vline('5. MINTIKA905 PARSEL', 21, 416),
                                                 vline('ŞEYH HIDIR TÜRBESİ', 60, 416),
                                                 vline('SHEIKH HIDIR TOMB', 154, 416)])]
        toc = [rec('a', 'monument', 'ŞEYH HIDIR TÜRBESİ', 406), rec('b', 'monument', 'ŞEYH HIDIR TÜRBESİ', 416)]
        recs, _ = A.anchor_book('hatay-1', toc, pages)
        self.assertEqual([r['anchor']['i'] for r in recs], [203, 208])
        self.assertEqual(recs[1]['anchor']['text'], '5. MINTIKA905 PARSEL ŞEYH HIDIR TÜRBESİ')


def anchors(book):
    path = os.path.join(A.OUT, book, 'anchors.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)


@unittest.skipUnless(anchors('hatay-1') and anchors('konya-1'), 'anchors.json yok (python -m pdfx.anchor)')
class RealAnchorsTest(unittest.TestCase):
    def test_hatay_vertical_titles_and_konya_mevlana_parts(self):
        h = {r['id']: r for r in anchors('hatay-1')['records']}
        self.assertEqual((h['h1-0013']['anchor']['src'], h['h1-0013']['anchor']['printed_page']), ('vertical_tr', 198))
        self.assertEqual(h['h1-0013']['name_tr_display'], 'Affan (Ertuğrul) Camii')
        k = anchors('konya-1')
        parts = [u for u in k['untracked'] if u['kind'] == 'complex_part' and u['inside'] == 'k1-0002']
        self.assertGreaterEqual(len(parts), 14)
        for d in (anchors('hatay-1'), k):
            works = [r for r in d['records'] if r['level'] in ('monument', 'complex')]
            self.assertFalse([r['id'] for r in works if 'anchor_guess' in r['flags']])


if __name__ == '__main__':
    unittest.main()
