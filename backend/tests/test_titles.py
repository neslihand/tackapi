"""Eser adları ve yinelenen kayıtlar: sarılmış başlıklar (segment), bölünmüş kayıtlar (finalize), veritabanı onarımı (fix_titles)."""
import unittest
from _testdb import needs_db, fresh_db, DSN
import segment as S
import finalize as F


def rec(k, s):
    return dict(k=k, s=s, pages=[])


def mon(title, *paras, kind='mosque', line=0):
    return dict(title_tr=title, title_en='', kind=kind, paras_tr=list(paras), ppages_tr=[[1]] * len(paras), paras_en=[],
                ppages_en=[], pages=[1, 1], heading_line=line)


class WrappedTitleTest(unittest.TestCase):
    def cluster(self, lines):
        recs = [rec('text', 'Önceki eserin metni burada bitiyor.')] + [rec('text', s) for s in lines] + \
               [rec('vletter', ch) for ch in 'İNEGÖL'] + [rec('caps', 'ÖRNEK MOSQUE'), rec('text', 'Cami, İnegöl, Kurşunlu Mahallesi içinde yer almaktadır.')]
        return [c for c in S.find_clusters(recs, 0, len(recs), 'bursa') if S.classify_cluster(c) == 'entry'][0]

    def test_parenthesis_lines_complete_the_title(self):
        c = self.cluster(['Hançerli Fatma Sultan ', '(Yıldırım-Yukarı ', 'İmaret) Camii'])
        self.assertEqual(c['tr_title_full'], 'Hançerli Fatma Sultan (Yıldırım-Yukarı İmaret) Camii')
        self.assertEqual(c['start'], 3)                       # metin sınırı eskisi gibi: yalnızca ad tamamlanır
        c = self.cluster(['Tahir Paşa', '(Tursunoğlu / Dursun Fakih)', 'Camii'])
        self.assertEqual(c['tr_title_full'], 'Tahir Paşa (Tursunoğlu / Dursun Fakih) Camii')

    def test_parenthesis_text_is_not_pulled_into_title(self):
        # kitâbe tarihi gibi parantezli bir metin satırı, üstünde başlık yoksa ada katılmaz
        c = self.cluster(['(H. 981 / M. 1573)', 'Örnek Camii'])
        self.assertIsNone(c['tr_title_full'])

    def test_caps_title_ending_with_ve_continues(self):
        self.assertEqual(S.group_caps(['DEMİRTAŞ (TİMURTAŞ) CAMİİ VE ', 'ŞADIRVANI', 'DEMİRTAŞ (TİMURTAŞ) MOSQUE AND ', 'SHADIRVAN']),
                         ['DEMİRTAŞ (TİMURTAŞ) CAMİİ VE ŞADIRVANI', 'DEMİRTAŞ (TİMURTAŞ) MOSQUE AND SHADIRVAN'])


class DuplicateRecordsTest(unittest.TestCase):
    def resolve(self, *mons):
        out, _ = F.resolve_duplicates(list(mons), 'bursa')
        return [(m['title_tr'], len(m['paras_tr']), m['paras_tr'][0][:20]) for m in out]

    def test_address_fragment_goes_to_next_monument(self):
        out = self.resolve(mon('Ali Paşa Camii Haziresi', 'Hazire caminin bahçesindedir.', 'Mezar taşları vardır.', kind='graveyard'),
                           mon('Ali Paşa Camii Haziresi', 'Osmangazi ilçesi, Yahşibey Mahallesi, Bozkurt Caddesi, No: 5’te yer almaktadır.'),
                           mon('Altıparmak Camii ve Haziresi', 'Cami, Fatih devrinde yaşamış Hoca Abdullah tarafından yaptırılmıştır.'))
        self.assertEqual(out, [('Ali Paşa Camii Haziresi', 2, 'Hazire caminin bahçe'), ('Altıparmak Camii ve Haziresi', 2, 'Osmangazi ilçesi, Ya')])

    def test_split_monument_is_merged_and_repeated_line_dropped(self):
        out = self.resolve(mon('Ulucami', 'Osmangazi ilçesi, Şehreküstü Mahallesi’nde yer almaktadır.', 'İlk büyük camidir.'),
                           mon('Ulucami', 'Büyük Cuma camileri ulucami olarak tanımlanır.', 'Yirmi kubbelidir.', 'Minberi ünlüdür.'),
                           mon('Ulucami', 'Minberi ünlüdür.'))
        self.assertEqual(out, [('Ulucami', 5, 'Osmangazi ilçesi, Şe')])

    def test_graveyard_and_other_monument_are_renamed_not_merged(self):
        out = self.resolve(mon('Nakkaş Ali Mescidi ve Haziresi', 'Mescit, Osmangazi ilçesi, Mollagürani Mahallesi’nde yer almaktadır.', 'Tek kubbelidir.'),
                           mon('Nakkaş Ali Mescidi ve Haziresi', 'Mescidin doğusundaki bu hazire taş duvarla çevrilidir.', 'Mezar taşları vardır.'))
        self.assertEqual([t for t, *_ in out], ['Nakkaş Ali Mescidi ve Haziresi', 'Nakkaş Ali Mescidi Haziresi'])
        out = self.resolve(mon('Beyazıt Paşa Camii', 'Babadağ Camii Yıldırım, Yeni Mahalle, Balabancık Caddesi, No: 23 adresinde yer almaktadır.', 'Kitabesizdir.'),
                           mon('Beyazıt Paşa Camii', 'Cami, Bayezid Paşa tarafından inşa ettirilmiştir.', 'Tek kubbelidir.'))
        self.assertEqual(out, [('Babadağ Camii', 2, 'Yıldırım, Yeni Mahal'), ('Beyazıt Paşa Camii', 2, 'Cami, Bayezid Paşa t')])

    def test_different_monuments_with_same_name_elsewhere_are_kept(self):
        out = self.resolve(mon('Muradiye Camii', 'Osmangazi ilçesi, Muradiye Mahallesi’nde yer almaktadır.', 'Külliyenin camisidir.'),
                           mon('Hamza Bey Türbesi', 'Türbe, Osmangazi ilçesi, Hamzabey Mahallesi’nde yer almaktadır.', 'Sekizgendir.', kind='tomb'),
                           mon('Muradiye Camii', 'Orhangazi ilçesi, Muradiye Mahallesi’nde konumlanmaktadır.', 'Çarşı Camii olarak da anılır.'))
        self.assertEqual(len(out), 3)


