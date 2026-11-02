"""PDF'ten çıkarım, Adım 1–2: satır kurma, içindekiler ayrıştırma ve şehir kuyruğu (veritabanı gerekmez).

Son sınıf gerçek Bursa I PDF'ini okur; PDF yoksa (VAKIF_PDF_DIR) atlanır.
"""
import os, json, shutil, tempfile, unittest
from _testdb import ROOT  # noqa: F401  (pipeline klasörünü sys.path'e ekler)
from pdfx import layout as L, toc as T, cityqueue as Q


def ch(x, c, base=100.0, size=10.0, font='BrandonGrotesque-Light', w=5.0):
    """layout.page_chars biçiminde tek karakter."""
    return (x, base - size, x + w, base + 2, base, c, font, size, 0)


def word_chars(x, text, **kw):
    out = []
    for c in text:
        out.append(ch(x, c, **kw))
        x += 5.0 if c != ' ' else 2.5
    return out


def tl(text, y, x0=100.0, font='BrandonGrotesque-Light', page_i=7, half='L', size=10.0):
    """toc.toc_lines biçiminde satır."""
    return dict(text=text, y0=y, y1=y + 10, x0=x0, x1=x0 + 5 * len(text), font=font, page_i=page_i, half=half, size=size)


class LineBuildingTest(unittest.TestCase):
    def test_chars_join_by_coordinate_not_stream_order(self):
        chars = word_chars(100, 'Camii') + word_chars(70, 'İlçe ')        # akışta sonra gelen ama solda duran sözcük
        lines = L.group_lines(chars, 850)
        self.assertEqual([l['text'] for l in lines], ['İlçe Camii'])

    def test_big_gap_splits_columns(self):
        chars = word_chars(100, 'Koza Hanı') + word_chars(300, 'Koza Han')
        self.assertEqual(sorted(l['text'] for l in L.group_lines(chars, 850)), ['Koza Han', 'Koza Hanı'])

    def test_halves_of_a_spread(self):
        lines = L.group_lines(word_chars(100, 'Sol') + word_chars(1000, 'Sağ'), 1701)
        self.assertEqual({l['text']: l['half'] for l in lines}, {'Sol': 'L', 'Sağ': 'R'})

    def test_page_number_glued_to_toc_text_is_split(self):
        chars = word_chars(100, '233') + word_chars(132, 'SELÇUKLU')    # 17 pt boşluk, 10 pt yazı
        self.assertEqual([l['text'] for l in L.group_lines(chars, 850)], ['233', 'SELÇUKLU'])

    def test_body_text_with_numbers_is_not_split(self):
        chars = word_chars(100, '1399', size=11) + word_chars(125, 'yılında', size=11)
        self.assertEqual([l['text'] for l in L.group_lines(chars, 850)], ['1399 yılında'])

    def test_heading_language(self):
        self.assertEqual(L.heading_lang('HAMZA BEY CAMİİ'), 'tr')
        self.assertEqual(L.heading_lang('HAMZA BEY MOSQUE AND GRAVEYARD'), 'en')
        self.assertIsNone(L.heading_lang('ULUCAMI'))                       # kanıt yok: komşu gövdeye bakılır


