"""Pilot eserleri tamamen düzeltme: kaynakça sayfaları, kitap sayfalarındaki fotoğraflar ve künyenin düzeltilmiş
metinden yeniden çıkarılması (Gemini çağrılmaz; çıkarım sahte bir cevapla taklit edilir)."""
import copy, tempfile, unittest
from unittest import mock
from _testdb import needs_db, fresh_db, ADMINS

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI, TURBE = 'bursa-osmangazi-muradiye-camii', 'bursa-yildirim-ornek-turbesi'
PARAS = [
    'Cami, Osmangazi ilçesi Muradiye Mahallesinde yer almaktadır.',
    'Yapının giriş kapısı üzerindeki kitabeye göre 1426 tarihinde Sultan II. Murad tarafından yaptırılmıştır.',
    'Türbe Yıldırım ilçesinde yer almaktadır ve bugün harap durumdadır.',
]
EXTRACTION = {
    'ad_tr': 'Muradiye Camii', 'diger_adlar': [], 'konum': {'mahalle': 'Muradiye', 'adres': None},
    'insa': {'yil_baslangic': 1426, 'yil_bitis': None, 'dayanak': 'inscription', 'donem_metinde': None,
             'alinti': 'kitabeye göre 1426 tarihinde Sultan II. Murad tarafından yaptırılmıştır', 'metindeki_ifade': '1426'},
    'ozet_tr': 'Yeni özet', 'ozet_en': 'New summary', 'gunumuz_durumu': None, 'durum': 'standing', 'mimari': {},
    'kisiler': [{'ad': 'Sultan II. Murad', 'rol': 'patron', 'unvan': 'Sultan', 'detay': None,
                 'alinti': 'Sultan II. Murad tarafından yaptırılmıştır'},
                {'ad': 'Mimar Uydurma', 'rol': 'architect', 'unvan': None, 'detay': None, 'alinti': 'metinde olmayan bir cümle'}],
    'olaylar': [{'tur': 'construction', 'yil_baslangic': 1426, 'yil_bitis': None, 'kesinlik': 'year', 'hicri': None,
                 'metindeki_tarih': '1426', 'dayanak': 'inscription', 'kisi': 'Sultan II. Murad', 'aciklama': 'İnşa',
                 'alinti': 'kitabeye göre 1426 tarihinde'}],
    'sanat_eserleri': [{'tur': 'inscription', 'yer': 'giriş kapısı', 'aciklama': 'İnşa kitabesi', 'hazireye_ait': False,
                        'alinti': 'giriş kapısı üzerindeki kitabeye göre'}],
    'vakiflar': [], 'rivayetler': [],
    'kalite': {'celiskiler': ['Kitabe ile metin farklı tarih veriyor'], 'olasi_ocr_hatalari': []},
}


