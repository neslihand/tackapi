"""PDF'ten çıkarım, Adım 4: TR/EN paragraflar ve sayfa düzeni düzeltmeleri (veritabanı gerekmez).

Sentetik satırlarla çalışır; son sınıf yerelde üretilmiş works.json varsa (data/pdfx, git dışı) gerçek sonuçları
denetler, yoksa atlanır.
"""
import os, json, unittest
from _testdb import ROOT  # noqa: F401  (pipeline klasörünü sys.path'e ekler)
from pdfx import text as T, layout as L, anchor as A


def ln(text, y, half='L', x0=81.0, lang='tr', role='body', block=0, pp=20, size=11.0, i=10):
    return dict(text=text, y0=y, y1=y + size, x0=x0, x1=x0 + 300, half=half, printed_page=pp, block=block,
                size=size, role=role, lang=lang, font='F', spans=[dict(text=text, font='F', size=size, lang=lang)])


def page(i, printed, lines):
    return dict(i=i, printed=list(printed), lines=lines, vertical=[])


def stream_line(text, y, i=10, half='L', col=0, kind='body', block=0, size=11.0, pp=20):
    return dict(text=text, y0=y, y1=y + size, i=i, half=half, col=col, kind=kind, block=block, size=size, page=pp)


class JoinAndParagraphTest(unittest.TestCase):
    def test_hyphenation(self):
        self.assertEqual(T.join('ara-', 'sında kalan'), 'arasında kalan')
        self.assertEqual(T.join('over-', 'looking the plain'), 'overlooking the plain')
        self.assertEqual(T.join('Cıkcık (Girçık-', 'Bekârlar) Hamamı'), 'Cıkcık (Girçık- Bekârlar) Hamamı')
        self.assertEqual(T.join('H. 767 /', 'M. 1365'), 'H. 767 / M. 1365')

    def test_vertical_gap_starts_a_paragraph(self):
        ps = T.paragraphs([stream_line('Birinci satır', 100), stream_line('devam ediyor.', 114),
                           stream_line('İkinci paragraf.', 136)])
        self.assertEqual([p['text'] for p in ps], ['Birinci satır devam ediyor.', 'İkinci paragraf.'])

    def test_paragraph_continues_across_columns_and_pages(self):
        ps = T.paragraphs([stream_line('cümle sayfa sonunda', 770, i=10, half='L'),
                           stream_line('bitiyor.', 100, i=10, half='R', pp=21),
                           stream_line('Yeni cümle.', 100, i=11, half='L', pp=22)])
        self.assertEqual([(p['text'], p['page']) for p in ps],
                         [('cümle sayfa sonunda bitiyor.', 20), ('Yeni cümle.', 22)])

    def test_lowercase_continuation_after_period_and_headings(self):
        ps = T.paragraphs([stream_line('H. 767 / M.', 770), stream_line('1365 yılında yapıldı.', 100, half='R'),
                           stream_line('SEMÂHÂNE', 150, half='R', kind='heading', block=3),
                           stream_line('Semâhâne kare planlıdır.', 175, half='R', block=4)])
        self.assertEqual([p['kind'] for p in ps], ['body', 'body', 'heading', 'body'])
        ps2 = T.paragraphs([stream_line('bu yapı', 770), stream_line('ise küçüktür.', 100, half='R')])
        self.assertEqual(len(ps2), 1)

    def test_inline_quote_does_not_split_paragraph(self):
        ps = T.paragraphs([stream_line('Kapıda şu yazar: “Allah’a ve ahiret gününe', 100),
                           stream_line('inananlar imar eder.” (Tevbe, 18)', 113, kind='quote'),
                           stream_line('“Tamamı alıntı olan paragraf.”', 140, kind='quote')])
        self.assertEqual([(p['kind'], p['text'][:20]) for p in ps],
                         [('body', 'Kapıda şu yazar: “Al'), ('quote', '“Tamamı alıntı olan ')])