class TocHelpersTest(unittest.TestCase):
    def test_join_wrapped_names(self):
        self.assertEqual(T.join_lines(['Tahir ile Zühre (Dön Baba-', 'Pir Ahi Sultan) Mescit ve Türbesi']),
                         'Tahir ile Zühre (Dön Baba-Pir Ahi Sultan) Mescit ve Türbesi')
        self.assertEqual(T.join_lines(['Dâye Hatun (Dâye Kadın -', 'Taya Kadın) Camii']),
                         'Dâye Hatun (Dâye Kadın - Taya Kadın) Camii')

    def test_levels(self):
        self.assertEqual(T.level_of('OSMANGAZİ', 'bursa'), 'district')
        self.assertEqual(T.level_of('CAMİLER VE HAZİRELER', 'bursa'), 'section')
        self.assertEqual(T.level_of('II. MURAD KÜLLİYESİ', 'bursa'), 'complex')
        self.assertEqual(T.level_of('Eşrefoğlu Süleyman Bey Külliyesi', 'konya'), 'complex')
        self.assertEqual(T.level_of('Sinan Paşa Külliyesi’nde Medrese', 'bursa'), 'monument')
        self.assertEqual(T.level_of('ULUCAMİ', 'bursa'), 'monument')

    def test_page_number_sits_on_last_tr_line(self):
        g = [tl('Beşikçiler (Sinan Dede)', 220), tl('Camii ve Haziresi', 233), tl('Beşikçiler (Sinan Dede)', 247),
             tl('Mosque and Graveyard', 261)]
        e = T.split_entry(g, (1, 283))
        self.assertEqual((T.join_lines(e['lines_tr']), T.join_lines(e['lines_en']), e['page']),
                         ('Beşikçiler (Sinan Dede) Camii ve Haziresi', 'Beşikçiler (Sinan Dede) Mosque and Graveyard', 283))

    def test_uppercase_heading_without_number(self):
        e = T.split_entry([tl('TİCARİ YAPILAR', 351), tl('Commercial Buildings', 364)], None)
        self.assertEqual((e['lines_tr'], e['lines_en']), (['TİCARİ YAPILAR'], ['Commercial Buildings']))

    def test_misprinted_toc_pages_are_flagged(self):
        recs = [dict(page=p, flags=[], page_src='toc') for p in (283, 286, 291, 293, 286, 298, 301)]
        T.check_pages(recs)
        self.assertEqual([r['page'] for r in recs], [283, 286, 291, 293, None, 298, 301])
        self.assertEqual(recs[4]['flags'], ['page_suspect:286'])

    def test_dotted_toc(self):
        pages = [dict(i=0, lines=[]) for _ in range(4)] + [dict(i=4, lines=[
            dict(tl('İÇİNDEKİLER / CONTENTS', 129, size=25), role='toc'),
            dict(tl('KÜLLİYELER VE KERVANSARAYLAR / COMPLEXES AND CARAVANSERAIRS.......', 248, size=15), role='toc'),
            dict(tl('• MUSTAFA ŞEVKİ PAŞA CAMİİ VE KÜLLİYESİ / MUSTAFA ŞEVKİ PASHA MOSQUE AND COMPLEX.177', 400,
                    size=14), role='toc'),
            dict(tl('• VAKIF KÜLTÜR KONAKLARI / FOUNDATION CULTURE MANSIONS..........482', 420, size=14), role='toc'),
        ])] + [dict(i=5, lines=[])]
        recs = T.build_tree('hatay-1', T.parse_dotted('hatay-1', pages))
        self.assertEqual([(r['level'], r['name_tr'], r['name_en'], r['page']) for r in recs], [
            ('section', 'KÜLLİYELER VE KERVANSARAYLAR', 'COMPLEXES AND CARAVANSERAIRS', None),
            ('complex', 'MUSTAFA ŞEVKİ PAŞA CAMİİ VE KÜLLİYESİ', 'MUSTAFA ŞEVKİ PASHA MOSQUE AND COMPLEX', 177),
            ('monument', 'VAKIF KÜLTÜR KONAKLARI', 'FOUNDATION CULTURE MANSIONS', 482)])
        self.assertIsNone(recs[2]['parent'])                       # Hatay'da madde imli kayıtlar kardeştir


def raw(tr, en=(), page=None, x0=117, upper=None, page_i=7, half='L'):
    tr = [tr] if isinstance(tr, str) else list(tr)
    return dict(lines_tr=tr, lines_en=list(en), page=page, page_i=page_i, half=half, x0=x0, y0=0,
                upper=T.is_upper(tr[0]) if upper is None else upper, font='BrandonGrotesque-Light', flags=[])