@needs_db
class FixTitlesDbTest(unittest.TestCase):
    CAMI = 'bursa-osmangazi-muradiye-camii'

    def setUp(self):
        fresh_db()
        import psycopg
        from psycopg.rows import dict_row
        import fix_titles, api
        self.FT, self.api = fix_titles, api
        self.conn = psycopg.connect(DSN, row_factory=dict_row, autocommit=True)
        self.addCleanup(self.conn.close)
        self.db = fix_titles.Tx(self.conn)
        q = self.db.execute
        # sayfa üst bilgisi tekrarıyla ikiye bölünmüş Muradiye Camii: ikinci parçanın metni, parçası, fotoğrafı, olayı ve kararı var
        q("""INSERT INTO source_section(book_id, kind, title_tr, seq, text_tr, page_map, page_start, page_end, monument_slug)
             VALUES (1, 'monument', 'Muradiye Camii', 3, 'İkinci parça.' || chr(10) || chr(10) || 'Üçüncü paragraf.',
                     '[{"p":0,"pages":[80]},{"p":1,"pages":[81]}]', 80, 81, 'bursa-osmangazi-muradiye-camii-2')""")
        q("""INSERT INTO monument(slug, city_id, district, kind, name_tr, book_id, section_id, is_synthetic, review_status, qa_flags)
             VALUES ('bursa-osmangazi-muradiye-camii-2', 1, 'Osmangazi', 'mosque', 'Muradiye Camii', 1, 3, false, 'published', '{duplicate_title}')""")
        q("UPDATE monument SET qa_flags = '{duplicate_title}' WHERE slug = %(s)s", dict(s=self.CAMI))
        self.src = self.db.query("SELECT id FROM monument WHERE slug = 'bursa-osmangazi-muradiye-camii-2'")[0]['id']
        q("""INSERT INTO chunk(section_id, book_id, seq, lang, kind, city_id, monument_id, heading_path, content, content_for_embed, content_hash, embedding)
             SELECT 3, 1, 1, 'tr', 'monument_part', 1, %(m)s, 'Bursa › Muradiye Camii', 'Üçüncü paragraf.', 'x', 'h9', embedding FROM chunk WHERE content_hash = 'h1'""",
          dict(m=self.src))
        q("""INSERT INTO image(monument_id, city_id, book_id, source, sha1, file, sort, is_cover, alt_tr, review_status)
             VALUES (%(m)s, 1, 1, 'book', 'b1', 'books/bursa-1/080-b1.webp', 1, true, 'Muradiye Camii', 'published')""", dict(m=self.src))
        q("INSERT INTO event(monument_id, city_id, kind, description_tr) VALUES (%(m)s, 1, 'repair', 'onarım')", dict(m=self.src))
        q("INSERT INTO para_fix(monument_id, para_no, decision, source) VALUES (%(m)s, 2, 'hide', 'auto')", dict(m=self.src))

    def rows(self):
        return [dict(book='bursa-1', action='birlestir', slug='bursa-osmangazi-muradiye-camii-2', keeper=self.CAMI, old_title='Muradiye Camii',
                     new_title='Muradiye Camii', reason='aynı eserin parçası', text='İkinci parça.'),
                dict(book='bursa-1', action='ad', slug='bursa-yildirim-ornek-turbesi', keeper='', old_title='Örnek Türbesi',
                     new_title='Örnek (Yeni Ad) Türbesi', reason='sarılmış başlık tamamlandı', text='', kind=None, parent=None),
                dict(book='konya-1', action='ad', slug='konya-meram-ornek-camii', keeper='', old_title='Camii',
                     new_title='Başka Ad Camii', reason='sarılmış başlık tamamlandı', text='', kind=None, parent=None)]

    def test_merge_rename_and_rerun(self):
        rows = self.rows()
        self.FT.check_db(self.db, rows)
        self.assertEqual([r['status'] for r in rows], ['uygulanacak', 'uygulanacak', 'atla: ad daha önce düzeltilmiş'])
        with self.conn.transaction():
            stats = self.FT.apply(self.db, rows)
        self.assertEqual(dict(stats), {'birlestir': 1, 'ad': 1})
        one = lambda sql, **p: self.db.query(sql, p)[0]
        # kitap metni kitaptaki sırasıyla birleşti; sayfa haritası kaydı
        sec = one("SELECT text_tr, page_map, page_end FROM source_section WHERE id = 1")
        self.assertEqual(sec['text_tr'], 'Örnek metin.\n\nİkinci parça.\n\nÜçüncü paragraf.')
        self.assertEqual([e['p'] for e in sec['page_map']][-2:], [1, 2])
        # parça (embedding'iyle), olay, fotoğraf ve paragraf kararı taşındı
        ch = one("SELECT monument_id, section_id, seq, embedding IS NOT NULL AS emb FROM chunk WHERE content_hash = 'h9'")
        self.assertEqual((ch['monument_id'], ch['section_id'], ch['emb']), (2, 1, True))
        self.assertGreater(ch['seq'], 1)
        img = one("SELECT monument_id, edited, is_cover FROM image WHERE sha1 = 'b1'")
        self.assertEqual((img['monument_id'], img['edited'], img['is_cover']), (2, True, False))   # kapak tek kalır
        self.assertEqual(one("SELECT count(*) AS n FROM event WHERE monument_id = 2")['n'], 1)
        self.assertEqual(one("SELECT monument_id, para_no FROM para_fix")['para_no'], 3)          # P2 → birleşik metinde P3
        # boşalan kayıt silinmedi, taslağa alındı; yinelenen ad bayrağı kalktı
        src = one("SELECT review_status, qa_flags FROM monument WHERE id = %(i)s", i=self.src)
        self.assertEqual((src['review_status'], src['qa_flags']), ('draft', ['merged']))
        self.assertEqual(one("SELECT qa_flags FROM monument WHERE id = 2")['qa_flags'], [])
        self.assertEqual(one("SELECT name_tr FROM monument WHERE slug = 'bursa-yildirim-ornek-turbesi'")['name_tr'], 'Örnek (Yeni Ad) Türbesi')
        self.assertEqual(one("SELECT name_tr FROM monument WHERE slug = 'konya-meram-ornek-camii'")['name_tr'], 'Örnek Camii')
        # ziyaretçi birleşik metni görür; taşınan 'gizle' kararı yeni numarasıyla geçerli; boşalan kayıt listede yok
        from fastapi.testclient import TestClient
        c = TestClient(self.api.app)
        text = c.get(f'/api/monuments/{self.CAMI}').json()['text']
        self.assertEqual(text, 'Örnek metin.' + chr(10) * 2 + 'İkinci parça.')
        self.assertEqual(c.get('/api/monuments/bursa-osmangazi-muradiye-camii-2').status_code, 404)
        self.assertEqual({r['action'] for r in self.db.query("SELECT action FROM admin_log WHERE actor = 'fix_titles'")},
                         {'monument.merge', 'monument.rename'})
        # tekrar çalıştırılabilir: ikinci turda yapılacak bir şey kalmaz
        rows = self.rows()
        self.FT.check_db(self.db, rows)
        self.assertEqual([r['status'] for r in rows], ['yapıldı', 'yapıldı', 'atla: ad daha önce düzeltilmiş'])

    def test_failed_merge_changes_nothing(self):
        rows = self.rows()[:1]
        rows[0]['keeper'] = 'bursa-gizli-sentetik'                 # metni olmayan kayıt: birleştirme hata verir
        self.FT.check_db(self.db, rows)
        with self.assertRaises(ValueError):
            with self.conn.transaction():
                self.FT.apply(self.db, rows)
        self.assertEqual(self.db.query("SELECT review_status FROM monument WHERE id = %(i)s", dict(i=self.src))[0]['review_status'], 'published')


if __name__ == '__main__':
    unittest.main()