class StreamTest(unittest.TestCase):
    """İki eser; ikincinin İngilizce başlığı bir sayfa sonra. Çapa başlıkları metne girmez, ara başlık girer."""

    def setUp(self):
        self.pages = [
            page(10, (20, 21), [
                ln('Birinci Camii', 100, role='title_tr', block=1, size=29),
                ln('FIRST MOSQUE', 140, role='title_en', lang='en', block=2, size=15),
                ln('Birinci caminin metni.', 200, block=3),
                ln('Text of the first mosque.', 200, x0=432, lang='en', block=4),
                ln('İKİNCİ CAMİİ', 400, role='heading_tr', block=5, size=15),
                ln('İkinci caminin metni.', 430, block=6),
                ln('Prof. Dr. Ali BORAN', 460, role='heading_tr', block=7, size=15),
                ln('More text of the first mosque.', 430, x0=432, lang='en', block=8)]),
            page(11, (22, 23), [
                ln('SECOND MOSQUE', 100, x0=432, role='heading_en', lang='en', block=1, size=15, pp=22),
                ln('Text of the second mosque.', 130, x0=432, lang='en', block=2, pp=22),
                ln('KUBBE', 200, role='heading_tr', block=3, size=15, pp=22),
                ln('Kubbe yüksektir.', 230, block=4, pp=22)])]
        self.data = dict(records=[
            dict(id='a', level='monument', name_tr='Birinci Camii', name_en='First Mosque', name_tr_display='Birinci Camii',
                 name_en_display='First Mosque', flags=[],
                 anchor=dict(i=10, half='L', col=0, y=100, printed_page=20, en=dict(i=10, half='L', col=0, y=140))),
            dict(id='b', level='monument', name_tr='İkinci Camii', name_en='Second Mosque', name_tr_display='İkinci Camii',
                 name_en_display='Second Mosque', flags=[],
                 anchor=dict(i=10, half='L', col=0, y=400, printed_page=20, en=dict(i=11, half='L', col=1, y=100)))])

    def test_works(self):
        ws = {w['id']: w for w in T.build_works('bursa-1', self.pages, self.data)}
        self.assertEqual([p['text'] for p in ws['a']['paras_tr']], ['Birinci caminin metni.'])
        self.assertEqual([p['text'] for p in ws['a']['paras_en']],
                         ['Text of the first mosque.', 'More text of the first mosque.'])
        self.assertEqual([(p['text'], p['kind']) for p in ws['b']['paras_tr']],
                         [('İkinci caminin metni.', 'body'), ('KUBBE', 'heading'), ('Kubbe yüksektir.', 'body')])
        self.assertEqual([p['text'] for p in ws['b']['paras_en']], ['Text of the second mosque.'])
        self.assertEqual(ws['b']['authors'], ['Prof. Dr. Ali BORAN'])
        self.assertEqual(ws['b']['pages'], [20, 22])

    def test_qa_flags(self):
        body = lambda n, t: [dict(text=t, kind='body', page=1)] * n
        self.assertEqual(T.qa_flags([], body(1, 'x' * 50)), ['empty_tr'])
        self.assertIn('en_ratio:3.00', T.qa_flags(body(1, 'x' * 100), body(3, 'x' * 100)))
        self.assertIn('para_count_diff:10/2', T.qa_flags(body(10, 'x' * 30), body(2, 'x' * 150)))