class TreeTest(unittest.TestCase):
    def test_complex_children_and_indent_exit(self):
        recs = T.build_tree('bursa-1', [
            raw('OSMANGAZİ', x0=960),
            raw('KÜLLİYELER', ['Complexes'], x0=960),
            raw('HAMZA BEY KÜLLİYESİ', ['Hamza Bey Complex'], x0=1422),
            raw('Hamza Bey Camii', ['Hamza Bey Mosque'], 177, x0=1458),
            raw('Hamza Bey Türbesi', ['Hamza Bey Tomb'], 184, x0=1458),
            raw('Başka Cami', ['Other Mosque'], 190, x0=1422),             # külliye hizasına döndü
        ])
        by = {r['name_tr']: r for r in recs}
        cx = by['HAMZA BEY KÜLLİYESİ']['id']
        self.assertEqual([by[n]['parent'] for n in ('Hamza Bey Camii', 'Hamza Bey Türbesi', 'Başka Cami')], [cx, cx, None])
        self.assertEqual((by['Hamza Bey Camii']['district'], by['Hamza Bey Camii']['section']), ('Osmangazi', 'KÜLLİYELER'))

    def test_konya_district_page_goes_to_first_monument(self):
        recs = T.build_tree('konya-1', [
            raw('CAMİLER', ['Mosques'], 72, x0=81),
            raw('MERAM', [], 75, x0=81),
            raw('Bulgur Dede Mescidi', ['Bulgur Dede Masjid'], None, x0=110),
            raw('Şükran Mescidi', ['Şükran Masjid'], 79, x0=110),
        ])
        m = recs[2]
        self.assertEqual((m['page'], m['page_src'], m['district'], m['section']), (75, 'toc_heading', 'Meram', 'CAMİLER'))

    def test_section_resets_district_in_konya_order(self):
        recs = T.build_tree('konya-2', [
            raw('EĞİTİM YAPILARI', ['Education Buildings'], 73), raw('MERAM', [], None),
            raw('Sırçalı Medrese', ['Sırçalı Madrasa'], 75), raw('TÜRBELER', ['Tombs'], 117),
            raw('Bir Türbe', ['A Tomb'], 118)])
        self.assertEqual(recs[-1]['district'], None)
        self.assertEqual(recs[2]['district'], 'Meram')

    def test_overrides(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp, True)
        recs = [dict(id='b1-0001', name_tr='Paşa Camii', page=None, flags=[], page_src=None),
                dict(id='b1-0002', name_tr='Silinecek', page=5, flags=[], page_src='toc'),
                dict(id='b1-0003', name_tr='Kayan Kayıt', page=7, flags=[], page_src='toc'),
                dict(id='b1-0004', name_tr='Doğru Kayıt', page=9, flags=['page_suspect:90'], page_src='heading')]
        with open(os.path.join(tmp, 'toc_overrides.json'), 'w', encoding='utf-8') as f:
            json.dump({'set': {'b1-0001': {'_was': 'Paşa Camii', 'page': 403},
                               'b1-0003': {'_was': 'Hamam', 'name_tr': 'Yanlış Yere Gidecek Ad'}},
                       'delete': ['b1-0002'], 'ok': ['b1-0004'],
                       'add': [{'after': 'b1-0001', 'id': 'b1-x1', 'name_tr': 'Eklenen Hazire', 'page': 404}]}, f)
        orig = T.out_dir
        T.out_dir = lambda book: tmp
        self.addCleanup(setattr, T, 'out_dir', orig)
        out, n = T.apply_overrides('bursa-1', recs)
        self.assertEqual(n, 4)
        self.assertEqual([(r['id'], r['page'], r['page_src']) for r in out],
                         [('b1-0001', 403, 'override'), ('b1-x1', 404, 'override'), ('b1-0003', 7, 'toc'),
                          ('b1-0004', 9, 'heading')])
        self.assertEqual(out[2]['name_tr'], 'Kayan Kayıt')            # _was uyuşmadı: düzeltme atlandı
        self.assertNotIn('_was', out[0])
        out[3].update(level='monument', name_en='Right One', parent=None, book='bursa-1')
        self.assertEqual(T.suspects([out[3]]), [])                     # incelendi: listeden düştü

    def test_suspects(self):
        recs = [dict(id='a', book='konya-2', level='monument', name_tr='Hamam', name_en='Bath', page=28, parent='c',
                     flags=[]),
                dict(id='b', book='konya-2', level='monument', name_tr='Uzun Bir Cami Adı', name_en='', page=None,
                     parent=None, flags=[]),
                dict(id='d', book='konya-2', level='district', name_tr='MERAM', name_en='', page=None, parent=None,
                     flags=[])]
        why = {r['id']: w for r, w in T.suspects(recs)}
        self.assertIn('adı çok kısa', why['a'][0])
        self.assertEqual(why['b'], ['sayfasız', 'EN adı eksik'])
        self.assertNotIn('d', why)                                   # ilçe adları kısa ve İngilizcesiz olabilir