@needs_db
class PilotFixTest(unittest.TestCase):
    def setUp(self):
        fresh_db()
        from fastapi.testclient import TestClient
        import api, textfix_db
        self.api, self.T, self.c, self.db = api, textfix_db, TestClient(api.app), api.db
        # bölümleme hatası: caminin kaydına türbenin paragrafı (s. 90) karışmış; aralık 75–90 görünüyor
        self.db.execute("UPDATE source_section SET text_tr = %(t)s, page_map = %(pm)s::jsonb, page_start = 75, page_end = 90 WHERE id = 1",
                        dict(t='\n\n'.join(PARAS), pm='[{"p":0,"pages":[75]},{"p":1,"pages":[76]},{"p":2,"pages":[90]}]'))
        self.db.execute("UPDATE monument SET pages = '[75,91)' WHERE slug = %(s)s", dict(s=CAMI))
        self.id = self.db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=CAMI))[0]['id']

    def pages(self, slug=CAMI):
        return self.c.get(f'/api/admin/preview/{slug}', headers=NES).json()['detail']['source']['pages']

    def test_source_pages_follow_corrected_paragraphs(self):
        self.assertEqual(self.pages(), [75, 90])
        r = self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/3', json={'decision': 'move', 'target': TURBE}, headers=NES)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.pages(), [75, 76])                       # sitede kaynakça düzeldi
        d = self.c.get(f'/api/admin/monuments/{CAMI}', headers=NES).json()
        self.assertEqual((d['page_from'], d['page_to'], d['pages_auto']), (75, 76, [75, 76]))

    def test_manual_pages_are_kept(self):
        r = self.c.patch(f'/api/admin/monuments/{CAMI}', json={'page_from': 74, 'page_to': 77}, headers=NES)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.pages(), [74, 77])
        # elle girilen aralık sonraki paragraf kararlarında değişmez
        self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/3', json={'decision': 'hide'}, headers=NES)
        self.assertEqual(self.pages(), [74, 77])
        self.assertEqual(self.c.patch(f'/api/admin/monuments/{CAMI}', json={'page_from': 80, 'page_to': 79},
                                      headers=NES).status_code, 422)

    def test_page_photos_show_owner_and_range(self):
        self.db.execute("""INSERT INTO image(monument_id, city_id, book_id, source, sha1, file, printed_page, review_status) VALUES
                             ((SELECT id FROM monument WHERE slug = %(t)s), 1, 1, 'book', 'p80', 'b/p80.webp', 80, 'published'),
                             (NULL, 1, 1, 'book', 'p91', 'b/p91.webp', 91, 'draft'),
                             (NULL, 1, 1, 'book', 'p95', 'b/p95.webp', 95, 'draft')""", dict(t=TURBE))
        r = self.c.get(f'/api/admin/monuments/{CAMI}/page-photos', headers=NES).json()
        self.assertEqual(r['pages'], [75, 90])
        by = {p['printed_page']: p for p in r['photos']}
        self.assertNotIn(95, by)                                         # aralık + 1 sayfanın dışında
        self.assertTrue(by[75]['here'])
        self.assertEqual((by[80]['here'], by[80]['monument'], by[80]['in_range']), (False, TURBE, True))
        self.assertEqual((by[91]['monument'], by[91]['in_range']), (None, False))
        self.assertEqual(len(self.c.get(f'/api/admin/monuments/{CAMI}/page-photos?pad=0', headers=NES).json()['photos']), 4)

    def test_pdf_page_without_pdf_is_503(self):
        import pdf_pages
        with mock.patch.object(pdf_pages, 'PDF_DIR', tempfile.gettempdir()):
            pdf_pages.page_map.cache_clear()
            r = self.c.get('/api/admin/books/bursa-1/pdf-page?printed=75', headers=NES)
        self.assertEqual(r.status_code, 503)
        self.assertIn('PDF', r.json()['detail'])
        self.assertEqual(self.c.get('/api/admin/books/bursa-1/pdf-page?printed=75').status_code, 401)

    def reextract(self):
        import reextract
        with mock.patch.object(reextract.G, 'generate', return_value=copy.deepcopy(EXTRACTION)) as gen, \
             mock.patch.object(reextract, 'save'):
            r = self.c.post(f'/api/admin/monuments/{CAMI}/reextract', headers=NES)
        return r, gen

    def test_reextract_uses_corrected_text_and_keeps_panel_work(self):
        db = self.db
        # yönetici: türbenin paragrafını taşıdı, özeti elle yazdı, süsleme kaydına fotoğraf bağladı
        self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/3', json={'decision': 'move', 'target': TURBE}, headers=NES)
        self.c.patch(f'/api/admin/monuments/{CAMI}', json={'summary_tr': 'Elle yazılmış özet'}, headers=NES)
        art = db.query("""INSERT INTO artwork(monument_id, kind, description_tr, quote) VALUES (%(m)s, 'inscription', 'eski',
                          'giriş kapısı üzerindeki kitabeye göre') RETURNING id""", dict(m=self.id))[0]['id']
        db.execute('INSERT INTO artwork_image(artwork_id, image_id, sort, linked_by) VALUES (%(a)s, 1, 0, %(u)s)',
                   dict(a=art, u='neslihan'))
        db.execute("""INSERT INTO editorial_note(kind, monument_id, note_tr) VALUES ('likely_error', %(m)s, 'P3 başka esere ait'),
                                                                                   ('ocr', %(m)s, 'kapatılmış not')""", dict(m=self.id))
        db.execute("UPDATE editorial_note SET status = 'resolved' WHERE note_tr = 'kapatılmış not'")
        r, gen = self.reextract()
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual((r.json()['persons'], r.json()['events'], r.json()['artworks'], r.json()['rejected']), (1, 1, 1, 1))
        self.assertEqual(r.json()['kept_panel_fields'], ['summary_tr'])
        prompt = gen.call_args.args[0]
        self.assertIn(PARAS[1], prompt)
        self.assertNotIn(PARAS[2], prompt)                               # taşınan paragraf çıkarıma gitmez
        m = db.query('SELECT summary_tr, summary_en, built_years, date_basis FROM monument WHERE id = %(m)s', dict(m=self.id))[0]
        self.assertEqual((m['summary_tr'], m['summary_en']), ('Elle yazılmış özet', 'New summary'))
        self.assertEqual((m['built_years'].lower, m['date_basis']), (1426, 'inscription'))
        people = db.query("""SELECT p.name, mp.role, mp.chunk_id FROM monument_person mp JOIN person p ON p.id = mp.person_id
                             WHERE mp.monument_id = %(m)s""", dict(m=self.id))
        self.assertEqual([(p['name'], p['role']) for p in people], [('Sultan II. Murad', 'patron')])
        self.assertIsNotNone(people[0]['chunk_id'])                      # alıntının geçtiği parçaya bağlı
        ev = db.query('SELECT evidence_artwork_id FROM event WHERE monument_id = %(m)s', dict(m=self.id))[0]
        arts = db.query("SELECT id FROM artwork WHERE monument_id = %(m)s AND kind = 'inscription'", dict(m=self.id))
        self.assertEqual(len(arts), 1)
        self.assertEqual(ev['evidence_artwork_id'], arts[0]['id'])       # tarihi veren kitâbe
        self.assertEqual(db.query('SELECT image_id FROM artwork_image WHERE artwork_id = %(a)s', dict(a=arts[0]['id'])),
                         [{'image_id': 1}])                              # panelde bağlanan fotoğraf korundu
        self.assertEqual(db.query('SELECT count(*) AS n FROM artwork WHERE monument_id = 3')[0]['n'], 1)   # hazire kaydı kaldı
        notes = {n['note_tr']: n['status'] for n in db.query('SELECT note_tr, status FROM editorial_note WHERE monument_id = %(m)s',
                                                             dict(m=self.id))}
        self.assertNotIn('P3 başka esere ait', notes)                    # eskimiş açık not silindi
        self.assertEqual(notes.get('kapatılmış not'), 'resolved')
        self.assertEqual(notes.get('Kitabe ile metin farklı tarih veriyor'), 'open')
        self.assertIn('monument.reextract', [x['action'] for x in db.query('SELECT action FROM admin_log')])
        # ikinci çalıştırma aynı sonucu verir (tekrar çalıştırılabilir)
        r2, _ = self.reextract()
        self.assertEqual(r2.status_code, 200, r2.text)
        self.assertEqual(db.query('SELECT count(*) AS n FROM monument_person WHERE monument_id = %(m)s', dict(m=self.id))[0]['n'], 1)
        self.assertEqual(db.query('SELECT count(*) AS n FROM artwork_image')[0]['n'], 1)

    def test_rerun_skips_monuments_with_unchanged_text(self):
        import reextract
        self.assertFalse(reextract.up_to_date(self.db, CAMI))
        r, _ = self.reextract()
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(reextract.up_to_date(self.db, CAMI))             # aynı komut bu eseri atlar
        self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/3', json={'decision': 'hide'}, headers=NES)
        self.assertFalse(reextract.up_to_date(self.db, CAMI))            # metin değişti: yeniden işlenir

    def test_reextract_quota_error_is_503(self):
        import reextract
        with mock.patch.object(reextract.G, 'generate', side_effect=reextract.G.LLMError('429 RESOURCE_EXHAUSTED')):
            r = self.c.post(f'/api/admin/monuments/{CAMI}/reextract', headers=NES)
        self.assertEqual(r.status_code, 503)
        self.assertIn('kota', r.json()['detail'])