class LayoutFixTest(unittest.TestCase):
    def test_gutter_splits_side_by_side_columns(self):
        """Hatay: TR ve EN sütunları ~19 pt boşlukla ayrılır; 1,6 × punto (22 pt) eşiği bölmezdi."""
        chars = []
        for row in range(20):
            base = 100 + row * 16
            chars += [(x, base - 14, x + 6, base + 2, base, 'a', 'Times', 14.0, 0) for x in range(80, 420, 7)]
            chars += [(x, base - 14, x + 6, base + 2, base, 'b', 'Times', 14.0, 0) for x in range(438, 778, 7)]
        cuts = L.gutters(chars, 1701)
        self.assertEqual(len(cuts['L']), 1)
        self.assertTrue(417 < cuts['L'][0] < 440)
        lines = L.group_lines(chars, 1701, cuts)
        self.assertEqual(len(lines), 40)
        self.assertEqual(len(L.group_lines(chars, 1701)), 20)          # bölmeden: TR+EN tek satır

    def test_word_final_bang(self):
        st = {'bang': 0}
        vocab = {'gömülmüş': 3, 'giriş': 5}
        self.assertEqual(L.fix_final_bang('gömülmü! ve giri! koridoru', vocab, st), 'gömülmüş ve giriş koridoru')
        self.assertEqual(L.fix_final_bang('Haqq! People! Ey insanlar!', vocab, st), 'Haqq! People! Ey insanlar!')
        self.assertEqual(L.fix_final_bang('görülmemi! olup müthi! bir', {}, st), 'görülmemiş olup müthiş bir')
        self.assertEqual(L.fix_final_bang('!âh ve !âkiyye', {}, st), 'şâh ve şâkiyye')
        self.assertEqual(st['bang'], 6)

    def test_inner_bang_across_spans_and_after_capital(self):
        st = {'bang': 0}
        spans = [dict(text='Şehîd-i mübe'), dict(text='!şer, Â!ıka')]
        L.fix_inner_bang(spans, st)
        self.assertEqual(''.join(s['text'] for s in spans), 'Şehîd-i mübeşşer, Âşıka')
        self.assertEqual(st['bang'], 2)

    def test_function_word_language(self):
        self.assertEqual(L.func_lang('Yapının inşa tarihi ve bânisi hakkında bir bilgi yoktur, ancak bu yapı da '
                                     'olarak bilinir.'), 'tr')
        self.assertEqual(L.func_lang('Around Konya, there are Western Çatalhöyük, Karatay İşgalama and the mounds of '
                                     'the region which were settled in the period.'), 'en')
        self.assertIsNone(L.func_lang('Karatay Çatalhöyük İşgalama Konya'))

    def test_weight_rule_fixed_for_turkish_set_in_light_but_not_for_quotes(self):
        tr = 'Yapının inşa tarihi ve bânisi hakkında herhangi bir bilgi bulunmamaktadır. Ancak bu yapı da olarak bilinir.'
        lines = [ln(tr, 100, lang='en', block=1),
                 ln('“Emera bi-binâi hâzihi ve bir de bu ile olarak ve bir de ve bir bu ile kitabe metni uzun', 200,
                    lang='en', block=2)]
        self.assertEqual(L.check_weight_lang(lines, dict(lang_rule='font_weight')), 1)
        self.assertEqual([l['lang'] for l in lines], ['tr', 'en'])

    def test_para_runs(self):
        ls = [ln('a', 100), ln('b', 114), ln('c', 140)]
        self.assertEqual([[l['text'] for l in r] for r in L.para_runs(ls)], [['a', 'b'], ['c']])


class GoldMetricTest(unittest.TestCase):
    def test_norm_and_coverage(self):
        from pdfx import gold as G
        self.assertEqual(G.norm('yıkılmı!, giri! “Ara- sında”'), ['yıkılmış', 'giriş', 'arasında'])
        g = G.norm('bir iki üç dört beş altı yedi sekiz')
        cov, extra = G.coverage(g, g[:6])
        self.assertAlmostEqual(cov, 2 / 4)
        self.assertEqual(extra, 0.0)


def works(book):
    path = os.path.join(A.OUT, book, 'works.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return {w['id']: w for w in json.load(f)['works']}


@unittest.skipUnless(works('bursa-1') and works('hatay-1') and works('konya-1'), 'works.json yok (python -m pdfx.text)')
class RealWorksTest(unittest.TestCase):
    def test_known_works(self):
        m = works('bursa-1')['b1-0012']                 # Muradiye Camii
        self.assertTrue(m['paras_tr'][0]['text'].startswith('Osmangazi ilçesi, Muradiye Mahallesi'))
        self.assertTrue(m['paras_en'][0]['text'].startswith('The mosque is located within the Muradiye Complex'))
        self.assertEqual(m['pages'], [115, 122])
        t = works('hatay-1')['h1-0049']                 # Terzi Mehmet: TR ve EN aynı blokta alt alta
        self.assertTrue(t['paras_tr'] and t['paras_tr'][0]['text'].startswith('Hatay ili, Samandağ'))
        k = works('konya-1')['k1-0085']                 # İçkaraarslan: 10 pt gövde
        self.assertTrue(k['paras_tr'] and k['paras_en'])

    def test_no_empty_works_except_complex_headers(self):
        for book in ('bursa-1', 'hatay-1', 'konya-1'):
            empty = [w['id'] for w in works(book).values() if 'empty_tr' in w['flags'] and w['level'] != 'complex']
            self.assertEqual(empty, [], book)


if __name__ == '__main__':
    unittest.main()