class QueueTest(unittest.TestCase):
    def toc(self, book, *names):
        return [dict(id=f'x{k}', book=book, level=lv, name_tr=n, name_en='', page=p, parent=None, district=None,
                     section=None, key=f'{n}|{p}') for k, (lv, n, p) in enumerate(names)]

    def test_city_order_volumes_and_levels(self):
        tocs = {'hatay-1': self.toc('hatay-1', ('monument', 'Ağca Mescit', 206)),
                'bursa-2': self.toc('bursa-2', ('monument', 'Koza Hanı', 15)),
                'bursa-1': self.toc('bursa-1', ('section', 'KÜLLİYELER', None), ('complex', 'II. MURAD KÜLLİYESİ', 115),
                                    ('monument', 'Muradiye Camii', 115))}
        q = Q.make_queue(tocs, None)
        self.assertEqual(list(q), ['bursa', 'konya', 'hatay'])
        self.assertEqual([i['name_tr'] for i in q['bursa']], ['II. MURAD KÜLLİYESİ', 'Muradiye Camii', 'Koza Hanı'])
        self.assertEqual({i['status'] for i in q['bursa']}, {'waiting'})

    def test_pilot_is_locked_and_others_wait(self):
        tocs = {'bursa-1': self.toc('bursa-1', ('monument', 'Muradiye Camii', 115), ('monument', 'Muradiye Medresesi', 124),
                                    ('monument', 'Cem Sultan Türbesi', 145))}
        rows = [dict(slug='bursa-osmangazi-muradiye-camii', name_tr='Muradiye Camii', toc_title=None, book='bursa-1',
                     pilot=True, p0=115, p1=123),
                dict(slug='bursa-cem', name_tr='Cem Sultan Türbes', toc_title=None, book='bursa-1', pilot=True,
                     p0=145, p1=149),                                   # bulanık eşleşme, sayfa kesişiyor
                dict(slug='bursa-medrese', name_tr='Muradiye Medresesi', toc_title=None, book='bursa-1', pilot=False,
                     p0=124, p1=127)]
        q = Q.make_queue(tocs, rows)['bursa']
        self.assertEqual([(i['status'], i['db_slug']) for i in q], [
            ('pilot_locked', 'bursa-osmangazi-muradiye-camii'), ('waiting', 'bursa-medrese'), ('pilot_locked', 'bursa-cem')])

    def test_same_name_other_page_is_not_matched(self):
        rec = dict(book='hatay-1', name_tr='ŞEYH HIDIR TÜRBESİ', page=416)
        rows = [dict(slug='a', name_tr='Şeyh Hıdır Türbesi', toc_title=None, book='hatay-1', pilot=True, p0=406, p1=407),
                dict(slug='b', name_tr='Şeyh Hıdır Türbesi', toc_title=None, book='hatay-1', pilot=False, p0=416, p1=417)]
        self.assertEqual(Q.match(rec, rows)[0]['slug'], 'b')

    def test_pilot_with_edited_pages_is_still_locked(self):
        """Panelde düzeltilen pilotun sayfaları içindekilerle kesişmeyebilir; ad iki tarafta da tekse yine kilitlenir."""
        tocs = {'hatay-1': self.toc('hatay-1', ('monument', 'AHMEDİYE CAMİİ', 212), ('monument', 'ŞEYH HIZIR TÜRBESİ', 408),
                                    ('monument', 'ŞEYH HIZIR TÜRBESİ', 430), ('monument', 'KANTARA CAMİİ', 264))}
        rows = [dict(slug='ahmediye', name_tr='Ahmediye Camii', toc_title=None, book='hatay-1', pilot=True, p0=230, p1=231),
                dict(slug='hizir', name_tr='Şeyh Hızır Türbesi', toc_title=None, book='hatay-1', pilot=True, p0=500, p1=501),
                dict(slug='kantara', name_tr='Kantara Camii', toc_title=None, book='hatay-1', pilot=True, p0=1, p1=2)]
        tocs['hatay-1'][3]['db_slug'] = 'kantara'                        # elle eşleme (toc_overrides.json)
        q = Q.make_queue(tocs, rows)['hatay']
        self.assertEqual([(i['status'], i['db_match']) for i in q], [
            ('pilot_locked', 'name(page≠)'), ('waiting', None), ('waiting', None), ('pilot_locked', 'override')])

    def test_district_prefix_is_ignored(self):
        rec = dict(book='konya-2', name_tr='Eşrefoğlu Bedesteni', page=30)
        rows = [dict(slug='k', name_tr='Beyşehir Eşrefoğlu Bedesteni', toc_title=None, book='konya-2', pilot=True,
                     p0=28, p1=30)]
        self.assertEqual(Q.match(rec, rows), (rows[0], 'name+page'))

    def test_rerun_keeps_progress_but_never_unlocks_pilot(self):
        tocs = {'bursa-1': self.toc('bursa-1', ('monument', 'Muradiye Camii', 115), ('monument', 'Acemler Camii', 236))}
        old = {'cities': {'bursa': [dict(book='bursa-1', key='Muradiye Camii|115', status='loaded'),
                                    dict(book='bursa-1', key='Acemler Camii|236', status='approved')]}}
        rows = [dict(slug='m', name_tr='Muradiye Camii', toc_title=None, book='bursa-1', pilot=True, p0=115, p1=123)]
        q = Q.make_queue(tocs, rows, old)['bursa']
        self.assertEqual([i['status'] for i in q], ['pilot_locked', 'approved'])


@unittest.skipUnless(os.path.exists(L.pdf_path('bursa-1')), 'Bursa I PDF yok (VAKIF_PDF_DIR)')
class RealPdfTest(unittest.TestCase):
    """Bursa I içindekiler sayfası (PDF s. 7): sütunlar, sağdaki sayı sütunu ve fix_glyphs ('%brahim' → İbrahim)."""

    @classmethod
    def setUpClass(cls):
        from images import printed_pages
        doc = L.open_pdf('bursa-1')
        pps = printed_pages(doc)
        cls.pages = [dict(i=i, lines=[]) for i in range(6)] + [L.page_layout('bursa-1', doc[i], i, pps[i]) for i in (6, 7)]

    def test_toc_entries(self):
        recs = T.build_tree('bursa-1', T.parse_columns('bursa-1', self.pages))
        by = {r['name_tr']: r for r in recs}
        self.assertEqual(by['Başçı İbrahim Bey Camii ve Haziresi']['page'], 275)
        self.assertEqual(by['Başçı İbrahim Bey Camii ve Haziresi']['name_en'], 'Başçı İbrahim Bey Mosque and Graveyard')
        self.assertEqual(by['Beşikçiler (Sinan Dede) Camii ve Haziresi']['page'], 283)
        self.assertEqual(by['Muradiye Camii']['parent'], by['II. MURAD KÜLLİYESİ']['id'])
        self.assertEqual(by['Abdal Mehmed Camii']['section'], 'CAMİLER VE HAZİRELER')
        self.assertGreaterEqual(sum(r['level'] == 'monument' for r in recs), 125)


if __name__ == '__main__':
    unittest.main()
